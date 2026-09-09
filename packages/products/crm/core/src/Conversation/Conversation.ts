import { CrmContactId, CrmConversationId } from "@kikos/effect-identity";
import { Timestampable } from "@kikos/primitives";
import { DateTime, Effect, Schema } from "effect";

/**
 * The thread with one contact.
 *
 * `lastInboundAt` is the whole of what this entity carries beyond identity,
 * and it is here because Meta's twenty-four hour rule is read on every screen
 * that draws the composer: only a message from the customer opens the window,
 * and outside it nothing but an approved template may be sent.
 *
 * Absent means the customer has never written — the window was never open.
 */
export class Conversation extends Schema.Class<Conversation, { readonly _: unique symbol }>(
  "CrmConversation",
)({
  id: CrmConversationId.Id,
  contactId: CrmContactId.Id,
  lastInboundAt: Schema.DateTimeUtc.pipe(Schema.optional, Schema.optionalKey),
  ...Timestampable,
}) {}

export const make = (input: { readonly contactId: CrmContactId.Id }) =>
  Effect.gen(function* () {
    const id = yield* CrmConversationId.makeId;
    return yield* Effect.mapError(
      Conversation.makeEffect({ ...input, id }),
      (issue) => new Schema.SchemaError(issue),
    );
  });

/** The window Meta enforces: twenty-four hours from the customer's last message. */
const WINDOW_MILLIS = 24 * 60 * 60 * 1000;

/**
 * Whether a free-form message may be sent right now.
 *
 * Read by the screen to decide what the composer offers, and by the service
 * before it sends — the screen is not the guard, it is the courtesy of saying
 * so before somebody types.
 */
export const windowIsOpen = (conversation: Conversation, now: DateTime.Utc): boolean =>
  conversation.lastInboundAt !== undefined &&
  DateTime.toEpochMillis(now) - DateTime.toEpochMillis(conversation.lastInboundAt) < WINDOW_MILLIS;