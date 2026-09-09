import { Effect, Schema } from "effect";
import { CrmOpportunityEventId, CrmOpportunityId, UserId } from "../ids";
import { Stage } from "../Opportunity";
import { Timestampable } from "../primitives";

export const KINDS = ["created", "staged"] as const;

export const Kind = Schema.Literals(KINDS);
export type Kind = Schema.Schema.Type<typeof Kind>;

export class OpportunityEvent extends Schema.Class<OpportunityEvent, { readonly _: unique symbol }>(
  "CrmOpportunityEvent",
)({
  id: CrmOpportunityEventId.Id,
  opportunityId: CrmOpportunityId.Id,
  kind: Kind,
  from: Stage.pipe(Schema.optional, Schema.optionalKey),
  to: Stage.pipe(Schema.optional, Schema.optionalKey),
  authorId: UserId.Id.pipe(Schema.optional, Schema.optionalKey),
  ...Timestampable,
}) {}

type OpportunityEventInput = {
  readonly opportunityId: CrmOpportunityId.Id;
  readonly kind: Kind;
  readonly from?: Stage;
  readonly to?: Stage;
  readonly authorId?: UserId.Id;
};

export const make = (input: OpportunityEventInput) =>
  Effect.gen(function* () {
    const id = yield* CrmOpportunityEventId.makeId;
    return yield* Effect.mapError(
      OpportunityEvent.makeEffect({
        id,
        opportunityId: input.opportunityId,
        kind: input.kind,
        ...(input.from === undefined ? {} : { from: input.from }),
        ...(input.to === undefined ? {} : { to: input.to }),
        ...(input.authorId === undefined ? {} : { authorId: input.authorId }),
      }),
      (issue) => new Schema.SchemaError(issue),
    );
  });

export const Id = CrmOpportunityEventId.Id;
export type Id = CrmOpportunityEventId.Id;
