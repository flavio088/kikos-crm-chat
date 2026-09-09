import { Authorization } from "@kikos/core-contracts";
import { Errors } from "@kikos/core";
import { Contact, Conversation } from "@kikos/crm-core";
import { CrmContactId } from "@kikos/effect-identity";
import { ApplicationError, Contracts, ForbiddenError } from "@kikos/primitives";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { CrmConflictError, CrmNotFoundError } from "../Errors";
import { CrmScoped } from "../Middleware";

/**
 * The thread and what the composer needs to decide what to offer.
 *
 * `windowOpen` travels rather than being derived on the screen: the rule is
 * Meta's twenty-four hours from the customer's last message, and a second
 * reading of it is a second place for it to drift.
 */
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

/**
 * The approved templates, as the composer needs them: a name to send and a
 * language to send it in. What Meta returns alongside — the body, the
 * category, the rejection reason on the ones that failed — is not read here,
 * and the query already filters to approved.
 */
export const ConversationTemplate = Schema.Struct({
  name: Schema.String,
  language: Schema.String,
});

export const ListConversationTemplates = {
  ...Contracts.response(Schema.Array(ConversationTemplate), [ApplicationError, ForbiddenError]),
};

/**
 * Its own group because templates belong to the account and not to a contact.
 * Hanging them off `/crm/contacts/:id` would name a person the answer does not
 * depend on.
 */
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

/**
 * Meta's side, and it carries no bearer token — which is why it is its own
 * group, outside `Authorization`.
 *
 * Two shapes. The GET is the handshake: Meta calls once with a token it was
 * given in the console and expects the challenge echoed back as plain text.
 * The POST is every notification after that, signed with an HMAC of the body
 * in `X-Hub-Signature-256` — stronger than the query-string token the rd
 * station intake uses, because it also proves the body was not altered, and
 * because a query string is the one part of a request that reliably ends up
 * in access logs.
 */
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

export const ReceiveWhatsAppWebhook = {
  /**
   * Not parsed here, and that is the point: the signature is an hmac over the
   * exact bytes Meta sent, so the handler reads the raw body itself. Letting
   * the contract decode first would consume the stream and leave nothing to
   * verify against.
   */
  payload: Schema.String.pipe(HttpApiSchema.asText()),
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