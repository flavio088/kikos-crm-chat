import { CrmOpportunityId, OpportunityNote } from "@crm-chat/domain";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Context, Effect, Layer, Schema } from "effect";
import { Database, Tables } from "../db";
import { deletion, isoOf, optionalIsoOf } from "./Row";

export class OpportunityNoteRepositoryError extends Schema.TaggedError<OpportunityNoteRepositoryError>()(
  "Persistance.Crm.OpportunityNote.RepositoryError",
  { message: Schema.String },
) {}

export interface IOpportunityNoteRepository {
  readonly save: (
    note: OpportunityNote.OpportunityNote,
  ) => Effect.Effect<OpportunityNote.OpportunityNote, OpportunityNoteRepositoryError>;
  readonly forOpportunity: (
    opportunityId: CrmOpportunityId.Id,
  ) => Effect.Effect<OpportunityNote.OpportunityNote[], OpportunityNoteRepositoryError>;
}

export class Repository extends Context.Service<Repository, IOpportunityNoteRepository>()(
  "@crm-chat/server/persistence/OpportunityNote/Repository",
) {}

const failed = Effect.mapError(
  (e: { readonly message: string }) => new OpportunityNoteRepositoryError({ message: e.message }),
);

const decodeNote = Schema.decodeUnknownEffect(Schema.toCodecJson(OpportunityNote.OpportunityNote));

type NoteRow = typeof Tables.crmOpportunityNotes.$inferSelect;

const toRow = (
  note: OpportunityNote.OpportunityNote,
): typeof Tables.crmOpportunityNotes.$inferInsert => ({
  id: note.id,
  opportunityId: note.opportunityId,
  body: note.body,
  authorId: note.authorId,
  createdAt: isoOf(note.createdAt),
  updatedAt: isoOf(note.updatedAt),
  deletedAt: optionalIsoOf(note.deletedAt),
});

const fromRow = (row: NoteRow) =>
  decodeNote({
    id: row.id,
    opportunityId: row.opportunityId,
    body: row.body,
    authorId: row.authorId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...deletion(row.deletedAt),
  });

const alive = isNull(Tables.crmOpportunityNotes.deletedAt);

export const makeSql = Effect.gen(function* () {
  const db = yield* Database.Database;

  const save: IOpportunityNoteRepository["save"] = Effect.fn("save")(function* (note) {
    const row = toRow(note);
    const { id: _, createdAt: __, ...patch } = row;
    yield* db
      .insert(Tables.crmOpportunityNotes)
      .values(row)
      .onConflictDoUpdate({ target: Tables.crmOpportunityNotes.id, set: patch });
    return note;
  }, failed);

  const forOpportunity: IOpportunityNoteRepository["forOpportunity"] = Effect.fn(
    "forOpportunity",
  )(function* (opportunityId) {
    const rows = yield* db
      .select()
      .from(Tables.crmOpportunityNotes)
      .where(and(eq(Tables.crmOpportunityNotes.opportunityId, opportunityId), alive))
      .orderBy(asc(Tables.crmOpportunityNotes.createdAt));
    return yield* Effect.forEach(rows, fromRow);
  }, failed);

  return Repository.of({ save, forOpportunity });
});

export const layerSql = Layer.effect(Repository)(makeSql);
