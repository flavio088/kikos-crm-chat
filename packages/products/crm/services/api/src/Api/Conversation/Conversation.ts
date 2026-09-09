import { CrmApi } from "@kikos/crm-contracts";
import { CrmConversationService, Persistance, Services } from "@kikos/crm-services";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { currentCrmActor, mapScopedResponse } from "../internal";

export const CrmConversationHttpHandlers = HttpApiBuilder.group(
  CrmApi,
  "crmConversations",
  Effect.fn("CrmConversationHttpHandlers")(function* (handlers) {
    const conversations = yield* CrmConversationService;

    return handlers
      .handle("get", ({ params }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) => conversations.detail(actor, params.id)),
          mapScopedResponse,
        ),
      )
      .handle("sendText", ({ params, payload }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) => conversations.sendText(actor, params.id, payload.body)),
          mapScopedResponse,
        ),
      );
  }),
);

export const LiveCrmConversationApiGroup = CrmConversationHttpHandlers.pipe(
  Layer.provide(Services.live),
  Layer.provide(Persistance.layerSql),
);

export const MemoryCrmConversationApiGroup = CrmConversationHttpHandlers.pipe(
  Layer.provide(Services.liveWithoutErpSync),
  Layer.provide(Persistance.layerMemory),
);


export const CrmConversationTemplateHttpHandlers = HttpApiBuilder.group(
  CrmApi,
  "crmConversationTemplates",
  Effect.fn("CrmConversationTemplateHttpHandlers")(function* (handlers) {
    const conversations = yield* CrmConversationService;

    return handlers.handle("list", () => conversations.templates.pipe(mapScopedResponse));
  }),
);

export const LiveCrmConversationTemplateApiGroup = CrmConversationTemplateHttpHandlers.pipe(
  Layer.provide(Services.live),
  Layer.provide(Persistance.layerSql),
);

export const MemoryCrmConversationTemplateApiGroup = CrmConversationTemplateHttpHandlers.pipe(
  Layer.provide(Services.liveWithoutErpSync),
  Layer.provide(Persistance.layerMemory),
);
