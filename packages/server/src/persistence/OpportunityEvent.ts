import { CrmOpportunityId, OpportunityEvent } from "@crm-chat/domain";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Context, Effect, Layer, Schema } from "effect";
import { Database, Tables } from "../db";
import { deletion, isoOf, optionalIsoOf, present } from "./Row";

export class OpportunityEventRepositoryError extends Schema.TaggedError<OpportunityEventRepositoryError>()(
  "Persistance.Crm.OpportunityEvent.RepositoryError",
  { message: Schema.String },
) {}

export interface IOpportunityEventRepository {
  readonly save: (
    event: OpportunityEvent.OpportunityEvent,
  ) => Effect.Effect<OpportunityEvent.OpportunityEvent, OpportunityEventRepositoryError>;
  readonly forOpportunity: (
    opportunityId: CrmOpportunityId.Id,
  ) => Effect.Effect<OpportunityEvent.OpportunityEvent[], OpportunityEventRepositoryError>;
}

export class Repository extends Context.Service<Repository, IOpportunityEventRepository>()(
  "@crm-chat/server/persistence/OpportunityEvent/Repository",
) {}

const failed = Effect.mapError(
  (e: { readonly message: string }) => new OpportunityEventRepositoryError({ message: e.message }),
);

const decodeEvent = Schema.decodeUnknownEffect(
  Schema.toCodecJson(OpportunityEvent.OpportunityEvent),
);

type EventRow = typeof Tables.crmOpportunityEvents.$inferSelect;

const toRow = (
  event: OpportunityEvent.OpportunityEvent,
): typeof Tables.crmOpportunityEvents.$inferInsert => ({
  id: event.id,
  opportunityId: event.opportunityId,
  kind: event.kind,
  fromStage: event.from ?? null,
  toStage: event.to ?? null,
  authorId: event.authorId ?? null,
  createdAt: isoOf(event.createdAt),
  updatedAt: isoOf(event.updatedAt),
  deletedAt: optionalIsoOf(event.deletedAt),
});

const fromRow = (row: EventRow) =>
  decodeEvent({
    id: row.id,
    opportunityId: row.opportunityId,
    kind: row.kind,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...present({ from: row.fromStage, to: row.toStage, authorId: row.authorId }),
    ...deletion(row.deletedAt),
  });

const alive = isNull(Tables.crmOpportunityEvents.deletedAt);

export const makeSql = Effect.gen(function* () {
  const db = yield* Database.Database;

  const save: IOpportunityEventRepository["save"] = Effect.fn("save")(function* (event) {
    const row = toRow(event);
    const { id: _, createdAt: __, ...patch } = row;
    yield* db
      .insert(Tables.crmOpportunityEvents)
      .values(row)
      .onConflictDoUpdate({ target: Tables.crmOpportunityEvents.id, set: patch });
    return event;
  }, failed);

  const forOpportunity: IOpportunityEventRepository["forOpportunity"] = Effect.fn(
    "forOpportunity",
  )(function* (opportunityId) {
    const rows = yield* db
      .select()
      .from(Tables.crmOpportunityEvents)
      .where(and(eq(Tables.crmOpportunityEvents.opportunityId, opportunityId), alive))
      .orderBy(asc(Tables.crmOpportunityEvents.createdAt));
    return yield* Effect.forEach(rows, fromRow);
  }, failed);

  return Repository.of({ save, forOpportunity });
});

export const layerSql = Layer.effect(Repository)(makeSql);
