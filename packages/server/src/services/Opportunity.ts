import type {
  Contact,
  CrmOpportunityFileId,
  CrmOpportunityId,
  OpportunityTimelineEntry,
} from "@crm-chat/domain";
import {
  File as PrimitiveFile,
  Opportunity,
  OpportunityEvent,
  OpportunityFile,
  OpportunityNote,
} from "@crm-chat/domain";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import * as ContactPersistence from "../persistence/Contact";
import * as OpportunityPersistence from "../persistence/Opportunity";
import * as OpportunityEventPersistence from "../persistence/OpportunityEvent";
import * as OpportunityFilePersistence from "../persistence/OpportunityFile";
import * as OpportunityFileContentPersistence from "../persistence/OpportunityFileContent";
import * as OpportunityNotePersistence from "../persistence/OpportunityNote";
import {
  type CrmActor,
  CrmConflictError,
  CrmForbiddenError,
  CrmNotFoundError,
} from "./errors";

export const MAX_OPPORTUNITY_FILES = 20;

export class CrmOpportunityError extends Schema.TaggedError<CrmOpportunityError>()(
  "Services.Crm.Opportunity.Error",
  { message: Schema.String },
) {}

export type CrmOpportunityFailure =
  | CrmOpportunityError
  | CrmForbiddenError
  | CrmNotFoundError
  | CrmConflictError;

export type OpportunityCard = {
  readonly opportunity: Opportunity.Opportunity;
  readonly contact: Contact.Contact;
};

export type OpportunityDetail = OpportunityCard & {
  readonly timeline: ReadonlyArray<OpportunityTimelineEntry>;
};

export type OpportunityFileInput = {
  readonly filename: string;
  readonly content: PrimitiveFile.File;
};

export type OpportunityFileContent = {
  readonly file: OpportunityFile.OpportunityFile;
  readonly data: Uint8Array;
};

export interface ICrmOpportunityService {
  readonly board: (actor: CrmActor) => Effect.Effect<OpportunityCard[], CrmOpportunityFailure>;
  readonly detail: (
    actor: CrmActor,
    id: CrmOpportunityId.Id,
  ) => Effect.Effect<OpportunityDetail, CrmOpportunityFailure>;
  readonly setStage: (
    actor: CrmActor,
    id: CrmOpportunityId.Id,
    stage: Opportunity.Stage,
  ) => Effect.Effect<OpportunityDetail, CrmOpportunityFailure>;
  readonly addNote: (
    actor: CrmActor,
    id: CrmOpportunityId.Id,
    body: string,
  ) => Effect.Effect<OpportunityDetail, CrmOpportunityFailure>;
  readonly attachFile: (
    actor: CrmActor,
    id: CrmOpportunityId.Id,
    input: OpportunityFileInput,
  ) => Effect.Effect<OpportunityDetail, CrmOpportunityFailure>;
  readonly fileContent: (
    actor: CrmActor,
    id: CrmOpportunityId.Id,
    fileId: CrmOpportunityFileId.Id,
  ) => Effect.Effect<OpportunityFileContent, CrmOpportunityFailure>;
  readonly detachFile: (
    actor: CrmActor,
    id: CrmOpportunityId.Id,
    fileId: CrmOpportunityFileId.Id,
  ) => Effect.Effect<OpportunityDetail, CrmOpportunityFailure>;
}

export class CrmOpportunityService extends Context.Service<
  CrmOpportunityService,
  ICrmOpportunityService
>()("@crm-chat/server/services/Opportunity/CrmOpportunityService") {}

const failed = Effect.mapError(
  (e: { readonly message: string }) => new CrmOpportunityError({ message: e.message }),
);

const timelineOf = (
  notes: ReadonlyArray<OpportunityNote.OpportunityNote>,
  events: ReadonlyArray<OpportunityEvent.OpportunityEvent>,
  files: ReadonlyArray<OpportunityFile.OpportunityFile>,
): ReadonlyArray<OpportunityTimelineEntry> =>
  [
    ...notes.map((note) => ({ kind: "note" as const, at: note.createdAt, note })),
    ...events.map((event) => ({ kind: "event" as const, at: event.createdAt, event })),
    ...files.map((file) => ({ kind: "file" as const, at: file.createdAt, file })),
  ].sort((a, b) => DateTime.toEpochMillis(a.at) - DateTime.toEpochMillis(b.at));

export const make = Effect.gen(function* () {
  const opportunities = yield* OpportunityPersistence.Repository;
  const contacts = yield* ContactPersistence.Repository;
  const events = yield* OpportunityEventPersistence.Repository;
  const notes = yield* OpportunityNotePersistence.Repository;
  const files = yield* OpportunityFilePersistence.Repository;
  const contents = yield* OpportunityFileContentPersistence.Repository;

  const requireOpportunity = Effect.fn("requireOpportunity")(function* (id: CrmOpportunityId.Id) {
    const found = yield* opportunities.findById(id).pipe(failed);
    if (Option.isNone(found)) {
      return yield* Effect.fail(
        new CrmNotFoundError({ reason: "opportunity_not_found", message: `No crm opportunity ${id}` }),
      );
    }
    return found.value;
  });

  const requireContact = Effect.fn("requireContact")(function* (opportunity: Opportunity.Opportunity) {
    const found = yield* contacts.findById(opportunity.contactId).pipe(failed);
    if (Option.isNone(found)) {
      return yield* Effect.fail(
        new CrmNotFoundError({
          reason: "contact_not_found",
          message: `No crm contact ${opportunity.contactId}`,
        }),
      );
    }
    return found.value;
  });

  const requireFile = Effect.fn("requireFile")(function* (
    opportunity: Opportunity.Opportunity,
    fileId: CrmOpportunityFileId.Id,
  ) {
    const found = yield* files.findById(fileId).pipe(failed);
    if (Option.isNone(found) || found.value.opportunityId !== opportunity.id) {
      return yield* Effect.fail(
        new CrmNotFoundError({
          reason: "opportunity_not_found",
          message: `No crm opportunity file ${fileId}`,
        }),
      );
    }
    return found.value;
  });

  const detailOf = Effect.fn("detailOf")(function* (
    opportunity: Opportunity.Opportunity,
    contact: Contact.Contact,
  ) {
    const [written, logged, attached] = yield* Effect.all([
      notes.forOpportunity(opportunity.id),
      events.forOpportunity(opportunity.id),
      files.forOpportunity(opportunity.id),
    ]).pipe(failed);
    return { opportunity, contact, timeline: timelineOf(written, logged, attached) };
  });

  const board: ICrmOpportunityService["board"] = Effect.fn("board")(function* () {
    const [all, people] = yield* Effect.all([opportunities.all(), contacts.all()]).pipe(failed);
    const byId = new Map(people.map((contact) => [contact.id, contact]));
    return all.flatMap((opportunity) => {
      const contact = byId.get(opportunity.contactId);
      return contact === undefined ? [] : [{ opportunity, contact }];
    });
  });

  const detail: ICrmOpportunityService["detail"] = Effect.fn("detail")(function* (_actor, id) {
    const opportunity = yield* requireOpportunity(id);
    const contact = yield* requireContact(opportunity);
    return yield* detailOf(opportunity, contact);
  });

  const setStage: ICrmOpportunityService["setStage"] = Effect.fn("setStage")(function* (
    actor,
    id,
    stage,
  ) {
    const current = yield* requireOpportunity(id);
    const contact = yield* requireContact(current);
    const now = yield* DateTime.now;
    const opportunity = yield* opportunities
      .save(new Opportunity.Opportunity({ ...current, stage, updatedAt: now }))
      .pipe(failed);
    if (current.stage !== stage) {
      yield* events
        .save(
          yield* OpportunityEvent.make({
            opportunityId: opportunity.id,
            kind: "staged",
            from: current.stage,
            to: stage,
            authorId: actor.principal.id,
          }).pipe(failed),
        )
        .pipe(failed);
    }
    return yield* detailOf(opportunity, contact);
  });

  const addNote: ICrmOpportunityService["addNote"] = Effect.fn("addNote")(function* (
    actor,
    id,
    body,
  ) {
    const opportunity = yield* requireOpportunity(id);
    const contact = yield* requireContact(opportunity);
    yield* notes
      .save(
        yield* OpportunityNote.make({
          opportunityId: opportunity.id,
          body,
          authorId: actor.principal.id,
        }).pipe(failed),
      )
      .pipe(failed);
    return yield* detailOf(opportunity, contact);
  });

  const attachFile: ICrmOpportunityService["attachFile"] = Effect.fn("attachFile")(function* (
    actor,
    id,
    input,
  ) {
    const opportunity = yield* requireOpportunity(id);
    const contact = yield* requireContact(opportunity);
    if (!PrimitiveFile.hasValidContent(input.content)) {
      return yield* Effect.fail(
        new CrmConflictError({
          reason: "content_mismatch",
          message: "O conteúdo do arquivo não corresponde ao tipo informado",
        }),
      );
    }
    const held = yield* files.forOpportunity(opportunity.id).pipe(failed);
    if (held.length >= MAX_OPPORTUNITY_FILES) {
      return yield* Effect.fail(
        new CrmConflictError({
          reason: "attachment_limit_reached",
          message: `Esta oportunidade já tem ${MAX_OPPORTUNITY_FILES} arquivos. Remova algum antes de anexar outro.`,
        }),
      );
    }
    const file = yield* files
      .save(
        yield* OpportunityFile.make({
          opportunityId: opportunity.id,
          filename: input.filename,
          content: input.content,
          authorId: actor.principal.id,
        }).pipe(failed),
      )
      .pipe(failed);
    yield* contents.save(file.id, input.content.data).pipe(failed);
    return yield* detailOf(opportunity, contact);
  });

  const fileContent: ICrmOpportunityService["fileContent"] = Effect.fn("fileContent")(function* (
    _actor,
    id,
    fileId,
  ) {
    const opportunity = yield* requireOpportunity(id);
    const file = yield* requireFile(opportunity, fileId);
    const stored = yield* contents.findByFileId(file.id).pipe(failed);
    if (Option.isNone(stored)) {
      return yield* Effect.fail(
        new CrmNotFoundError({
          reason: "opportunity_not_found",
          message: `No content stored for crm opportunity file ${file.id}`,
        }),
      );
    }
    return { file, data: stored.value };
  });

  const detachFile: ICrmOpportunityService["detachFile"] = Effect.fn("detachFile")(function* (
    _actor,
    id,
    fileId,
  ) {
    const opportunity = yield* requireOpportunity(id);
    const contact = yield* requireContact(opportunity);
    const file = yield* requireFile(opportunity, fileId);
    yield* contents.remove(file.id).pipe(failed);
    yield* files.remove(file).pipe(failed);
    return yield* detailOf(opportunity, contact);
  });

  return CrmOpportunityService.of({
    board,
    detail,
    setStage,
    addNote,
    attachFile,
    fileContent,
    detachFile,
  });
});

export const layer = Layer.effect(CrmOpportunityService)(make);
