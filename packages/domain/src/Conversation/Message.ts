import { CrmConversationId, CrmConversationMessageId, UserId } from "../ids";
import { File as PrimitiveFile, Timestampable } from "../primitives";
import { Schema } from "effect";

export const Direction = Schema.Literals(["inbound", "outbound"]);
export type Direction = Schema.Schema.Type<typeof Direction>;

const BaseMessage = {
  id: CrmConversationMessageId.Id,
  conversationId: CrmConversationId.Id,
  direction: Direction,
  authorId: UserId.Id.pipe(Schema.optional, Schema.optionalKey),
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
  body: Schema.NonEmptyString.pipe(Schema.optional, Schema.optionalKey),
}) {}

export class Template extends Schema.TaggedClass<Template>()("CrmConversationMessage.Template", {
  ...BaseMessage,
  kind: Schema.tag("template"),
  templateName: Schema.NonEmptyString,
  parameters: Schema.Array(Schema.String),
  body: Schema.NonEmptyString.pipe(Schema.optional, Schema.optionalKey),
}) {}

export const Any = Schema.Union([Text, Media, Template]).pipe(Schema.toTaggedUnion("kind"));
export type Any = Schema.Schema.Type<typeof Any>;

export const Id = CrmConversationMessageId.Id;
export type Id = CrmConversationMessageId.Id;
