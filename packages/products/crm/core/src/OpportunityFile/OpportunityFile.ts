import { CrmOpportunityFileId, CrmOpportunityId, UserId } from "@kikos/effect-identity";
import { File as PrimitiveFile, Timestampable } from "@kikos/primitives";
import { Effect, Schema } from "effect";

/**
 * A file attached to an opportunity's history.
 *
 * Kept apart from `Note.OnOpportunity`: a note answers to either an
 * opportunity or a quotation and always carries a body, while a file answers
 * only to an opportunity and carries none. Sharing `crm_notes` would mean
 * loosening its `one_owner` check and making `body` optional for a case that
 * has nothing to do with quotations.
 *
 * `mediaType` is the shared primitive rather than a list of its own — the set
 * of accepted formats is one decision, made once, and Tickets already reads it
 * from there. `mediaType` and `sizeBytes` are both read off the content that
 * arrived, never taken from the caller: a client that could declare them could
 * declare them wrong.
 */
export class OpportunityFile extends Schema.Class<OpportunityFile, { readonly _: unique symbol }>(
  "CrmOpportunityFile",
)({
  id: CrmOpportunityFileId.Id,
  opportunityId: CrmOpportunityId.Id,

  filename: Schema.NonEmptyString,
  mediaType: PrimitiveFile.MediaType,
  sizeBytes: Schema.Int,
  authorId: UserId.Id,

  ...Timestampable,
}) {}

type OpportunityFileInput = {
  readonly opportunityId: CrmOpportunityId.Id;
  readonly filename: string;
  readonly content: PrimitiveFile.File;
  readonly authorId: UserId.Id;
};

export const make = (input: OpportunityFileInput) =>
  Effect.gen(function* () {
    const id = yield* CrmOpportunityFileId.makeId;
    return yield* Effect.mapError(
      OpportunityFile.makeEffect({
        id,
        opportunityId: input.opportunityId,
        filename: input.filename,
        mediaType: input.content.mediaType,
        sizeBytes: input.content.data.byteLength,
        authorId: input.authorId,
      }),
      (issue) => new Schema.SchemaError(issue),
    );
  });

export const Id = CrmOpportunityFileId.Id;
export type Id = CrmOpportunityFileId.Id;