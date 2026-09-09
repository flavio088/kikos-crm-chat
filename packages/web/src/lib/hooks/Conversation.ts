import { useAtom, useAtomSet, useAtomSuspense, useAtomValue } from "@effect/atom-react";
import type { CrmContactId } from "@crm-chat/domain";
import { AsyncResult } from "effect/unstable/reactivity";
import {
  conversationAtom,
  conversationDraftAtom,
  conversationTemplatesAtom,
  sendConversationTemplateAtom,
  sendConversationTextAtom,
  simulateConversationReplyAtom,
} from "../atoms";

export const useConversation = (contactId: CrmContactId.Id) => {
  const result = useAtomSuspense(conversationAtom(contactId));
  return { result };
};

export const useConversationDraft = (contactId: CrmContactId.Id) =>
  useAtom(conversationDraftAtom(contactId));

export const useSendConversationText = () => {
  const send = useAtomSet(sendConversationTextAtom);
  const result = useAtomValue(sendConversationTextAtom);
  return { send, pending: AsyncResult.isWaiting(result) };
};

export const useSendConversationTemplate = () => {
  const send = useAtomSet(sendConversationTemplateAtom);
  const result = useAtomValue(sendConversationTemplateAtom);
  return { send, pending: AsyncResult.isWaiting(result) };
};

export const useSimulateConversationReply = () => {
  const simulate = useAtomSet(simulateConversationReplyAtom);
  const result = useAtomValue(simulateConversationReplyAtom);
  return { simulate, pending: AsyncResult.isWaiting(result) };
};

export const useConversationTemplates = () => {
  const result = useAtomSuspense(conversationTemplatesAtom);
  return { result };
};