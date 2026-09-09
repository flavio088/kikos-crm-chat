import { expect, layer } from "@effect/vitest";
import { Policy } from "@crm-chat/domain";
import { Effect, Layer, Option } from "effect";
import { Database } from "../db";
import * as ContactPersistence from "../persistence/Contact";
import * as ConversationPersistence from "../persistence/Conversation";
import * as ConversationMessagePersistence from "../persistence/ConversationMessage";
import * as OpportunityPersistence from "../persistence/Opportunity";
import * as OpportunityEventPersistence from "../persistence/OpportunityEvent";
import * as OpportunityFilePersistence from "../persistence/OpportunityFile";
import * as OpportunityFileContentPersistence from "../persistence/OpportunityFileContent";
import * as OpportunityNotePersistence from "../persistence/OpportunityNote";
import { ensureSeeded } from "../seed";
import { type CrmActor, CrmConflictError, CrmNotFoundError } from "./errors";
import * as OpportunityService from "./Opportunity";

const DatabaseTest = Layer.effectDiscard(Database.migrateToLatest).pipe(
  Layer.provideMerge(Database.layerPglite("memory://")),
);

const RepositoriesTest = Layer.mergeAll(
  ContactPersistence.layerSql,
  OpportunityPersistence.layerSql,
  OpportunityEventPersistence.layerSql,
  OpportunityNotePersistence.layerSql,
  OpportunityFilePersistence.layerSql,
  OpportunityFileContentPersistence.layerSql,
  ConversationPersistence.layerSql,
  ConversationMessagePersistence.layerSql,
);

const ServicesTest = OpportunityService.layer.pipe(
  Layer.provideMerge(RepositoriesTest),
  Layer.provideMerge(DatabaseTest),
);

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

const png = (filename: string): OpportunityService.OpportunityFileInput => ({
  filename,
  content: { mediaType: "image/png", data: PNG_BYTES },
});

const filesIn = (detail: OpportunityService.OpportunityDetail) =>
  detail.timeline.flatMap((entry) => (entry.kind === "file" ? [entry.file] : []));

const at = <A>(items: ReadonlyArray<A>, index: number): A => {
  const item = items[index];
  if (item === undefined) throw new Error(`Faltou o item ${index}`);
  return item;
};

const setup = Effect.gen(function* () {
  const { user } = yield* ensureSeeded;
  const actor: CrmActor = { principal: user, ability: Policy.allowAll };
  const service = yield* OpportunityService.CrmOpportunityService;
  const opportunities = yield* OpportunityPersistence.Repository;
  const seeded = (yield* opportunities.all()).sort((a, b) => a.id.localeCompare(b.id));
  return { actor, service, seeded };
});

layer(ServicesTest, { excludeTestServices: true })("crm opportunity files", (it) => {
  it.effect("um anexo entra na timeline e os bytes ficam guardados ao lado", () =>
    Effect.gen(function* () {
      const { actor, service, seeded } = yield* setup;
      const target = at(seeded, 0);

      const detail = yield* service.attachFile(actor, target.id, png("planta.png"));

      const attached = filesIn(detail);
      expect(attached).toHaveLength(1);
      const file = at(attached, 0);
      expect(file.filename).toBe("planta.png");
      expect(file.opportunityId).toBe(target.id);
      expect(file.mediaType).toBe("image/png");
      expect(file.sizeBytes).toBe(PNG_BYTES.byteLength);
      expect(file.authorId).toBe(actor.principal.id);

      const contents = yield* OpportunityFileContentPersistence.Repository;
      const stored = Option.getOrUndefined(yield* contents.findByFileId(file.id));
      expect(stored === undefined ? undefined : Array.from(stored)).toEqual(Array.from(PNG_BYTES));
    }),
  );

  it.effect("conteúdo que não bate com o tipo declarado é recusado antes de gravar", () =>
    Effect.gen(function* () {
      const { actor, service, seeded } = yield* setup;
      const target = at(seeded, 1);

      const refused = yield* Effect.flip(
        service.attachFile(actor, target.id, {
          filename: "planta.pdf",
          content: { mediaType: "application/pdf", data: PNG_BYTES },
        }),
      );

      expect(refused).toBeInstanceOf(CrmConflictError);
      expect(refused instanceof CrmConflictError ? refused.reason : undefined).toBe(
        "content_mismatch",
      );
      const detail = yield* service.detail(actor, target.id);
      expect(filesIn(detail)).toHaveLength(0);
    }),
  );

  it.effect("os bytes voltam pelo serviço com o id e o nome do anexo", () =>
    Effect.gen(function* () {
      const { actor, service, seeded } = yield* setup;
      const target = at(seeded, 2);

      const detail = yield* service.attachFile(actor, target.id, png("fachada.png"));
      const file = at(filesIn(detail), 0);
      const served = yield* service.fileContent(actor, target.id, file.id);

      expect(served.file.id).toBe(file.id);
      expect(served.file.filename).toBe("fachada.png");
      expect(Array.from(served.data)).toEqual(Array.from(PNG_BYTES));
    }),
  );

  it.effect("mudar a etapa registra um evento no histórico", () =>
    Effect.gen(function* () {
      const { actor, service, seeded } = yield* setup;
      const target = at(seeded, 0);
      const before = yield* service.detail(actor, target.id);
      const next = target.stage === "proposta" ? "ganho" : "proposta";

      const detail = yield* service.setStage(actor, target.id, next);

      const staged = detail.timeline.flatMap((entry) =>
        entry.kind === "event" && entry.event.kind === "staged" ? [entry.event] : [],
      );
      expect(staged).toHaveLength(1);
      expect(at(staged, 0)).toMatchObject({ from: target.stage, to: next, authorId: actor.principal.id });
      expect(detail.timeline).toHaveLength(before.timeline.length + 1);
    }),
  );

  it.effect("id de arquivo de outra oportunidade responde não encontrado, nunca é servido", () =>
    Effect.gen(function* () {
      const { actor, service, seeded } = yield* setup;
      const mine = at(seeded, 3);
      const theirs = at(seeded, 4);

      const detail = yield* service.attachFile(actor, mine.id, png("contrato.png"));
      const file = at(filesIn(detail), 0);
      yield* service.detail(actor, theirs.id);

      const refused = yield* Effect.flip(service.fileContent(actor, theirs.id, file.id));
      expect(refused).toBeInstanceOf(CrmNotFoundError);
      expect(refused instanceof CrmNotFoundError ? refused.reason : undefined).toBe(
        "opportunity_not_found",
      );
      expect(refused.message).toContain(file.id);

      const served = yield* service.fileContent(actor, mine.id, file.id);
      expect(served.file.id).toBe(file.id);
    }),
  );
});
