import { CrmConversationMessageId } from "@kikos/effect-identity";
import * as FileContent from "@kikos/file-content";
import { Database, Tables } from "@kikos/persistance";
import { eq } from "drizzle-orm";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { isoOf } from "../utils/Row";

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

/**
 * Where a message's bytes live in the bucket. Prefixed for the same reason the
 * opportunity files are: the bucket is not promised to hold only these.
 */
const keyOf = (messageId: CrmConversationMessageId.Id) => `crm-conversation-media/${messageId}`;

const fromStore = (store: FileContent.IFileContentStore): IConversationMediaRepository => ({
  save: (messageId, data) => store.save(keyOf(messageId), data).pipe(failed),
  findByMessageId: (messageId) => store.find(keyOf(messageId)).pipe(failed),
});

export const makeMemory = Effect.map(FileContent.makeMemory, fromStore).pipe(
  Effect.map(Repository.of),
);

export const layerMemory = Layer.effect(Repository)(makeMemory);