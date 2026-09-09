import { Conflict, CrmConflictError, type CrmContactId, ForbiddenError } from "@crm-chat/domain";
import { Atom } from "effect/unstable/reactivity";
import { Effect, Option } from "effect";
import { DEFAULT_TTL } from "../Config";
import { ApiRuntime, CrmApiClient } from "../client";
import { withToast } from "../withToast";

export const conversationKeys = ["conversations"];

export const conversationMutationKeys = ["conversations"];

export const conversationAtom = Atom.family((contactId: CrmContactId.Id) =>
  ApiRuntime.atom(
    Effect.gen(function* () {
      const client = yield* CrmApiClient;
      return yield* client.crmConversations.get({ params: { id: contactId } });
    }),
  ).pipe(
    Atom.withReactivity([...conversationKeys, contactId]),
    Atom.setIdleTTL(DEFAULT_TTL),
  ),
);

export const conversationDraftAtom = Atom.family((_: CrmContactId.Id) => Atom.make(""));

const CONVERSATION_CONFLICTS: Record<Conflict.Conversation, string> = {
  conversation_window_closed:
    "A janela de 24 horas fechou. Só um template aprovado pode ser enviado agora.",
};

const sendFailure =
  (fallback: string) =>
  (error: Option.Option<unknown>): string => {
    const value = Option.getOrUndefined(error);
    if (value instanceof ForbiddenError) return "Você não tem acesso a este contato.";
    if (value instanceof CrmConflictError) {
      return Conflict.isConversation(value.reason) ? CONVERSATION_CONFLICTS[value.reason] : fallback;
    }
    return fallback;
  };

export const sendConversationTextAtom = ApiRuntime.fn(
  Effect.fnUntraced(
    function* (contactId: CrmContactId.Id, get: Atom.FnContext) {
      const body = get(conversationDraftAtom(contactId)).trim();
      const client = yield* CrmApiClient;
      yield* client.crmConversations.sendText({ params: { id: contactId }, payload: { body } });
      get.set(conversationDraftAtom(contactId), "");
    },
    withToast({
      onWaiting: "Enviando…",
      onSuccess: "Mensagem enviada.",
      onFailure: sendFailure("Não foi possível enviar a mensagem."),
    }),
  ),
  { reactivityKeys: conversationMutationKeys },
);

export const sendConversationTemplateAtom = ApiRuntime.fn(
  Effect.fnUntraced(
    function* (input: {
      readonly contactId: CrmContactId.Id;
      readonly name: string;
      readonly language: string;
    }) {
      const client = yield* CrmApiClient;
      yield* client.crmConversations.sendTemplate({
        params: { id: input.contactId },
        payload: { name: input.name, language: input.language },
      });
    },
    withToast({
      onWaiting: "Enviando template…",
      onSuccess: "Template enviado.",
      onFailure: sendFailure("Não foi possível enviar o template."),
    }),
  ),
  { reactivityKeys: conversationMutationKeys },
);

export const simulateConversationReplyAtom = ApiRuntime.fn(
  Effect.fnUntraced(
    function* (input: { readonly contactId: CrmContactId.Id; readonly body: string }) {
      const client = yield* CrmApiClient;
      yield* client.crmConversations.simulateReply({
        params: { id: input.contactId },
        payload: { body: input.body },
      });
    },
    withToast({
      onWaiting: "Simulando resposta…",
      onSuccess: "Resposta do cliente simulada.",
      onFailure: sendFailure("Não foi possível simular a resposta."),
    }),
  ),
  { reactivityKeys: conversationMutationKeys },
);

export const conversationTemplatesAtom = ApiRuntime.atom(
  Effect.gen(function* () {
    const client = yield* CrmApiClient;
    return yield* client.crmConversationTemplates.list();
  }),
).pipe(Atom.withReactivity(conversationKeys), Atom.setIdleTTL(DEFAULT_TTL));