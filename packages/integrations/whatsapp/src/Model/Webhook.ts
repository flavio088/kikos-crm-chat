import { Schema } from "effect";
import { MediaId, MessageId, WhatsAppPhone } from "./Id";

/**
 * What arrives when somebody writes to the business number.
 *
 * The api sends far more than this — a `context` for replies, an `identity`
 * block, `referral` when the chat came from an ad. None of it is read here,
 * and a schema that declared it would be claiming to handle cases nothing
 * downstream knows what to do with.
 *
 * `timestamp` is unix seconds as a string, which is what the wire carries.
 */
const BaseInbound = {
  id: MessageId,
  from: WhatsAppPhone,
  timestamp: Schema.String.check(Schema.isPattern(/^\d+$/)),
} as const;

export const InboundText = Schema.Struct({
  ...BaseInbound,
  type: Schema.tag("text"),
  text: Schema.Struct({ body: Schema.String }),
});
export type InboundText = typeof InboundText.Type;

/**
 * Media arrives as a handle, not as bytes: the payload carries an id to fetch
 * with, and the download is a second request against a url that expires. The
 * caption is the text somebody typed under the photo, and it is absent when
 * they typed nothing.
 */
export const InboundMedia = Schema.Struct({
  ...BaseInbound,
  type: Schema.Literals(["image", "document", "audio", "video"]),
  media: Schema.Struct({
    id: MediaId,
    mimeType: Schema.String,
    filename: Schema.String.pipe(Schema.optionalKey),
    caption: Schema.String.pipe(Schema.optionalKey),
  }),
});
export type InboundMedia = typeof InboundMedia.Type;

export const Inbound = Schema.Union([InboundText, InboundMedia]);
export type Inbound = typeof Inbound.Type;

/**
 * The delivery receipts, which arrive on their own webhook minutes or hours
 * after the message left. `failed` carries an error the api describes; the
 * rest carry nothing but the moment.
 *
 * They are keyed by the message id we were handed at send time, which is the
 * whole reason it is stored rather than discarded.
 */
export const Status = Schema.Struct({
  id: MessageId,
  status: Schema.Literals(["sent", "delivered", "read", "failed"]),
  timestamp: Schema.String.check(Schema.isPattern(/^\d+$/)),
});
export type Status = typeof Status.Type;
/**
 * The envelope, modelled rather than navigated.
 *
 * Meta wraps every product's webhooks in the same four levels — the shape is
 * Instagram's and Messenger's too, and nothing in it is read beyond reaching
 * the payload. Walking it by hand with `?.` would turn a changed format into a
 * silent `undefined` and a message that vanishes; decoding it means the same
 * change fails loudly, naming the field.
 *
 * `messages` and `statuses` are both optional and never both present: a
 * delivery receipt carries one, an incoming message the other.
 */
const Change = Schema.Struct({
  value: Schema.Struct({
    messages: Schema.Array(Inbound).pipe(Schema.optionalKey),
    statuses: Schema.Array(Status).pipe(Schema.optionalKey),
  }),
});

export const Notification = Schema.Struct({
  entry: Schema.Array(Schema.Struct({ changes: Schema.Array(Change) })),
});
export type Notification = typeof Notification.Type;

/** Every message in one delivery, with the envelope's nesting dropped. */
export const messagesOf = (notification: Notification): ReadonlyArray<Inbound> =>
  notification.entry.flatMap((entry) =>
    entry.changes.flatMap((change) => change.value.messages ?? []),
  );

/** Every receipt in one delivery, likewise flattened. */
export const statusesOf = (notification: Notification): ReadonlyArray<Status> =>
  notification.entry.flatMap((entry) =>
    entry.changes.flatMap((change) => change.value.statuses ?? []),
  );