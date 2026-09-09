import { CrmOpportunityFileId } from "@crm-chat/domain";
import { eq } from "drizzle-orm";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Database, Tables } from "../db";
import { isoOf } from "./Row";

export class OpportunityFileContentRepositoryError extends Schema.TaggedError<OpportunityFileContentRepositoryError>()(
  "Persistance.Crm.OpportunityFileContent.RepositoryError",
  { message: Schema.String },
) {}

export interface IOpportunityFileContentRepository {
  readonly save: (
    fileId: CrmOpportunityFileId.Id,
    data: Uint8Array,
  ) => Effect.Effect<void, OpportunityFileContentRepositoryError>;
  readonly findByFileId: (
    fileId: CrmOpportunityFileId.Id,
  ) => Effect.Effect<Option.Option<Uint8Array>, OpportunityFileContentRepositoryError>;
  readonly remove: (
    fileId: CrmOpportunityFileId.Id,
  ) => Effect.Effect<void, OpportunityFileContentRepositoryError>;
}

export class Repository extends Context.Service<Repository, IOpportunityFileContentRepository>()(
  "@crm-chat/server/persistence/OpportunityFileContent/Repository",
) {}

const failed = Effect.mapError(
  (error: { readonly message: string }) =>
    new OpportunityFileContentRepositoryError({ message: error.message }),
);

export const makeSql = Effect.gen(function* () {
  const db = yield* Database.Database;

  const save: IOpportunityFileContentRepository["save"] = Effect.fn(
    "OpportunityFileContentRepository.save",
  )(function* (fileId, data) {
    const now = yield* DateTime.now;
    yield* db
      .insert(Tables.crmOpportunityFileContents)
      .values({ fileId, data: Buffer.from(data), createdAt: isoOf(now), updatedAt: isoOf(now) })
      .onConflictDoUpdate({
        target: Tables.crmOpportunityFileContents.fileId,
        set: { data: Buffer.from(data), updatedAt: isoOf(now) },
      });
  }, failed);

  const findByFileId: IOpportunityFileContentRepository["findByFileId"] = Effect.fn(
    "OpportunityFileContentRepository.findByFileId",
  )(function* (fileId) {
    const rows = yield* db
      .select({ data: Tables.crmOpportunityFileContents.data })
      .from(Tables.crmOpportunityFileContents)
      .where(eq(Tables.crmOpportunityFileContents.fileId, fileId));
    const row = rows[0];
    return row === undefined ? Option.none() : Option.some(new Uint8Array(row.data));
  }, failed);

  const remove: IOpportunityFileContentRepository["remove"] = Effect.fn(
    "OpportunityFileContentRepository.remove",
  )(function* (fileId) {
    yield* db
      .delete(Tables.crmOpportunityFileContents)
      .where(eq(Tables.crmOpportunityFileContents.fileId, fileId));
  }, failed);

  return Repository.of({ save, findByFileId, remove });
});

export const layerSql = Layer.effect(Repository)(makeSql);
