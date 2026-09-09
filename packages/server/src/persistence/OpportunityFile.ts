import { CrmOpportunityFileId, CrmOpportunityId, OpportunityFile } from "@crm-chat/domain";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Database, Tables } from "../db";
import { deletion, isoOf, optionalIsoOf } from "./Row";

export class OpportunityFileRepositoryError extends Schema.TaggedError<OpportunityFileRepositoryError>()(
  "Persistance.Crm.OpportunityFile.RepositoryError",
  { message: Schema.String },
) {}

export interface IOpportunityFileRepository {
  readonly save: (
    file: OpportunityFile.OpportunityFile,
  ) => Effect.Effect<OpportunityFile.OpportunityFile, OpportunityFileRepositoryError>;
  readonly findById: (
    id: CrmOpportunityFileId.Id,
  ) => Effect.Effect<Option.Option<OpportunityFile.OpportunityFile>, OpportunityFileRepositoryError>;
  readonly forOpportunity: (
    opportunityId: CrmOpportunityId.Id,
  ) => Effect.Effect<OpportunityFile.OpportunityFile[], OpportunityFileRepositoryError>;
  readonly remove: (
    file: OpportunityFile.OpportunityFile,
  ) => Effect.Effect<void, OpportunityFileRepositoryError>;
}

export class Repository extends Context.Service<Repository, IOpportunityFileRepository>()(
  "@crm-chat/server/persistence/OpportunityFile/Repository",
) {}

const failed = Effect.mapError(
  (e: { readonly message: string }) => new OpportunityFileRepositoryError({ message: e.message }),
);

const decodeFile = Schema.decodeUnknownEffect(Schema.toCodecJson(OpportunityFile.OpportunityFile));

type FileRow = typeof Tables.crmOpportunityFiles.$inferSelect;

const toRow = (
  file: OpportunityFile.OpportunityFile,
): typeof Tables.crmOpportunityFiles.$inferInsert => ({
  id: file.id,
  opportunityId: file.opportunityId,
  filename: file.filename,
  mediaType: file.mediaType,
  sizeBytes: file.sizeBytes,
  authorId: file.authorId,
  createdAt: isoOf(file.createdAt),
  updatedAt: isoOf(file.updatedAt),
  deletedAt: optionalIsoOf(file.deletedAt),
});

const fromRow = (row: FileRow) =>
  decodeFile({
    id: row.id,
    opportunityId: row.opportunityId,
    filename: row.filename,
    mediaType: row.mediaType,
    sizeBytes: row.sizeBytes,
    authorId: row.authorId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...deletion(row.deletedAt),
  });

const alive = isNull(Tables.crmOpportunityFiles.deletedAt);

export const makeSql = Effect.gen(function* () {
  const db = yield* Database.Database;

  const save: IOpportunityFileRepository["save"] = Effect.fn("save")(function* (file) {
    const row = toRow(file);
    const { id: _, createdAt: __, ...patch } = row;
    yield* db
      .insert(Tables.crmOpportunityFiles)
      .values(row)
      .onConflictDoUpdate({ target: Tables.crmOpportunityFiles.id, set: patch });
    return file;
  }, failed);

  const findById: IOpportunityFileRepository["findById"] = Effect.fn("findById")(function* (id) {
    const rows = yield* db
      .select()
      .from(Tables.crmOpportunityFiles)
      .where(and(eq(Tables.crmOpportunityFiles.id, id), alive));
    const row = rows[0];
    return row === undefined ? Option.none() : Option.some(yield* fromRow(row));
  }, failed);

  const forOpportunity: IOpportunityFileRepository["forOpportunity"] = Effect.fn(
    "forOpportunity",
  )(function* (opportunityId) {
    const rows = yield* db
      .select()
      .from(Tables.crmOpportunityFiles)
      .where(and(eq(Tables.crmOpportunityFiles.opportunityId, opportunityId), alive))
      .orderBy(asc(Tables.crmOpportunityFiles.createdAt));
    return yield* Effect.forEach(rows, fromRow);
  }, failed);

  const remove: IOpportunityFileRepository["remove"] = Effect.fn("remove")(function* (file) {
    const now = yield* DateTime.now;
    yield* db
      .update(Tables.crmOpportunityFiles)
      .set({ deletedAt: isoOf(now), updatedAt: isoOf(now) })
      .where(eq(Tables.crmOpportunityFiles.id, file.id));
  }, failed);

  return Repository.of({ save, findById, forOpportunity, remove });
});

export const layerSql = Layer.effect(Repository)(makeSql);
