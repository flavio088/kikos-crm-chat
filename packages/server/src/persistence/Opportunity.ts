import { CrmContactId, CrmOpportunityId, Opportunity } from "@crm-chat/domain";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { Database, Tables } from "../db";
import { deletion, isoOf, optionalIsoOf } from "./Row";

export class OpportunityRepositoryError extends Schema.TaggedError<OpportunityRepositoryError>()(
  "Persistance.Crm.Opportunity.RepositoryError",
  { message: Schema.String },
) {}

export interface IOpportunityRepository {
  readonly save: (
    opportunity: Opportunity.Opportunity,
  ) => Effect.Effect<Opportunity.Opportunity, OpportunityRepositoryError>;
  readonly findById: (
    id: CrmOpportunityId.Id,
  ) => Effect.Effect<Option.Option<Opportunity.Opportunity>, OpportunityRepositoryError>;
  readonly forContact: (
    contactId: CrmContactId.Id,
  ) => Effect.Effect<Opportunity.Opportunity[], OpportunityRepositoryError>;
  readonly all: () => Effect.Effect<Opportunity.Opportunity[], OpportunityRepositoryError>;
}

export class Repository extends Context.Service<Repository, IOpportunityRepository>()(
  "@crm-chat/server/persistence/Opportunity/Repository",
) {}

const failed = Effect.mapError(
  (e: { readonly message: string }) => new OpportunityRepositoryError({ message: e.message }),
);

const decodeOpportunity = Schema.decodeUnknownEffect(Schema.toCodecJson(Opportunity.Opportunity));

type OpportunityRow = typeof Tables.crmOpportunities.$inferSelect;

const toRow = (
  opportunity: Opportunity.Opportunity,
): typeof Tables.crmOpportunities.$inferInsert => ({
  id: opportunity.id,
  contactId: opportunity.contactId,
  title: opportunity.title,
  stage: opportunity.stage,
  createdAt: isoOf(opportunity.createdAt),
  updatedAt: isoOf(opportunity.updatedAt),
  deletedAt: optionalIsoOf(opportunity.deletedAt),
});

const fromRow = (row: OpportunityRow) =>
  decodeOpportunity({
    id: row.id,
    contactId: row.contactId,
    title: row.title,
    stage: row.stage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...deletion(row.deletedAt),
  });

const alive = isNull(Tables.crmOpportunities.deletedAt);

export const makeSql = Effect.gen(function* () {
  const db = yield* Database.Database;

  const save: IOpportunityRepository["save"] = Effect.fn("save")(function* (opportunity) {
    const row = toRow(opportunity);
    const { id: _, createdAt: __, ...patch } = row;
    yield* db
      .insert(Tables.crmOpportunities)
      .values(row)
      .onConflictDoUpdate({ target: Tables.crmOpportunities.id, set: patch });
    return opportunity;
  }, failed);

  const findById: IOpportunityRepository["findById"] = Effect.fn("findById")(function* (id) {
    const rows = yield* db
      .select()
      .from(Tables.crmOpportunities)
      .where(and(eq(Tables.crmOpportunities.id, id), alive));
    const row = rows[0];
    return row === undefined ? Option.none() : Option.some(yield* fromRow(row));
  }, failed);

  const forContact: IOpportunityRepository["forContact"] = Effect.fn("forContact")(function* (
    contactId,
  ) {
    const rows = yield* db
      .select()
      .from(Tables.crmOpportunities)
      .where(and(eq(Tables.crmOpportunities.contactId, contactId), alive))
      .orderBy(desc(Tables.crmOpportunities.updatedAt));
    return yield* Effect.forEach(rows, fromRow);
  }, failed);

  const all: IOpportunityRepository["all"] = Effect.fn("all")(function* () {
    const rows = yield* db
      .select()
      .from(Tables.crmOpportunities)
      .where(alive)
      .orderBy(desc(Tables.crmOpportunities.updatedAt));
    return yield* Effect.forEach(rows, fromRow);
  }, failed);

  return Repository.of({ save, findById, forContact, all });
});

export const layerSql = Layer.effect(Repository)(makeSql);
