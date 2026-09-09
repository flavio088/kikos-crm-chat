import { Effect, Schema } from "effect";
import { CrmOpportunityId, CrmOpportunityNoteId, UserId } from "../ids";
import { Timestampable } from "../primitives";

export class OpportunityNote extends Schema.Class<OpportunityNote, { readonly _: unique symbol }>(
  "CrmOpportunityNote",
)({
  id: CrmOpportunityNoteId.Id,
  opportunityId: CrmOpportunityId.Id,
  body: Schema.NonEmptyString,
  authorId: UserId.Id,
  ...Timestampable,
}) {}

type OpportunityNoteInput = {
  readonly opportunityId: CrmOpportunityId.Id;
  readonly body: string;
  readonly authorId: UserId.Id;
};

export const make = (input: OpportunityNoteInput) =>
  Effect.gen(function* () {
    const id = yield* CrmOpportunityNoteId.makeId;
    return yield* Effect.mapError(
      OpportunityNote.makeEffect({ ...input, id }),
      (issue) => new Schema.SchemaError(issue),
    );
  });

export const Id = CrmOpportunityNoteId.Id;
export type Id = CrmOpportunityNoteId.Id;
