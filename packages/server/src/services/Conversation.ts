import {
  Ability,
  Contact,
  Conversation,
  CrmContactId,
  CrmConversationMessageId,
  File as PrimitiveFile,
  Policy,
} from "@crm-chat/domain";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import * as ContactPersistence from "../persistence/Contact";
import * as ConversationPersistence from "../persistence/Conversation";
import * as ConversationMediaPersistence from "../persistence/ConversationMedia";
import * as ConversationMessagePersistence from "../persistence/ConversationMessage";
import * as OpportunityPersistence from "../persistence/Opportunity";
import {
  CrmConflictError,
  CrmForbiddenError,
  CrmNotFoundError,
  type CrmActor,
} from "./errors";
import * as WhatsApp from "@kikos/whatsapp";

export class CrmConversationError extends Schema.TaggedError<CrmConversationError>()(
  "Services.Crm.Conversation.Error",
  { message: Schema.String },
) {}

export type CrmConversationFailure =
  | CrmConversationError
  | CrmConflictError
  | CrmForbiddenError
  | CrmNotFoundError;

export type ConversationDetail = {
  readonly conversation: Conversation.Conversation;
  readonly contact: Contact.Contact;
  readonly messages: ReadonlyArray<Conversation.Message.Any>;
  readonly windowOpen: boolean;
};

export type ConversationTemplate = {
  readonly name: string;
  readonly language: string;
  readonly body: string;
};

export type ConversationTemplateChoice = Pick<ConversationTemplate, "name" | "language">;

export interface ICrmConversationService {
  readonly detail: (
    actor: CrmActor,
    contactId: CrmContactId.Id,
  ) => Effect.Effect<ConversationDetail, CrmConversationFailure>;
  readonly sendText: (
    actor: CrmActor,
    contactId: CrmContactId.Id,
    body: string,
  ) => Effect.Effect<ConversationDetail, CrmConversationFailure>;
  readonly sendTemplate: (
    actor: CrmActor,
    contactId: CrmContactId.Id,
    choice: ConversationTemplateChoice,
  ) => Effect.Effect<ConversationDetail, CrmConversationFailure>;
  readonly receive: (
    message: WhatsApp.Model.Inbound,
  ) => Effect.Effect<void, CrmConversationFailure>;
  readonly simulateReply: (
    actor: CrmActor,
    contactId: CrmContactId.Id,
    body: string,
  ) => Effect.Effect<ConversationDetail, CrmConversationFailure>;
  readonly approvedTemplates: Effect.Effect<
    ReadonlyArray<ConversationTemplate>,
    CrmConversationFailure
  >;
}

export class CrmConversationService extends Context.Service<
  CrmConversationService,
  ICrmConversationService
>()("@kikos/crm-services/Services/Conversation/CrmConversationService") {}
const failed = Effect.mapError(
  (e: { readonly message: string }) => new CrmConversationError({ message: e.message }),
);

const BRAZIL_COUNTRY_CODE = "55";

const requireCan = (
  ability: Policy.CrmAbility,
  action: Policy.ContactAction,
  reachable: Policy.ReachableContact,
) =>
  Ability.require(ability, action, reachable).pipe(
    Effect.mapError((e) => new CrmForbiddenError({ message: e.message })),
  );

export const make = Effect.gen(function* () {
  const contacts = yield* ContactPersistence.Repository;
  const conversations = yield* ConversationPersistence.Repository;
  const messages = yield* ConversationMessagePersistence.Repository;
  const opportunities = yield* OpportunityPersistence.Repository;
  const gateway = yield* WhatsApp.WhatsAppGateway;
  const media = yield* ConversationMediaPersistence.Repository;

  const requireContact = Effect.fn("requireContact")(function* (id: CrmContactId.Id) {
    const found = yield* contacts.findById(id).pipe(failed);
    if (Option.isNone(found)) {
      return yield* Effect.fail(
        new CrmNotFoundError({ reason: "contact_not_found", message: `No crm contact ${id}` }),
      );
    }
    return found.value;
  });

  const reachable = Effect.fn("reachable")(function* (contact: Contact.Contact) {
    const held = yield* opportunities.forContact(contact.id).pipe(failed);
    return Policy.reachableContact({ contact, opportunities: held });
  });

  const threadOf = Effect.fn("threadOf")(function* (contactId: CrmContactId.Id) {
    const found = yield* conversations.forContact(contactId).pipe(failed);
    if (Option.isSome(found)) return found.value;
    return yield* conversations
      .save(yield* Conversation.make({ contactId }).pipe(failed))
      .pipe(failed);
  });

  const detailOf = Effect.fn("detailOf")(function* (
    conversation: Conversation.Conversation,
    contact: Contact.Contact,
  ) {
    const now = yield* DateTime.now;
    return {
      conversation,
      contact,
      messages: yield* messages.forConversation(conversation.id).pipe(failed),
      windowOpen: Conversation.windowIsOpen(conversation, now),
    };
  });

  const recipientOf = Effect.fn("recipientOf")(function* (contact: Contact.Contact) {
    if (contact.phone === undefined) {
      return yield* Effect.fail(
        new CrmConversationError({ message: "Este contato não tem telefone." }),
      );
    }
    const identity = Contact.Identity.identityOf({ phone: contact.phone });
    if (identity.phone === undefined) {
      return yield* Effect.fail(
        new CrmConversationError({ message: "O telefone deste contato não é um número válido." }),
      );
    }
    const phoneWithCountryCode = `${BRAZIL_COUNTRY_CODE}${identity.phone}`;
    return yield* Schema.decodeUnknownEffect(WhatsApp.Model.WhatsAppPhone)(
      phoneWithCountryCode,
    ).pipe(failed);
  });

  const detail: ICrmConversationService["detail"] = Effect.fn("detail")(
    function* (actor, contactId) {
      const contact = yield* requireContact(contactId);
      yield* requireCan(actor.ability, "read", yield* reachable(contact));
      return yield* detailOf(yield* threadOf(contactId), contact);
    },
  );

  const sendText: ICrmConversationService["sendText"] = Effect.fn("sendText")(
    function* (actor, contactId, body) {
      const contact = yield* requireContact(contactId);
      yield* requireCan(actor.ability, "converse", yield* reachable(contact));

      const conversation = yield* threadOf(contactId);
      const now = yield* DateTime.now;
      if (!Conversation.windowIsOpen(conversation, now)) {
        return yield* Effect.fail(
          new CrmConflictError({
            reason: "conversation_window_closed",
            message: "A janela de 24 horas fechou. Só um template aprovado pode ser enviado agora.",
          }),
        );
      }
      const to = yield* recipientOf(contact);

      const externalId = yield* gateway
        .send({ messaging_product: "whatsapp", type: "text", to, text: { body } })
        .pipe(failed);

      yield* messages
        .save(
          new Conversation.Message.Text({
            id: yield* CrmConversationMessageId.makeId.pipe(failed),
            conversationId: conversation.id,
            direction: "outbound",
            kind: "text",
            body,
            authorId: actor.principal.id,
            externalId,
            sentAt: now,
            createdAt: now,
            updatedAt: now,
          }),
        )
        .pipe(failed);

      return yield* detailOf(conversation, contact);
    },
  );

  const sendTemplate: ICrmConversationService["sendTemplate"] = Effect.fn("sendTemplate")(
    function* (actor, contactId, choice) {
      const contact = yield* requireContact(contactId);
      yield* requireCan(actor.ability, "converse", yield* reachable(contact));

      const approved = yield* gateway.approvedTemplates.pipe(failed);
      const template = approved.find(
        (candidate) => candidate.name === choice.name && candidate.language === choice.language,
      );
      if (template === undefined) {
        return yield* Effect.fail(
          new CrmConversationError({ message: "Este template não está entre os aprovados." }),
        );
      }

      const conversation = yield* threadOf(contactId);
      const now = yield* DateTime.now;
      const to = yield* recipientOf(contact);

      const externalId = yield* gateway
        .send({
          messaging_product: "whatsapp",
          type: "template",
          to,
          template: {
            name: template.name,
            language: { code: template.language },
            components: [],
          },
        })
        .pipe(failed);

      yield* messages
        .save(
          new Conversation.Message.Template({
            id: yield* CrmConversationMessageId.makeId.pipe(failed),
            conversationId: conversation.id,
            direction: "outbound",
            kind: "template",
            templateName: template.name,
            parameters: [],
            ...(template.body === "" ? {} : { body: template.body }),
            authorId: actor.principal.id,
            externalId,
            sentAt: now,
            createdAt: now,
            updatedAt: now,
          }),
        )
        .pipe(failed);

      return yield* detailOf(conversation, contact);
    },
  );

  const receive: ICrmConversationService["receive"] = Effect.fn("receive")(function* (message) {
    const identity = Contact.Identity.identityOf({ phone: message.from });
    if (identity.phone === undefined) return;

    const found = yield* contacts
      .findByIdentity({ email: undefined, phone: identity.phone })
      .pipe(failed);
    if (Option.isNone(found.byPhone)) return;

    const contact = found.byPhone.value;
    const conversation = yield* threadOf(contact.id);
    const at = DateTime.makeUnsafe(Number(message.timestamp) * 1000);
    const id = yield* CrmConversationMessageId.makeId.pipe(failed);

    const base = {
      id,
      conversationId: conversation.id,
      direction: "inbound" as const,
      externalId: message.id,
      sentAt: at,
      createdAt: at,
      updatedAt: at,
    };

    if (message.type === "text") {
      yield* messages
        .save(new Conversation.Message.Text({ ...base, kind: "text", body: message.text.body }))
        .pipe(failed);
    } else {
      const data = yield* gateway.download(message.media.id).pipe(failed);
      const decoded = yield* Schema.decodeUnknownEffect(PrimitiveFile.File)({
        mediaType: message.media.mimeType,
        data,
      }).pipe(failed);

      yield* messages
        .save(
          new Conversation.Message.Media({
            ...base,
            kind: "media",
            filename: message.media.filename ?? `${id}`,
            mediaType: decoded.mediaType,
            sizeBytes: data.byteLength,
            ...(message.media.caption === undefined ? {} : { body: message.media.caption }),
          }),
        )
        .pipe(failed);
      yield* media.save(id, data).pipe(failed);
    }

    yield* conversations
      .save(new Conversation.Conversation({ ...conversation, lastInboundAt: at, updatedAt: at }))
      .pipe(failed);
  });

  const simulateReply: ICrmConversationService["simulateReply"] = Effect.fn("simulateReply")(
    function* (actor, contactId, body) {
      const contact = yield* requireContact(contactId);
      yield* requireCan(actor.ability, "read", yield* reachable(contact));

      const from = yield* recipientOf(contact);
      const now = yield* DateTime.now;
      const message = yield* Schema.decodeUnknownEffect(WhatsApp.Model.InboundText)({
        id: `wamid.sim${DateTime.toEpochMillis(now)}`,
        from,
        timestamp: String(Math.floor(DateTime.toEpochMillis(now) / 1000)),
        type: "text",
        text: { body },
      }).pipe(failed);

      yield* receive(message);
      return yield* detailOf(yield* threadOf(contactId), contact);
    },
  );

  const approvedTemplates = gateway.approvedTemplates.pipe(failed);

  return CrmConversationService.of({
    detail,
    sendText,
    sendTemplate,
    receive,
    simulateReply,
    approvedTemplates,
  });
});

export const layer = Layer.effect(CrmConversationService)(make);
