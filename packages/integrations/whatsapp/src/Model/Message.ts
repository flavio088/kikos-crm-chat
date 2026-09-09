import { Schema } from "effect";
import { MediaId, MessageId, WhatsAppPhone } from "./Id";

const BaseOutbound = {
  messaging_product: Schema.Literal("whatsapp"),
  to: WhatsAppPhone,
} as const;

export const OutboundText = Schema.Struct({
  ...BaseOutbound,
  type: Schema.tag("text"),
  text: Schema.Struct({ body: Schema.NonEmptyString }),
});
export type OutboundText = typeof OutboundText.Type;

export const OutboundMedia = Schema.Struct({
  ...BaseOutbound,
  type: Schema.Literals(["image", "document", "audio", "video"]),
  media: Schema.Struct({
    id: MediaId,
    caption: Schema.String.pipe(Schema.optionalKey),
  }),
});
export type OutboundMedia = typeof OutboundMedia.Type;

export const OutboundTemplate = Schema.Struct({
  ...BaseOutbound,
  type: Schema.tag("template"),
  template: Schema.Struct({
    name: Schema.NonEmptyString,
    language: Schema.Struct({ code: Schema.NonEmptyString }),
    components: Schema.Array(
      Schema.Struct({
        type: Schema.Literal("body"),
        parameters: Schema.Array(
          Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }),
        ),
      }),
    ),
  }),
});
export type OutboundTemplate = typeof OutboundTemplate.Type;

export const Outbound = Schema.Union([OutboundText, OutboundMedia, OutboundTemplate]);
export type Outbound = typeof Outbound.Type;

export const Sent = Schema.Struct({
  messages: Schema.Array(Schema.Struct({ id: MessageId })),
});
export type Sent = typeof Sent.Type;