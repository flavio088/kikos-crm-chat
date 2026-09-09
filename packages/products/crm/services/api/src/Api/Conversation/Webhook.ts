import { HttpServerRequest } from "effect/unstable/http";
import { Errors } from "@kikos/core";
import { CrmApi } from "@kikos/crm-contracts";
import { CrmConversationService, Persistance, Services } from "@kikos/crm-services";
import * as WhatsApp from "@kikos/whatsapp";
import { Config, Effect, Layer, Schema } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ApplicationError } from "@kikos/primitives";

/**
 * Meta's end of the line, and the only route here that no bearer token
 * reaches.
 *
 * What stands in for one is an hmac of the request body, signed with the app
 * secret and sent as `X-Hub-Signature-256`. Verifying it is what makes this
 * route safe to leave open: anybody may call it, and only Meta can produce a
 * body it accepts.
 */
const appSecret = Config.String("WHATSAPP_APP_SECRET");
const verifyToken = Config.String("WHATSAPP_VERIFY_TOKEN");

/**
 * Compared with `timingSafeEqual` rather than `===`.
 *
 * A plain comparison returns as soon as two bytes differ, so the time it takes
 * leaks how much of the signature was right — enough, over many tries, to
 * recover it a byte at a time. The constant-time compare is the whole reason
 * this function exists instead of an inline `===`.
 */
const signatureMatches = (expected: string, received: string): boolean => {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const WhatsAppWebhookHttpHandlers = HttpApiBuilder.group(
  CrmApi,
  "whatsappWebhook",
  Effect.fn("WhatsAppWebhookHttpHandlers")(function* (handlers) {
    const conversations = yield* CrmConversationService;

    return handlers
      /**
       * The handshake, once, when the url is registered in Meta's console. The
       * challenge goes back verbatim or the webhook is never activated.
       */
      .handle("verify", ({ query }) =>
        Effect.gen(function* () {
          const expected = yield* verifyToken.pipe(Effect.orDie);
          if (query["hub.mode"] !== "subscribe" || query["hub.verify_token"] !== expected) {
            return yield* Effect.fail(
              new Errors.UnauthorizedError({ message: "Invalid verify token" }),
            );
          }
          return query["hub.challenge"];
        }),
      )
      /**
       * Every notification after that. The body is decoded only once the
       * signature has held — validating first would be trusting before
       * checking.
       *
       * A message this crm cannot place is dropped rather than answered with a
       * failure: Meta retries a failed webhook, and retrying will not make an
       * unknown number known.
       */
      .handle("receive", ({ payload }) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const secret = yield* appSecret.pipe(Effect.orDie);

          const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
          const received = request.headers["x-hub-signature-256"] ?? "";

          if (!signatureMatches(expected, received)) {
            return yield* Effect.fail(
              new Errors.UnauthorizedError({ message: "Invalid signature" }),
            );
          }

                    /**
           * A body that is not json at all is a bad request, not a defect —
           * `JSON.parse` throwing here answered 500 and put a stack trace in
           * the log for something the caller sent wrong.
           */
          const parsed = yield* Effect.try({
            try: () => JSON.parse(payload) as unknown,
            catch: () => new ApplicationError({ message: "Corpo inválido" }),
          });

          const notification = yield* Schema.decodeUnknownEffect(WhatsApp.Model.Notification)(
            parsed,
          ).pipe(Effect.mapError(() => new ApplicationError({ message: "Formato não reconhecido" })));

          /**
           * One message failing does not fail the delivery: Meta retries a
           * webhook that answered an error, and a retry will not make an
           * unknown number known. But it is logged before it is dropped —
           * `receive` returning quietly is the expected path, while a database
           * that is down for thirty seconds would otherwise lose twenty real
           * messages and leave nothing behind saying so.
           */
          yield* Effect.forEach(
            WhatsApp.Model.messagesOf(notification),
            (message) =>
              conversations.receive(message).pipe(
                Effect.tapError((error) =>
                  Effect.logError(`Mensagem ${message.id} não registrada: ${error.message}`),
                ),
                Effect.ignore,
              ),
            { discard: true },
          );

          return { data: undefined };
        }),
      );
  }),
);

export const LiveWhatsAppWebhookApiGroup = WhatsAppWebhookHttpHandlers.pipe(
  Layer.provide(Services.live),
  Layer.provide(Persistance.layerSql),
);

export const MemoryWhatsAppWebhookApiGroup = WhatsAppWebhookHttpHandlers.pipe(
  Layer.provide(Services.liveWithoutErpSync),
  Layer.provide(Persistance.layerMemory),
);