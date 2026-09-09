import { Effect, Schema } from "effect";
import * as Context from "effect/Context";
import * as Model from "./Model";

export class WhatsAppError extends Schema.TaggedError<WhatsAppError>()(
  "WhatsApp.Error",
  { message: Schema.String },
) {}

/**
 * Everything this integration can ask of the api, and nothing else.
 *
 * A port rather than a client so the crm can be built and demonstrated against
 * a stub while the business account is being verified — the same seam
 * `@kikos/file-content` uses to stand in memory, in postgres or in s3 behind
 * one interface.
 */
export interface IWhatsAppGateway {
  /** Answers the id every later delivery receipt refers to. */
  readonly send: (
    message: Model.Outbound,
  ) => Effect.Effect<Model.MessageId, WhatsAppError>;
  /**
   * Uploads bytes and answers the handle a send carries. Media never travels
   * inline: the api takes an id or a public url, and a public url for
   * somebody's document is not a trade worth making.
   */
  readonly upload: (
    data: Uint8Array,
    mediaType: string,
  ) => Effect.Effect<Model.MediaId, WhatsAppError>;
  /** The bytes behind a handle that arrived on an inbound message. */
  readonly download: (
    id: Model.MediaId,
  ) => Effect.Effect<Uint8Array, WhatsAppError>;
  /**
   * The templates Meta has approved, which are the only thing sendable once
   * the twenty-four hour window has closed. Submitting one for approval is not
   * here: it happens in Meta's own console and takes hours.
   */
  readonly templates: Effect.Effect<
    ReadonlyArray<{ readonly name: string; readonly language: string }>,
    WhatsAppError
  >;
}

export class WhatsAppGateway extends Context.Service<WhatsAppGateway, IWhatsAppGateway>()(
  "@kikos/whatsapp/Gateway",
) {}