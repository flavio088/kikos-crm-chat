import { CrmContactId, CrmConversationId } from "@kikos/effect-identity";
import { Timestampable } from "@kikos/primitives";
import { DateTime, Effect, Schema } from "effect";

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

const CUSTOMER_REPLY_WINDOW_MILLIS = 24 * 60 * 60 * 1000;

export const windowIsOpen = (conversation: Conversation, now: DateTime.Utc): boolean => {
  const lastCustomerMessageAt = conversation.lastInboundAt;
  if (lastCustomerMessageAt === undefined) return false;
  const millisSinceLastCustomerMessage =
    DateTime.toEpochMillis(now) - DateTime.toEpochMillis(lastCustomerMessageAt);
  return millisSinceLastCustomerMessage < CUSTOMER_REPLY_WINDOW_MILLIS;
};