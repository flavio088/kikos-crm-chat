import { Schema } from "effect";
import { MediaId, MessageId, WhatsAppPhone } from "./Id";

const UnixSecondsString = Schema.String.check(Schema.isPattern(/^\d+$/));

const BaseInbound = {
  id: MessageId,
  from: WhatsAppPhone,
  timestamp: UnixSecondsString,
} as const;

export const InboundText = Schema.Struct({
  ...BaseInbound,
  type: Schema.tag("text"),
  text: Schema.Struct({ body: Schema.String }),
});
export type InboundText = typeof InboundText.Type;

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

export const Status = Schema.Struct({
  id: MessageId,
  status: Schema.Literals(["sent", "delivered", "read", "failed"]),
  timestamp: UnixSecondsString,
});
export type Status = typeof Status.Type;

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

export const messagesOf = (notification: Notification): ReadonlyArray<Inbound> =>
  notification.entry.flatMap((entry) =>
    entry.changes.flatMap((change) => change.value.messages ?? []),
  );

export const statusesOf = (notification: Notification): ReadonlyArray<Status> =>
  notification.entry.flatMap((entry) =>
    entry.changes.flatMap((change) => change.value.statuses ?? []),
  );