import { CrmConversationMessageId } from "@crm-chat/domain";
import { Database, Tables } from "../db";
import { eq } from "drizzle-orm";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { isoOf } from "./Row";

export class ConversationMediaRepositoryError extends Schema.TaggedError<ConversationMediaRepositoryError>()(
  "Persistance.Crm.ConversationMedia.RepositoryError",
  { message: Schema.String },
) {}

export interface IConversationMediaRepository {
  readonly save: (
    messageId: CrmConversationMessageId.Id,
    data: Uint8Array,
  ) => Effect.Effect<void, ConversationMediaRepositoryError>;
  readonly findByMessageId: (
    messageId: CrmConversationMessageId.Id,
  ) => Effect.Effect<Option.Option<Uint8Array>, ConversationMediaRepositoryError>;
}

export class Repository extends Context.Service<Repository, IConversationMediaRepository>()(
  "@kikos/crm-services/Persistance/ConversationMedia/Repository",
) {}

const failed = Effect.mapError(
  (error: { readonly message: string }) =>
    new ConversationMediaRepositoryError({ message: error.message }),
);

export const makeSql = Effect.gen(function* () {
  const db = yield* Database.Database;

  const save: IConversationMediaRepository["save"] = Effect.fn(
    "ConversationMediaRepository.save",
  )(function* (messageId, data) {
    const now = yield* DateTime.now;
    yield* db
      .insert(Tables.crmConversationMedia)
      .values({ messageId, data: Buffer.from(data), createdAt: isoOf(now), updatedAt: isoOf(now) })
      .onConflictDoUpdate({
        target: Tables.crmConversationMedia.messageId,
        set: { data: Buffer.from(data), updatedAt: isoOf(now) },
      });
  }, failed);

  const findByMessageId: IConversationMediaRepository["findByMessageId"] = Effect.fn(
    "ConversationMediaRepository.findByMessageId",
  )(function* (messageId) {
    const rows = yield* db
      .select({ data: Tables.crmConversationMedia.data })
      .from(Tables.crmConversationMedia)
      .where(eq(Tables.crmConversationMedia.messageId, messageId));
    const row = rows[0];
    return row === undefined ? Option.none() : Option.some(new Uint8Array(row.data));
  }, failed);

  return Repository.of({ save, findByMessageId });
});

export const layerSql = Layer.effect(Repository)(makeSql);

const makeMemory = Effect.sync((): IConversationMediaRepository => {
  const store = new Map<CrmConversationMessageId.Id, Uint8Array>();
  return {
    save: (messageId, data) => Effect.sync(() => void store.set(messageId, data.slice())),
    findByMessageId: (messageId) =>
      Effect.sync(() => Option.fromNullishOr(store.get(messageId)?.slice())),
  };
});

export const layerMemory = Layer.effect(Repository)(makeMemory);
