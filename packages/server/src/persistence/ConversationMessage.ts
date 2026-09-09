import { Conversation, CrmConversationId, CrmConversationMessageId } from "@crm-chat/domain";
import { Database, Tables } from "../db";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { deletion, isoOf, optionalIsoOf, present } from "./Row";

export class ConversationMessageRepositoryError extends Schema.TaggedError<ConversationMessageRepositoryError>()(
  "Persistance.Crm.ConversationMessage.RepositoryError",
  { message: Schema.String },
) {}

export interface IConversationMessageRepository {
  readonly save: (
    message: Conversation.Message.Any,
  ) => Effect.Effect<Conversation.Message.Any, ConversationMessageRepositoryError>;
  readonly forConversation: (
    conversationId: CrmConversationId.Id,
  ) => Effect.Effect<Conversation.Message.Any[], ConversationMessageRepositoryError>;
  readonly findByExternalId: (
    externalId: string,
  ) => Effect.Effect<Option.Option<Conversation.Message.Any>, ConversationMessageRepositoryError>;
}

export class Repository extends Context.Service<Repository, IConversationMessageRepository>()(
  "@kikos/crm-services/Persistance/ConversationMessage/Repository",
) {}

const failed = Effect.mapError(
  (e: { readonly message: string }) =>
    new ConversationMessageRepositoryError({ message: e.message }),
);

const decodeMessage = Schema.decodeUnknownEffect(Schema.toCodecJson(Conversation.Message.Any));

const tagOf = {
  text: "CrmConversationMessage.Text",
  media: "CrmConversationMessage.Media",
  template: "CrmConversationMessage.Template",
} as const satisfies Record<Conversation.Message.Any["kind"], Conversation.Message.Any["_tag"]>;

type MessageRow = typeof Tables.crmConversationMessages.$inferSelect;

const toRow = (
  message: Conversation.Message.Any,
): typeof Tables.crmConversationMessages.$inferInsert => {
  const base = {
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction,
    kind: message.kind,
    authorId: message.authorId ?? null,
    externalId: message.externalId ?? null,
    sentAt: isoOf(message.sentAt),
    deliveredAt: optionalIsoOf(message.deliveredAt),
    readAt: optionalIsoOf(message.readAt),
    createdAt: isoOf(message.createdAt),
    updatedAt: isoOf(message.updatedAt),
    deletedAt: optionalIsoOf(message.deletedAt),
  };
  switch (message.kind) {
    case "text":
      return { ...base, body: message.body };
    case "media":
      return {
        ...base,
        body: message.body ?? null,
        filename: message.filename,
        mediaType: message.mediaType,
        sizeBytes: message.sizeBytes,
      };
    case "template":
      return {
        ...base,
        body: message.body ?? null,
        templateName: message.templateName,
        templateParameters: [...message.parameters],
      };
  }
};

const fromRow = (row: MessageRow) =>
  decodeMessage({
    _tag: tagOf[row.kind],
    kind: row.kind,
    id: row.id,
    conversationId: row.conversationId,
    direction: row.direction,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...present({
      authorId: row.authorId,
      externalId: row.externalId,
      deliveredAt: row.deliveredAt,
      readAt: row.readAt,
      body: row.body,
      filename: row.filename,
      mediaType: row.mediaType,
      sizeBytes: row.sizeBytes,
      templateName: row.templateName,
    }),
    ...(row.templateParameters === null ? {} : { parameters: row.templateParameters }),
    ...deletion(row.deletedAt),
  });

const alive = isNull(Tables.crmConversationMessages.deletedAt);

export const makeSql = Effect.gen(function* () {
  const db = yield* Database.Database;

  const save: IConversationMessageRepository["save"] = Effect.fn("save")(function* (message) {
    const row = toRow(message);
    const { id: _, createdAt: __, ...patch } = row;
    yield* db
      .insert(Tables.crmConversationMessages)
      .values(row)
      .onConflictDoUpdate({ target: Tables.crmConversationMessages.id, set: patch });
    return message;
  }, failed);

  const forConversation: IConversationMessageRepository["forConversation"] = Effect.fn(
    "forConversation",
  )(function* (conversationId) {
    const rows = yield* db
      .select()
      .from(Tables.crmConversationMessages)
      .where(and(eq(Tables.crmConversationMessages.conversationId, conversationId), alive))
      .orderBy(asc(Tables.crmConversationMessages.sentAt));
    return yield* Effect.forEach(rows, fromRow);
  }, failed);

  const findByExternalId: IConversationMessageRepository["findByExternalId"] = Effect.fn(
    "findByExternalId",
  )(function* (externalId) {
    const rows = yield* db
      .select()
      .from(Tables.crmConversationMessages)
      .where(and(eq(Tables.crmConversationMessages.externalId, externalId), alive));
    const row = rows[0];
    return row === undefined ? Option.none() : Option.some(yield* fromRow(row));
  }, failed);

  return Repository.of({ save, forConversation, findByExternalId });
});

export const layerSql = Layer.effect(Repository)(makeSql);

const bySentAt = (a: Conversation.Message.Any, b: Conversation.Message.Any) =>
  DateTime.toEpochMillis(a.sentAt) - DateTime.toEpochMillis(b.sentAt);

const makeMemory = Effect.gen(function* () {
  const store = new Map<CrmConversationMessageId.Id, Conversation.Message.Any>();

  const living = () =>
    Array.from(store.values()).filter((message) => message.deletedAt === undefined);

  const save: IConversationMessageRepository["save"] = (message) =>
    Effect.sync(() => {
      store.set(message.id, message);
      return message;
    });

  const forConversation: IConversationMessageRepository["forConversation"] = (conversationId) =>
    Effect.sync(() =>
      living()
        .filter((message) => message.conversationId === conversationId)
        .sort(bySentAt),
    );

  const findByExternalId: IConversationMessageRepository["findByExternalId"] = (externalId) =>
    Effect.sync(() =>
      Option.fromNullishOr(living().find((message) => message.externalId === externalId)),
    );

  return Repository.of({ save, forConversation, findByExternalId });
});

export const layerMemory = Layer.effect(Repository)(makeMemory);