import { CrmConversationId, CrmConversationMessageId, UserId } from "@kikos/effect-identity";
import { File as PrimitiveFile, Timestampable } from "@kikos/primitives";
import { Schema } from "effect";

export const Direction = Schema.Literals(["inbound", "outbound"]);
export type Direction = Schema.Schema.Type<typeof Direction>;

/**
 * What one message carries, and the three shapes are the three things the api
 * distinguishes: free text, a file, and a template sent once the window has
 * closed. A template is not text — its body was approved by Meta and the
 * sender only fills the blanks — so folding it into `text` would lose the one
 * thing that makes it sendable at all.
 */
const BaseMessage = {
  id: CrmConversationMessageId.Id,
  conversationId: CrmConversationId.Id,
  direction: Direction,
  /** Null on everything inbound: the customer is not a user of this system. */
  authorId: UserId.Id.pipe(Schema.optional, Schema.optionalKey),
  /** The id Meta assigns on send, and what its delivery receipts refer to. */
  externalId: Schema.NonEmptyString.pipe(Schema.optional, Schema.optionalKey),
  sentAt: Schema.DateTimeUtc,
  deliveredAt: Schema.DateTimeUtc.pipe(Schema.optional, Schema.optionalKey),
  readAt: Schema.DateTimeUtc.pipe(Schema.optional, Schema.optionalKey),
  ...Timestampable,
} as const;

export class Text extends Schema.TaggedClass<Text>()("CrmConversationMessage.Text", {
  ...BaseMessage,
  kind: Schema.tag("text"),
  body: Schema.NonEmptyString,
}) {}

export class Media extends Schema.TaggedClass<Media>()("CrmConversationMessage.Media", {
  ...BaseMessage,
  kind: Schema.tag("media"),
  filename: Schema.NonEmptyString,
  mediaType: PrimitiveFile.MediaType,
  sizeBytes: Schema.Int,
  /** What somebody typed under the photo, and often nothing. */
  body: Schema.NonEmptyString.pipe(Schema.optional, Schema.optionalKey),
}) {}

export class Template extends Schema.TaggedClass<Template>()("CrmConversationMessage.Template", {
  ...BaseMessage,
  kind: Schema.tag("template"),
  /** The approved template's name, and the values that filled its blanks. */
  templateName: Schema.NonEmptyString,
  parameters: Schema.Array(Schema.String),
}) {}

export const Any = Schema.Union([Text, Media, Template]).pipe(Schema.toTaggedUnion("kind"));
export type Any = Schema.Schema.Type<typeof Any>;

export const Id = CrmConversationMessageId.Id;
export type Id = CrmConversationMessageId.Id;
