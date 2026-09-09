import { useAtom, useAtomSet, useAtomSuspense, useAtomValue } from "@effect/atom-react";
import type { CrmContactId } from "@kikos/effect-identity";
import { AsyncResult } from "effect/unstable/reactivity";
import { conversationAtom, conversationDraftAtom, conversationTemplatesAtom, sendConversationTextAtom } from "../atoms";

export const useConversation = (contactId: CrmContactId.Id) => {
  const result = useAtomSuspense(conversationAtom(contactId));
  return { result };
};

/** The message draft for one contact. The send flow reads and clears it. */
export const useConversationDraft = (contactId: CrmContactId.Id) =>
  useAtom(conversationDraftAtom(contactId));

export const useSendConversationText = () => {
  const send = useAtomSet(sendConversationTextAtom);
  const result = useAtomValue(sendConversationTextAtom);
  return { send, pending: AsyncResult.isWaiting(result) };
};

export const useConversationTemplates = () => {
  const result = useAtomSuspense(conversationTemplatesAtom);
  return { result };
};