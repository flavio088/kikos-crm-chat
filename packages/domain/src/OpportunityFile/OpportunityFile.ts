import { Effect, Schema } from "effect";
import { CrmOpportunityFileId, CrmOpportunityId, UserId } from "../ids";
import { File as PrimitiveFile, Timestampable } from "../primitives";

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
