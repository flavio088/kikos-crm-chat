import { authenticationKeys } from "@kikos/auth-backoffice";
import { CrmConflictError, CrmNotFoundError } from "@kikos/crm-contracts";
import { Conflict, Missing } from "@kikos/crm-core";
import type { CrmContactId } from "@kikos/effect-identity";
import { ForbiddenError } from "@kikos/primitives";
import { withToast } from "@kikos/ui-backoffice";
import { Atom } from "effect/unstable/reactivity";
import { Effect, Option } from "effect";
import { DEFAULT_TTL } from "../../Config";
import { ApiRuntime, CrmApiClient } from "../client";

export const conversationKeys = ["conversations", ...authenticationKeys];

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

/** The message being written for one contact — state the send flow reads and clears. */
export const conversationDraftAtom = Atom.family((_: CrmContactId.Id) => Atom.make(""));

/**
 * The two ways a send is refused, said the way the composer needs them said.
 * The window closing is not a failure to retry — it asks for a template
 * instead, which is a different move.
 */
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
/**
 * The approved templates, read once and kept — Meta's list changes when
 * somebody submits a new one for approval, which is a thing that happens in a
 * console and takes hours, not something a screen races.
 */
export const conversationTemplatesAtom = ApiRuntime.atom(
  Effect.gen(function* () {
    const client = yield* CrmApiClient;
    return yield* client.crmConversationTemplates.list();
  }),
).pipe(Atom.withReactivity(conversationKeys), Atom.setIdleTTL(DEFAULT_TTL));