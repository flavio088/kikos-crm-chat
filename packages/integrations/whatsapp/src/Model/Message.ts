import { Schema } from "effect";
import { MediaId, MessageId, WhatsAppPhone } from "./Id";

/**
 * What is sent, in the shape the api takes it.
 *
 * `messaging_product` is a constant the api demands on every send — it exists
 * because the same endpoint family serves other Meta products. It is written
 * here rather than left to the caller, since there is one right value.
 */
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

/**
 * Media is sent by id, not by bytes: the file is uploaded first and the handle
 * that comes back is what travels here. The api accepts a url instead, and we
 * do not use it — it would mean exposing a publicly reachable address for
 * something that is somebody's document.
 */
export const OutboundMedia = Schema.Struct({
  ...BaseOutbound,
  type: Schema.Literals(["image", "document", "audio", "video"]),
  media: Schema.Struct({
    id: MediaId,
    caption: Schema.String.pipe(Schema.optionalKey),
  }),
});
export type OutboundMedia = typeof OutboundMedia.Type;

/**
 * A template, which is the only thing that may be sent once the twenty-four
 * hour window has closed. The body is fixed and approved by Meta; the caller
 * fills the numbered placeholders in order.
 */
export const OutboundTemplate = Schema.Struct({
  ...BaseOutbound,
  type: Schema.tag("template"),
  template: Schema.Struct({
    name: Schema.NonEmptyString,
    language: Schema.Struct({ code: Schema.NonEmptyString }),
    /**
     * The api's own shape, verbose as it is: one component of type `body`
     * holding the numbered placeholders in order. Flattening it to a string
     * array would read better and would not be what the wire takes — the
     * conversion would just move somewhere less visible.
     */
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

/**
 * A plain union, not a tagged one: `image`, `document`, `audio` and `video`
 * share one shape, so the discriminator holds four literals in a single member
 * and there is no lone tag to key on.
 */
export const Outbound = Schema.Union([OutboundText, OutboundMedia, OutboundTemplate]);
export type Outbound = typeof Outbound.Type;

/** What the api answers on a send: the id every later receipt refers to. */
export const Sent = Schema.Struct({
  messages: Schema.Array(Schema.Struct({ id: MessageId })),
});
export type Sent = typeof Sent.Type;