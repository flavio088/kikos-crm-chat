import {
  Conflict,
  CrmConflictError,
  type CrmOpportunityFileId,
  type CrmOpportunityId,
  ForbiddenError,
  type Opportunity,
} from "@crm-chat/domain";
import { Effect, Option } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { DEFAULT_TTL } from "../Config";
import { ApiRuntime, CrmApiClient } from "../client";
import { withToast } from "../withToast";

export const opportunityKeys = ["opportunities"];

export const opportunityBoardAtom = ApiRuntime.atom(
  Effect.gen(function* () {
    const client = yield* CrmApiClient;
    const response = yield* client.crmOpportunities.board();
    return response.data;
  }),
).pipe(Atom.withReactivity(opportunityKeys), Atom.setIdleTTL(DEFAULT_TTL));

export const opportunityAtom = Atom.family((id: CrmOpportunityId.Id) =>
  ApiRuntime.atom(
    Effect.gen(function* () {
      const client = yield* CrmApiClient;
      const response = yield* client.crmOpportunities.get({ params: { id } });
      return response.data;
    }),
  ).pipe(Atom.withReactivity([...opportunityKeys, id]), Atom.setIdleTTL(DEFAULT_TTL)),
);

export const setOpportunityStageAtom = ApiRuntime.fn(
  Effect.fnUntraced(
    function* (input: { readonly id: CrmOpportunityId.Id; readonly stage: Opportunity.Stage }) {
      const client = yield* CrmApiClient;
      yield* client.crmOpportunities.setStage({
        params: { id: input.id },
        payload: { stage: input.stage },
      });
    },
    withToast({
      onWaiting: "Movendo…",
      onSuccess: "Etapa atualizada.",
      onFailure: "Não foi possível mover a oportunidade.",
    }),
  ),
  { reactivityKeys: opportunityKeys },
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
  { reactivityKeys: opportunityKeys },
);

const ATTACHMENT_CONFLICTS: Record<Conflict.Attachment, string> = {
  media_type_not_accepted: "Formato não aceito. Envie PDF, JPG, PNG ou WebP",
  content_mismatch: "O conteúdo do arquivo não corresponde ao tipo informado",
  attachment_limit_reached:
    "Esta oportunidade já tem 20 arquivos. Remova algum antes de anexar outro.",
};

const uploadFailure = (error: Option.Option<unknown>): string => {
  const value = Option.getOrUndefined(error);
  if (value instanceof ForbiddenError) return "Você não tem acesso a esta oportunidade.";
  if (value instanceof CrmConflictError && Conflict.isAttachment(value.reason)) {
    return ATTACHMENT_CONFLICTS[value.reason];
  }
  return "Não foi possível enviar o arquivo.";
};

export const uploadOpportunityFileAtom = ApiRuntime.fn(
  Effect.fnUntraced(
    function* (input: { readonly id: CrmOpportunityId.Id; readonly file: globalThis.File }) {
      const client = yield* CrmApiClient;
      const payload = new FormData();
      payload.set("file", input.file);
      yield* client.crmOpportunities.attachFile({ params: { id: input.id }, payload });
    },
    withToast({
      onWaiting: "Enviando arquivo…",
      onSuccess: "Arquivo enviado.",
      onFailure: uploadFailure,
    }),
  ),
  { reactivityKeys: opportunityKeys },
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
    ).pipe(Atom.withReactivity([opportunityId, fileId]), Atom.setIdleTTL(DEFAULT_TTL)),
  ),
);

export const opportunityFileContentAtom = (
  opportunityId: CrmOpportunityId.Id,
  fileId: CrmOpportunityFileId.Id,
) => opportunityFileContentAtoms(opportunityId)(fileId);

export const downloadOpportunityFileAtom = ApiRuntime.fn(
  Effect.fnUntraced(
    function* (input: {
      readonly opportunityId: CrmOpportunityId.Id;
      readonly fileId: CrmOpportunityFileId.Id;
      readonly filename: string;
      readonly mediaType: string;
    }) {
      const client = yield* CrmApiClient;
      const content = yield* client.crmOpportunities.fileContent({
        params: { id: input.opportunityId, fileId: input.fileId },
      });
      yield* Effect.sync(() => {
        const url = URL.createObjectURL(new Blob([content as BlobPart], { type: input.mediaType }));
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
      readonly id: CrmOpportunityId.Id;
      readonly fileId: CrmOpportunityFileId.Id;
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
  { reactivityKeys: opportunityKeys },
);
