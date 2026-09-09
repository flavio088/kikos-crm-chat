import { ConversationMediaPersistence } from "../../Persistance/ConversationMedia";
import { Ability } from "@kikos/ability";
import { Contact, Conversation, Policy } from "@kikos/crm-core";
import { CrmContactId, CrmConversationId, CrmConversationMessageId } from "@kikos/effect-identity";
import { File as PrimitiveFile } from "@kikos/primitives";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { ContactPersistence } from "../../Persistance/Contact";
import { ConversationPersistence } from "../../Persistance/Conversation";
import { ConversationMessagePersistence } from "../../Persistance/ConversationMessage";
import { OpportunityPersistence } from "../../Persistance/Opportunity";
import {
  CrmConflictError,
  CrmForbiddenError,
  CrmNotFoundError,
  type CrmActor,
} from "../Destination";
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

/**
 * A thread with everything the screen draws it from: the person, the messages,
 * and whether a free-form reply may be sent at all.
 *
 * `windowOpen` is computed rather than left to the caller because the rule is
 * Meta's and not the screen's — a second reading of the same twenty-four hours
 * is a second place for it to drift.
 */
export type ConversationDetail = {
  readonly conversation: Conversation.Conversation;
  readonly contact: Contact.Contact;
  readonly messages: ReadonlyArray<Conversation.Message.Any>;
  readonly windowOpen: boolean;
};

export interface ICrmConversationService {
  /** The thread of one contact, opened if the person has never been written to. */
  readonly detail: (
    actor: CrmActor,
    contactId: CrmContactId.Id,
  ) => Effect.Effect<ConversationDetail, CrmConversationFailure>;
  /**
   * Sends free text, and refuses once the window has closed — the same refusal
   * Meta would answer with, made here so the message is never spent finding out.
   */
  readonly sendText: (
    actor: CrmActor,
    contactId: CrmContactId.Id,
    body: string,
  ) => Effect.Effect<ConversationDetail, CrmConversationFailure>;
  /**
   * Records what arrived. Not an actor's call — the webhook has no user behind
   * it, and the number decides whose thread this is.
   */
  readonly receive: (
    message: WhatsApp.Model.Inbound,
  ) => Effect.Effect<void, CrmConversationFailure>;
  /**
   * The approved templates, which are the only thing sendable once the window
   * has closed. Not scoped to a contact: they belong to the account, and the
   * group's `Authorization` is what says whether the caller may see them.
   */
  readonly templates: Effect.Effect<
    ReadonlyArray<{ readonly name: string; readonly language: string }>,
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

/**
 * A contact is reachable exactly as far as its work is — the reading
 * `Policy.ReachableContact` already carries, folded from the placements of
 * every opportunity the person holds.
 */
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
  // oxlint-disable-next-line no-unused-vars
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

  /**
   * The person as the ability sees them: every store holding one of their
   * opportunities, and every seller assigned to one. Both are read whole
   * rather than scoped, so the answer is about the person and not about the
   * slice this caller happens to reach.
   */
  const reachable = Effect.fn("reachable")(function* (contact: Contact.Contact) {
    const held = yield* opportunities.forContact(contact.id).pipe(failed);
    return Policy.reachableContact({
      contact,
      destinations: held.flatMap((one) =>
        one.placed.destinationId === undefined ? [] : [one.placed.destinationId],
      ),
      assignedTo: held.flatMap((one) =>
        one.placed.assignedTo === undefined ? [] : [one.placed.assignedTo],
      ),
    });
  });

  /**
   * The thread, opened on first use. A contact who was never written to has no
   * row, and creating one on read is what keeps the screen from needing a
   * separate "start conversation" step for something that starts by being
   * looked at.
   */
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

  const detail: ICrmConversationService["detail"] = Effect.fn("detail")(
    function* (actor, contactId) {
      const contact = yield* requireContact(contactId);
      yield* requireCan(actor.ability, "read", yield* reachable(contact));
      return yield* detailOf(yield* threadOf(contactId), contact);
    },
  );

  /**
   * Free text out, and the window checked first.
   *
   * Meta refuses this once twenty-four hours have passed since the customer's
   * last message, and refusing here rather than there is what keeps a message
   * from being spent to find out. The screen reads the same flag and disables
   * the box — this is the guard, that is the courtesy.
   */
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
      /**
       * The phone as the api addresses one, rebuilt from what the crm stores:
       * `Phone.normalize` strips the country code on the way in, so it goes back
       * on here. A contact with no phone key never had a reachable number.
       */
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
      const to = yield* Schema.decodeUnknownEffect(WhatsApp.Model.WhatsAppPhone)(
        `55${identity.phone}`,
      ).pipe(failed);

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

  /**
   * What arrived, filed under whoever the number belongs to.
   *
   * A number that resolves to nobody is not made into a contact. The crm
   * settles identity through `phone_key` with a partial unique index and a
   * conflict flag — a design built to not write the same person down twice —
   * and a row for every wrong number would be the opposite of that.
   */
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
      /**
       * Media arrives as a handle, and the bytes are a second request against
       * a url that expires — so they are fetched now rather than lazily. The
       * row is written first because the content table points at it.
       */
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

    /** The receipt that opens the window. Only a message from them does it. */
    yield* conversations
      .save(new Conversation.Conversation({ ...conversation, lastInboundAt: at, updatedAt: at }))
      .pipe(failed);
  });

  const templates = gateway.templates.pipe(failed);

  return CrmConversationService.of({ detail, sendText, receive, templates });
});

export const layer = Layer.effect(CrmConversationService)(make);
