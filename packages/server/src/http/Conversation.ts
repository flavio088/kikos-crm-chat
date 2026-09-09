import { CrmApi } from "@crm-chat/domain";
import { CrmConversationService } from "../services/Conversation";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { currentCrmActor, mapScopedResponse } from "./internal";

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
      )
      .handle("sendTemplate", ({ params, payload }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) => conversations.sendTemplate(actor, params.id, payload)),
          mapScopedResponse,
        ),
      )
      .handle("simulateReply", ({ params, payload }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) => conversations.simulateReply(actor, params.id, payload.body)),
          mapScopedResponse,
        ),
      );
  }),
);

export const CrmConversationTemplateHttpHandlers = HttpApiBuilder.group(
  CrmApi,
  "crmConversationTemplates",
  Effect.fn("CrmConversationTemplateHttpHandlers")(function* (handlers) {
    const conversations = yield* CrmConversationService;

    return handlers.handle("list", () => conversations.approvedTemplates.pipe(mapScopedResponse));
  }),
);
