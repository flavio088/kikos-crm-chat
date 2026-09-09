import { Config, Effect, Layer, Redacted, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { WhatsAppError, WhatsAppGateway, type IWhatsAppGateway } from "./Gateway";
import * as Model from "./Model";

/**
 * The Cloud API, for real.
 *
 * Written against `HttpClient` rather than declared as an `HttpApi` the way
 * atos and pagbank are: those wrap whole products, this needs four calls, and
 * describing the graph api's surface to reach them would be more contract than
 * client.
 *
 * The token is `Redacted` so it does not print in a log line or a stack trace
 * — it is a bearer for the company's whole WhatsApp account.
 */
const BASE_URL = "https://graph.facebook.com/v21.0";

const failed = (context: string) =>
  Effect.mapError((error: { readonly message?: string }) =>
    new WhatsAppError({ message: `${context}: ${error.message ?? "unknown"}` }),
  );

export const make = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient;
  const token = yield* Config.Redacted("WHATSAPP_TOKEN");
  const phoneNumberId = yield* Config.String("WHATSAPP_PHONE_NUMBER_ID");
  const businessId = yield* Config.String("WHATSAPP_BUSINESS_ACCOUNT_ID");

  const authed = (request: HttpClientRequest.HttpClientRequest) =>
    HttpClientRequest.bearerToken(request, token);

  const send: IWhatsAppGateway["send"] = (message) =>
    Effect.gen(function* () {
      const response = yield* client
        .execute(
          authed(
            HttpClientRequest.post(`${BASE_URL}/${phoneNumberId}/messages`).pipe(
            HttpClientRequest.bodyJsonUnsafe(message),
            ),
          ),
        )
        .pipe(failed("send"));

      const sent = yield* response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Model.Sent)),
        failed("send: unexpected response"),
      );

      const first = sent.messages[0];
      if (first === undefined) {
        return yield* Effect.fail(new WhatsAppError({ message: "send: no message id" }));
      }
      return first.id;
    });

  /**
   * Multipart, because the api takes the bytes themselves here rather than a
   * url — and a url for somebody's document is not a trade worth making.
   */
  const upload: IWhatsAppGateway["upload"] = (data, mediaType) =>
    Effect.gen(function* () {
      const form = new FormData();
      form.set("messaging_product", "whatsapp");
      form.set("type", mediaType);
            /**
       * Copied into a plain buffer first: a `Uint8Array` over a `SharedArrayBuffer`
       * is not a `BlobPart` as far as the dom types are concerned, and the slice
       * is cheap next to the upload it feeds.
       */
      form.set("file", new Blob([data.slice().buffer], { type: mediaType }));

      const response = yield* client
        .execute(
          authed(
            HttpClientRequest.post(`${BASE_URL}/${phoneNumberId}/media`).pipe(
              HttpClientRequest.bodyFormData(form),
            ),
          ),
        )
        .pipe(failed("upload"));

      const uploaded = yield* response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({ id: Model.MediaId }))),
        failed("upload: unexpected response"),
      );
      return uploaded.id;
    });

  /**
   * Two requests, and the api gives no way around it: the handle answers a
   * url, and the url answers the bytes. The url is short-lived and bearer
   * protected, which is why the token rides on the second call too.
   */
  const download: IWhatsAppGateway["download"] = (id) =>
    Effect.gen(function* () {
      const handle = yield* client
        .execute(authed(HttpClientRequest.get(`${BASE_URL}/${id}`)))
        .pipe(failed("download"));

      const located = yield* handle.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({ url: Schema.String }))),
        failed("download: unexpected response"),
      );

      const bytes = yield* client
        .execute(authed(HttpClientRequest.get(located.url)))
        .pipe(failed("download: fetching bytes"));

      return yield* bytes.arrayBuffer.pipe(
        Effect.map((buffer) => new Uint8Array(buffer)),
        failed("download: reading bytes"),
      );
    });

  const templates: IWhatsAppGateway["templates"] = Effect.gen(function* () {
    const response = yield* client
      .execute(
        authed(HttpClientRequest.get(`${BASE_URL}/${businessId}/message_templates?status=APPROVED`)),
      )
      .pipe(failed("templates"));

    const listed = yield* response.json.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.Struct({
            data: Schema.Array(Schema.Struct({ name: Schema.String, language: Schema.String })),
          }),
        ),
      ),
      failed("templates: unexpected response"),
    );
    return listed.data;
  });

  return WhatsAppGateway.of({ send, upload, download, templates });
});

export const layer = Layer.effect(WhatsAppGateway)(make);