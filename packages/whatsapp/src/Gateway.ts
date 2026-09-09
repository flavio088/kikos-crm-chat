import { Effect, Schema } from "effect";
import * as Context from "effect/Context";
import * as Model from "./Model";

export class WhatsAppError extends Schema.TaggedError<WhatsAppError>()(
  "WhatsApp.Error",
  { message: Schema.String },
) {}

export type ApprovedTemplate = {
  readonly name: string;
  readonly language: string;
  readonly body: string;
};

export interface IWhatsAppGateway {
  readonly send: (
    message: Model.Outbound,
  ) => Effect.Effect<Model.MessageId, WhatsAppError>;
  readonly upload: (
    data: Uint8Array,
    mediaType: string,
  ) => Effect.Effect<Model.MediaId, WhatsAppError>;
  readonly download: (
    id: Model.MediaId,
  ) => Effect.Effect<Uint8Array, WhatsAppError>;
  readonly approvedTemplates: Effect.Effect<ReadonlyArray<ApprovedTemplate>, WhatsAppError>;
}

export class WhatsAppGateway extends Context.Service<WhatsAppGateway, IWhatsAppGateway>()(
  "@kikos/whatsapp/Gateway",
) {}