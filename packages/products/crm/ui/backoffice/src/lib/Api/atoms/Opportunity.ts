import { authenticationKeys } from "@kikos/auth-backoffice";
import {
  CrmConflictError,
  CrmNotFoundError,
  type OpportunityCard,
  type OpportunityCreation,
  type OpportunityDetail,
  type OpportunitySummary,
} from "@kikos/crm-contracts";
import { Conflict, Missing, type Opportunity } from "@kikos/crm-core";
import type { CrmDestinationId, CrmOpportunityId,CrmOpportunityFileId, UserId } from "@kikos/effect-identity";
import { ForbiddenError } from "@kikos/primitives";
import { withToast } from "@kikos/ui-backoffice";
import { Effect, Exit, Option } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { DEFAULT_TTL } from "../../Config";
import {
  toCreateOpportunityPayload,
  toGetOpportunitiesQuery,
  type CreateOpportunityInput,
  type OpportunityQuery,
} from "../../Opportunity";
import { ApiRuntime, CrmApiClient } from "../client";

export const opportunityKeys = ["opportunities", ...authenticationKeys];

export const opportunityMutationKeys = ["opportunities"];

export const opportunitiesAtom = Atom.family((query: OpportunityQuery) =>
  ApiRuntime.atom(
    Effect.gen(function* () {
      const client = yield* CrmApiClient;
      return yield* client.crmOpportunities.all({ query: toGetOpportunitiesQuery(query) });
    }),
  ).pipe(Atom.withReactivity([...opportunityKeys, query]), Atom.setIdleTTL(DEFAULT_TTL)),
);

export const opportunityAtom = Atom.family((id: CrmOpportunityId.Id) =>
  ApiRuntime.atom(
    Effect.gen(function* () {
      const client = yield* CrmApiClient;
      const detail = yield* client.crmOpportunities.get({ params: { id } });
      return detail.data;
    }),
  ).pipe(Atom.withReactivity([...opportunityKeys, id]), Atom.setIdleTTL(DEFAULT_TTL)),
);

export const opportunityBoardAtom = Atom.family((destinationId: CrmDestinationId.Id | undefined) =>
  ApiRuntime.atom(
    Effect.gen(function* () {
      const client = yield* CrmApiClient;
      const board = yield* client.crmOpportunities.board({ query: { destinationId } });
      return board.data;
    }),
  ).pipe(
    Atom.withReactivity([...opportunityKeys, ...(destinationId === undefined ? [] : [destinationId])]),
    Atom.setIdleTTL(DEFAULT_TTL),
  ),
);

export const opportunityColumnAtom = ApiRuntime.fn(
  Effect.fnUntraced(function* ({
    destinationId,
    stage,
    offset,
    limit,
    onLoaded,
  }: {
    readonly destinationId: CrmDestinationId.Id | undefined;
    readonly stage: Opportunity.Stage.Stage;
    readonly offset: number;
    readonly limit: number;
    readonly onLoaded: (opportunities: ReadonlyArray<OpportunityCard>) => void;
  }) {
    const client = yield* CrmApiClient;
    const column = yield* client.crmOpportunities.column({
      query: { destinationId, stage, offset, limit },
    });
    yield* Effect.sync(() => onLoaded(column.data.opportunities));
    return column.data;
  }),
);

const creationToast: Record<OpportunityCreation["outcome"], string> = {
  created: "Oportunidade cadastrada.",
  deduplicated: "Já existe uma oportunidade aberta para esse contato.",
  already_handled: "Este contato já está em atendimento.",
};

export const createOpportunityAtom = ApiRuntime.fn(
  Effect.fnUntraced(
    function* ({
      input,
      separateOpportunity,
      onOutcome,
    }: {
      readonly input: CreateOpportunityInput;
      readonly separateOpportunity: boolean;
      readonly onOutcome: (creation: OpportunityCreation) => void;
    }) {
      const client = yield* CrmApiClient;
      const created = yield* client.crmOpportunities.create({
        payload: toCreateOpportunityPayload(input, separateOpportunity),
      });
      yield* Effect.sync(() => onOutcome(created.data));
      return created.data.outcome;
    },
    withToast({
      onWaiting: "Cadastrando a oportunidade…",
      onSuccess: (outcome: OpportunityCreation["outcome"]) => creationToast[outcome],
      onFailure: "Não foi possível cadastrar a oportunidade.",
    }),
  ),
  { reactivityKeys: opportunityMutationKeys },
);

export const noteDraftAtom = Atom.family((_: CrmOpportunityId.Id) => Atom.make(""));

export const addOpportunityNoteAtom = ApiRuntime.fn(
  Effect.fnUntraced(
    function* (id: CrmOpportunityId.Id, get: Atom.FnContext) {
      const body = get(noteDraftAtom(id)).trim();
      const client = yield* CrmApiClient;
      yield* client.crmOpportunities.addNote({ params: { id }, payload: { body } });
      get.set(noteDraftAtom(id), "");
    },
    withToast({
      onWaiting: "Salvando a nota…",
      onSuccess: "Nota salva.",
      onFailure: "Não foi possível salvar a nota.",
    }),
  ),
  { reactivityKeys: opportunityMutationKeys },
);

const opportunityFileContentAtoms = Atom.family((opportunityId: CrmOpportunityId.Id) =>
  Atom.family((fileId: CrmOpportunityFileId.Id) =>
    ApiRuntime.atom(
      Effect.gen(function* () {
        const client = yield* CrmApiClient;
        return yield* client.crmOpportunities.fileContent({
          params: { id: opportunityId, fileId },
        });
      }),
    ).pipe(
      Atom.withReactivity([...opportunityKeys, opportunityId, fileId]),
      Atom.setIdleTTL(DEFAULT_TTL),
    ),
  ),
);

export const opportunityFileContentAtom = (
  opportunityId: CrmOpportunityId.Id,
  fileId: CrmOpportunityFileId.Id,
) => opportunityFileContentAtoms(opportunityId)(fileId);


export const uploadOpportunityFileAtom = ApiRuntime.fn(
  Effect.fnUntraced(
    function* (input: { id: CrmOpportunityId.Id; file: globalThis.File }) {
      const client = yield* CrmApiClient;
      const payload = new FormData();
      payload.set("file", input.file);
      yield* client.crmOpportunities.attachFile({ params: { id: input.id }, payload });
    },
    withToast({
      onWaiting: "Enviando arquivo…",
      onSuccess: "Arquivo enviado.",
      onFailure: "Não foi possível enviar o arquivo.",
    }),
  ),
  { reactivityKeys: opportunityMutationKeys },
);

export const downloadOpportunityFileAtom = ApiRuntime.fn(
  Effect.fnUntraced(
    function* (input: {
      opportunityId: CrmOpportunityId.Id;
      fileId: CrmOpportunityFileId.Id;
      filename: string;
      mediaType: string;
    }) {
      const client = yield* CrmApiClient;
      const content = yield* client.crmOpportunities.fileContent({
        params: { id: input.opportunityId, fileId: input.fileId },
      });
      yield* Effect.sync(() => {
        const fileBytes = content as BlobPart;
        const url = URL.createObjectURL(new Blob([fileBytes], { type: input.mediaType }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = input.filename;
        anchor.click();
        URL.revokeObjectURL(url);
      });
    },
    withToast({
      onWaiting: "Baixando arquivo…",
      onSuccess: "Download iniciado.",
      onFailure: "Não foi possível baixar o arquivo.",
    }),
  ),
);

export const detachOpportunityFileAtom = ApiRuntime.fn(
  Effect.fnUntraced(
    function* (input: {
      id: CrmOpportunityId.Id;
      fileId: CrmOpportunityFileId.Id;
    }) {
      const client = yield* CrmApiClient;
      yield* client.crmOpportunities.detachFile({
        params: { id: input.id, fileId: input.fileId },
      });
    },
    withToast({
      onWaiting: "Removendo arquivo…",
      onSuccess: "Arquivo removido.",
      onFailure: "Não foi possível remover o arquivo.",
    }),
  ),
  { reactivityKeys: opportunityMutationKeys },
);

const PLACING_MISSING: Record<Missing.Placing, string> = {
  opportunity_not_found: "Esta oportunidade não existe mais. Volte para a lista e abra outra.",
  destination_not_found: "Esta loja não existe mais. Escolha outra.",
  membership_not_found:
    "Esta pessoa não trabalha nesta loja. Escolha alguém do rodízio dela, ou deixe a loja receber sem dono.",
};

const routingFailure =
  (fallback: string) =>
  (error: Option.Option<unknown>): string => {
    const value = Option.getOrUndefined(error);
    if (value instanceof ForbiddenError) {
      return "Só um administrador encaminha uma oportunidade para outra loja.";
    }
    if (value instanceof CrmNotFoundError) {
      return Missing.isPlacing(value.reason) ? PLACING_MISSING[value.reason] : fallback;
    }
    return fallback;
  };

export const distributeOpportunityAtom = ApiRuntime.fn(
  Effect.fnUntraced(
    function* (id: CrmOpportunityId.Id) {
      const client = yield* CrmApiClient;
      const detail = yield* client.crmOpportunities.distribute({ params: { id } });
      return detail.data;
    },
    withToast({
      onWaiting: "Distribuindo a oportunidade…",
      onSuccess: (detail: OpportunityDetail) =>
        detail.placement === undefined
          ? "Nenhuma loja pôde receber esta oportunidade. Ela continua sem destino."
          : "Oportunidade encaminhada.",
      onFailure: routingFailure("Não foi possível distribuir a oportunidade."),
    }),
  ),
  { reactivityKeys: opportunityMutationKeys },
);

export const placeOpportunityAtom = ApiRuntime.fn(
  Effect.fnUntraced(
    function* ({
      id,
      destinationId,
      userId,
    }: {
      readonly id: CrmOpportunityId.Id;
      readonly destinationId: CrmDestinationId.Id;
      readonly userId?: UserId.Id;
    }) {
      const client = yield* CrmApiClient;
      const detail = yield* client.crmOpportunities.placement({
        params: { id },
        payload: { destinationId, userId },
      });
      return detail.data;
    },
    withToast({
      onWaiting: "Encaminhando a oportunidade…",
      onSuccess: "Oportunidade encaminhada.",
      onFailure: routingFailure("Não foi possível encaminhar a oportunidade."),
    }),
  ),
  { reactivityKeys: opportunityMutationKeys },
);

export const STAGE_CONFLICTS: Record<Conflict.Stage, string> = {
  opportunity_stage_refused: "Esta oportunidade já saiu do funil e não muda mais de etapa.",
  opportunity_lost: "Esta oportunidade foi marcada como perdida e não recebe orçamento.",
};

const OPPORTUNITY_MISSING: Record<Missing.Opportunity, string> = {
  opportunity_not_found: "Esta oportunidade não existe mais. Volte para a lista e abra outra.",
};

const stageFailure =
  (fallback: string) =>
  (error: Option.Option<unknown>): string => {
    const value = Option.getOrUndefined(error);
    if (value instanceof ForbiddenError) return "Você não tem acesso a esta oportunidade.";
    if (value instanceof CrmNotFoundError) {
      return Missing.isOpportunity(value.reason) ? OPPORTUNITY_MISSING[value.reason] : fallback;
    }
    if (value instanceof CrmConflictError) {
      return Conflict.isStage(value.reason) ? STAGE_CONFLICTS[value.reason] : fallback;
    }
    return fallback;
  };

export const moveOpportunityStageAtom = ApiRuntime.fn(
  Effect.fnUntraced(
    function* ({
      id,
      to,
      onSettled,
    }: {
      readonly id: CrmOpportunityId.Id;
      readonly to: Opportunity.Stage.Target;
      readonly onSettled: (succeeded: boolean) => void;
    }) {
      const client = yield* CrmApiClient;
      const moved = yield* client.crmOpportunities
        .stage({ params: { id }, payload: { stage: to } })
        .pipe(Effect.onExit((exit) => Effect.sync(() => onSettled(Exit.isSuccess(exit)))));
      return moved.data;
    },
    withToast({
      onWaiting: "Movendo a oportunidade…",
      onSuccess: (summary: OpportunitySummary) =>
        summary.stage === "lost" ? "Oportunidade marcada como perdida." : "Oportunidade movida.",
      onFailure: stageFailure("Não foi possível mover a oportunidade."),
    }),
  ),
  { reactivityKeys: opportunityMutationKeys },
);
