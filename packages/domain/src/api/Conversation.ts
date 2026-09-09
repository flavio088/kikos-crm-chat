import * as Contact from "../Contact";
import * as Conversation from "../Conversation";
import { CrmContactId } from "../ids";
import { ApplicationError, Contracts, ForbiddenError, UnauthorizedError } from "../primitives";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { CrmConflictError, CrmNotFoundError } from "./Errors";

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

export const SendConversationTemplate = {
  input: { id: CrmContactId.Id },
  payload: Schema.Struct({ name: Schema.NonEmptyString, language: Schema.NonEmptyString }),
  ...Contracts.response(ConversationDetail, [ApplicationError, ForbiddenError, CrmNotFoundError]),
};

export const SimulateConversationReply = {
  input: { id: CrmContactId.Id },
  payload: Schema.Struct({ body: Schema.NonEmptyString }),
  ...Contracts.response(ConversationDetail, [ApplicationError, ForbiddenError, CrmNotFoundError]),
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
  .add(
    HttpApiEndpoint.post("sendTemplate", "/:id/conversation/templates", {
      params: SendConversationTemplate.input,
      payload: SendConversationTemplate.payload,
      success: SendConversationTemplate.success,
      error: SendConversationTemplate.error,
    }),
  )
  .add(
    HttpApiEndpoint.post("simulateReply", "/:id/conversation/simulate", {
      params: SimulateConversationReply.input,
      payload: SimulateConversationReply.payload,
      success: SimulateConversationReply.success,
      error: SimulateConversationReply.error,
    }),
  )
  .prefix("/crm/contacts");

export const ConversationTemplate = Schema.Struct({
  name: Schema.String,
  language: Schema.String,
  body: Schema.String,
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
  .prefix("/crm/conversation");

const UnauthorizedResponse = HttpApiSchema.status(401)(UnauthorizedError);

export const VerifyWhatsAppWebhookQuery = Schema.Struct({
  "hub.mode": Schema.String,
  "hub.verify_token": Schema.String,
  "hub.challenge": Schema.String,
});

export const VerifyWhatsAppWebhook = {
  query: VerifyWhatsAppWebhookQuery,
  success: Schema.String.pipe(HttpApiSchema.asText()),
  error: [ApplicationError, UnauthorizedResponse] as const,
};

const rawBodyForSignatureCheck = Schema.String.pipe(
  HttpApiSchema.asText({ contentType: "application/json" }),
);

export const ReceiveWhatsAppWebhook = {
  payload: rawBodyForSignatureCheck,
  ...Contracts.response(Schema.Void, [ApplicationError, UnauthorizedResponse]),
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