import { Config, Effect, Layer, Redacted, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { WhatsAppError, WhatsAppGateway, type IWhatsAppGateway } from "./Gateway";
import * as Model from "./Model";

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

  const upload: IWhatsAppGateway["upload"] = (data, mediaType) =>
    Effect.gen(function* () {
      const form = new FormData();
      form.set("messaging_product", "whatsapp");
      form.set("type", mediaType);
      const bytesInPlainArrayBuffer = data.slice().buffer;
      form.set("file", new Blob([bytesInPlainArrayBuffer], { type: mediaType }));

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

  const approvedTemplates: IWhatsAppGateway["approvedTemplates"] = Effect.gen(function* () {
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

  return WhatsAppGateway.of({ send, upload, download, approvedTemplates });
});

export const layer = Layer.effect(WhatsAppGateway)(make);