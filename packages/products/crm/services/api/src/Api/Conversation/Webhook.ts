import { HttpServerRequest } from "effect/unstable/http";
import { Errors } from "@kikos/core";
import { CrmApi } from "@kikos/crm-contracts";
import { CrmConversationService, Persistance, Services } from "@kikos/crm-services";
import * as WhatsApp from "@kikos/whatsapp";
import { Config, Effect, Layer, Schema } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ApplicationError } from "@kikos/primitives";

const appSecret = Config.String("WHATSAPP_APP_SECRET");
const verifyToken = Config.String("WHATSAPP_VERIFY_TOKEN");

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
      .handle("verify", ({ query }) =>
        Effect.gen(function* () {
          const expected = yield* verifyToken.pipe(Effect.orDie);
          const isSubscriptionHandshake = query["hub.mode"] === "subscribe";
          const verifyTokenMatches = query["hub.verify_token"] === expected;
          if (!isSubscriptionHandshake || !verifyTokenMatches) {
            return yield* Effect.fail(
              new Errors.UnauthorizedError({ message: "Invalid verify token" }),
            );
          }
          return query["hub.challenge"];
        }),
      )
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

          const parsed = yield* Effect.try({
            try: () => JSON.parse(payload) as unknown,
            catch: () => new ApplicationError({ message: "Corpo inválido" }),
          });

          const notification = yield* Schema.decodeUnknownEffect(WhatsApp.Model.Notification)(
            parsed,
          ).pipe(Effect.mapError(() => new ApplicationError({ message: "Formato não reconhecido" })));

          const receiveOrLogAndDrop = (message: WhatsApp.Model.Inbound) =>
            conversations.receive(message).pipe(
              Effect.tapError((error) =>
                Effect.logError(`Mensagem ${message.id} não registrada: ${error.message}`),
              ),
              Effect.ignore,
            );

          yield* Effect.forEach(WhatsApp.Model.messagesOf(notification), receiveOrLogAndDrop, {
            discard: true,
          });

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