import { CrmApi } from "@crm-chat/domain";
import { Context, Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { Atom } from "effect/unstable/reactivity";

export type ICrmApiClient = HttpApiClient.ForApi<typeof CrmApi>;

export class CrmApiClient extends Context.Service<CrmApiClient, ICrmApiClient>()(
  "@crm-chat/web/lib/client/CrmApiClient",
) {
  static readonly layer = Layer.effect(CrmApiClient)(
    Effect.gen(function* () {
      const httpClient = yield* HttpClient.HttpClient;
      return yield* HttpApiClient.makeWith(CrmApi, {
        httpClient,
        baseUrl: window.location.origin,
      });
    }),
  );
}

export const ApiRuntime = Atom.runtime(
  CrmApiClient.layer.pipe(Layer.provide(FetchHttpClient.layer)),
);
