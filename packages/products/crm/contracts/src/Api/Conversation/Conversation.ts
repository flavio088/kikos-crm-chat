import { Authorization } from "@kikos/core-contracts";
import { Errors } from "@kikos/core";
import { Contact, Conversation } from "@kikos/crm-core";
import { CrmContactId } from "@kikos/effect-identity";
import { ApplicationError, Contracts, ForbiddenError } from "@kikos/primitives";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { CrmConflictError, CrmNotFoundError } from "../Errors";
import { CrmScoped } from "../Middleware";

export const ConversationDetail = Schema.Struct({
  conversation: Conversation.Conversation,
  contact: Contact.Contact,
  messages: Schema.Array(Conversation.Message.Any),
  windowOpen: Schema.Boolean,
});
export type ConversationDetail = Schema.Schema.Type<typeof ConversationDetail>;

export const GetConversation = {
  input: { id: CrmContactId.Id },
  ...Contracts.response(ConversationDetail, [ApplicationError, ForbiddenError, CrmNotFoundError]),
};

export const SendConversationText = {
  input: { id: CrmContactId.Id },
  payload: Schema.Struct({ body: Schema.NonEmptyString }),
  ...Contracts.response(ConversationDetail, [
    ApplicationError,
    ForbiddenError,
    CrmNotFoundError,
    CrmConflictError,
  ]),
};

export const ConversationApiGroup = HttpApiGroup.make("crmConversations")
  .add(
    HttpApiEndpoint.get("get", "/:id/conversation", {
      params: GetConversation.input,
      success: GetConversation.success,
      error: GetConversation.error,
    }),
  )
  .add(
    HttpApiEndpoint.post("sendText", "/:id/conversation/messages", {
      params: SendConversationText.input,
      payload: SendConversationText.payload,
      success: SendConversationText.success,
      error: SendConversationText.error,
    }),
  )
  .middleware(CrmScoped)
  .middleware(Authorization)
  .prefix("/crm/contacts");

export const ConversationTemplate = Schema.Struct({
  name: Schema.String,
  language: Schema.String,
});

export const ListConversationTemplates = {
  ...Contracts.response(Schema.Array(ConversationTemplate), [ApplicationError, ForbiddenError]),
};

export const ConversationTemplateApiGroup = HttpApiGroup.make("crmConversationTemplates")
  .add(
    HttpApiEndpoint.get("list", "/templates", {
      success: ListConversationTemplates.success,
      error: ListConversationTemplates.error,
    }),
  )
  .middleware(CrmScoped)
  .middleware(Authorization)
  .prefix("/crm/conversation");

const UnauthorizedError = HttpApiSchema.status(401)(Errors.UnauthorizedError);

export const VerifyWhatsAppWebhookQuery = Schema.Struct({
  "hub.mode": Schema.String,
  "hub.verify_token": Schema.String,
  "hub.challenge": Schema.String,
});

export const VerifyWhatsAppWebhook = {
  query: VerifyWhatsAppWebhookQuery,
  success: Schema.String.pipe(HttpApiSchema.asText()),
  error: [ApplicationError, UnauthorizedError] as const,
};

const rawBodyForSignatureCheck = Schema.String.pipe(HttpApiSchema.asText());

export const ReceiveWhatsAppWebhook = {
  payload: rawBodyForSignatureCheck,
  ...Contracts.response(Schema.Void, [ApplicationError, UnauthorizedError]),
};

export const WhatsAppWebhookApiGroup = HttpApiGroup.make("whatsappWebhook")
  .add(
    HttpApiEndpoint.get("verify", "/", {
      query: VerifyWhatsAppWebhook.query,
      success: VerifyWhatsAppWebhook.success,
      error: VerifyWhatsAppWebhook.error,
    }),
  )
  .add(
    HttpApiEndpoint.post("receive", "/", {
      payload: ReceiveWhatsAppWebhook.payload,
      success: ReceiveWhatsAppWebhook.success,
      error: ReceiveWhatsAppWebhook.error,
    }),
  )
  .prefix("/webhooks/whatsapp");