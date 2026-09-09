import { Conversation } from "@kikos/crm-core";
import { CrmContactId, CrmConversationId } from "@kikos/effect-identity";
import { Database, Tables } from "@kikos/persistance";
import { and, eq, isNull } from "drizzle-orm";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { deletion, isoOf, optionalIsoOf } from "../utils/Row";

export class ConversationRepositoryError extends Schema.TaggedError<ConversationRepositoryError>()(
  "Persistance.Crm.Conversation.RepositoryError",
  { message: Schema.String },
) {}

export interface IConversationRepository {
  readonly save: (
    conversation: Conversation.Conversation,
  ) => Effect.Effect<Conversation.Conversation, ConversationRepositoryError>;
  readonly forContact: (
    contactId: CrmContactId.Id,
  ) => Effect.Effect<Option.Option<Conversation.Conversation>, ConversationRepositoryError>;
  readonly findById: (
    id: CrmConversationId.Id,
  ) => Effect.Effect<Option.Option<Conversation.Conversation>, ConversationRepositoryError>;
}

export class Repository extends Context.Service<Repository, IConversationRepository>()(
  "@kikos/crm-services/Persistance/Conversation/Repository",
) {}

const failed = Effect.mapError(
  (e: { readonly message: string }) => new ConversationRepositoryError({ message: e.message }),
);

const decodeConversation = Schema.decodeUnknownEffect(
  Schema.toCodecJson(Conversation.Conversation),
);

type ConversationRow = typeof Tables.crmConversations.$inferSelect;

const toRow = (
  conversation: Conversation.Conversation,
): typeof Tables.crmConversations.$inferInsert => ({
  id: conversation.id,
  contactId: conversation.contactId,
  lastInboundAt: optionalIsoOf(conversation.lastInboundAt),
  createdAt: isoOf(conversation.createdAt),
  updatedAt: isoOf(conversation.updatedAt),
  deletedAt: optionalIsoOf(conversation.deletedAt),
});

const fromRow = (row: ConversationRow) =>
  decodeConversation({
    id: row.id,
    contactId: row.contactId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.lastInboundAt === null ? {} : { lastInboundAt: row.lastInboundAt }),
    ...deletion(row.deletedAt),
  });

const alive = isNull(Tables.crmConversations.deletedAt);

export const makeSql = Effect.gen(function* () {
  const db = yield* Database.Database;

  const save: IConversationRepository["save"] = Effect.fn("save")(function* (conversation) {
    const row = toRow(conversation);
    const { id: _, createdAt: __, ...patch } = row;
    yield* db
      .insert(Tables.crmConversations)
      .values(row)
      .onConflictDoUpdate({ target: Tables.crmConversations.id, set: patch });
    return conversation;
  }, failed);

  const forContact: IConversationRepository["forContact"] = Effect.fn("forContact")(function* (
    contactId,
  ) {
    const rows = yield* db
      .select()
      .from(Tables.crmConversations)
      .where(and(eq(Tables.crmConversations.contactId, contactId), alive));
    const row = rows[0];
    return row === undefined ? Option.none() : Option.some(yield* fromRow(row));
  }, failed);

  const findById: IConversationRepository["findById"] = Effect.fn("findById")(function* (id) {
    const rows = yield* db
      .select()
      .from(Tables.crmConversations)
      .where(and(eq(Tables.crmConversations.id, id), alive));
    const row = rows[0];
    return row === undefined ? Option.none() : Option.some(yield* fromRow(row));
  }, failed);

  return Repository.of({ save, forContact, findById });
});

export const layerSql = Layer.effect(Repository)(makeSql);

const makeMemory = Effect.gen(function* () {
  const store = new Map<CrmConversationId.Id, Conversation.Conversation>();

  const living = () =>
    Array.from(store.values()).filter((conversation) => conversation.deletedAt === undefined);

  const save: IConversationRepository["save"] = (conversation) =>
    Effect.sync(() => {
      store.set(conversation.id, conversation);
      return conversation;
    });

  const forContact: IConversationRepository["forContact"] = (contactId) =>
    Effect.sync(() =>
      Option.fromNullishOr(living().find((conversation) => conversation.contactId === contactId)),
    );

  const findById: IConversationRepository["findById"] = (id) =>
    Effect.sync(() =>
      Option.fromNullishOr(living().find((conversation) => conversation.id === id)),
    );

  return Repository.of({ save, forContact, findById });
});

export const layerMemory = Layer.effect(Repository)(makeMemory);
