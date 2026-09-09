import { HttpApi } from "effect/unstable/httpapi";
import {
  ConversationApiGroup,
  ConversationTemplateApiGroup,
  WhatsAppWebhookApiGroup,
} from "./Conversation";
import { OpportunityApiGroup } from "./Opportunity";

export * from "./Errors";
export * from "./Conversation";
export * from "./Opportunity";

export class CrmApi extends HttpApi.make("crm")
  .add(OpportunityApiGroup)
  .add(ConversationApiGroup)
  .add(ConversationTemplateApiGroup)
  .add(WhatsAppWebhookApiGroup) {}
