import { Schema } from "effect";

export const Conversation = Schema.Literals(["conversation_window_closed"]);
export type Conversation = Schema.Schema.Type<typeof Conversation>;
export const isConversation = Schema.is(Conversation);

export const Attachment = Schema.Literals([
  "media_type_not_accepted",
  "content_mismatch",
  "attachment_limit_reached",
]);
export type Attachment = Schema.Schema.Type<typeof Attachment>;
export const isAttachment = Schema.is(Attachment);

export const Reason = Schema.Union([Conversation, Attachment]);
export type Reason = Schema.Schema.Type<typeof Reason>;
