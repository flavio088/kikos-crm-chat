import { Effect, Schema } from "effect";
import { CrmContactId, CrmOpportunityId } from "../ids";
import { Timestampable } from "../primitives";

export const STAGES = ["novo", "em_contato", "proposta", "ganho", "perdido"] as const;

export const Stage = Schema.Literals(STAGES);
export type Stage = Schema.Schema.Type<typeof Stage>;

export const stageLabels: Record<Stage, string> = {
  novo: "Novo",
  em_contato: "Em contato",
  proposta: "Proposta",
  ganho: "Ganho",
  perdido: "Perdido",
};

export class Opportunity extends Schema.Class<Opportunity, { readonly _: unique symbol }>(
  "CrmOpportunity",
)({
  id: CrmOpportunityId.Id,
  contactId: CrmContactId.Id,
  title: Schema.NonEmptyString,
  stage: Stage,
  ...Timestampable,
}) {}

type OpportunityInput = Pick<Opportunity, "contactId" | "title"> & {
  readonly stage?: Stage;
};

export const make = (input: OpportunityInput) =>
  Effect.gen(function* () {
    const id = yield* CrmOpportunityId.makeId;
    return yield* Effect.mapError(
      Opportunity.makeEffect({ ...input, id, stage: input.stage ?? "novo" }),
      (issue) => new Schema.SchemaError(issue),
    );
  });

export const Id = CrmOpportunityId.Id;
export type Id = CrmOpportunityId.Id;
