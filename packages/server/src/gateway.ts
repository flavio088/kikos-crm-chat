import * as WhatsApp from "@kikos/whatsapp";
import { Config, Effect, Layer, Option } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

export const WhatsAppGatewayLive = Layer.unwrap(
  Effect.gen(function* () {
    const token = yield* Config.redacted("WHATSAPP_TOKEN").pipe(Config.option);
    if (Option.isNone(token)) {
      yield* Effect.log("WhatsApp: stub (WHATSAPP_TOKEN não definido; nada sai para a Meta)");
      return WhatsApp.layerStub;
    }
    yield* Effect.log("WhatsApp: Cloud API (WHATSAPP_TOKEN definido)");
    return WhatsApp.Live.layer.pipe(Layer.provide(FetchHttpClient.layer));
  }),
);
