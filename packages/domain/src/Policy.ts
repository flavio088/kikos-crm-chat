import { Schema } from "effect";
import type { Ability } from "./Ability";
import { Contact } from "./Contact";
import { CrmOpportunityId } from "./ids";
import type { Opportunity } from "./Opportunity";

export type ContactAction = "read" | "converse";

export class ReachableContact extends Schema.Class<ReachableContact, { readonly _: unique symbol }>(
  "CrmReachableContact",
)({
  contact: Contact,
  opportunities: Schema.Array(CrmOpportunityId.Id),
}) {}

export const reachableContact = (input: {
  readonly contact: Contact;
  readonly opportunities: ReadonlyArray<Opportunity>;
}): ReachableContact =>
  new ReachableContact({
    contact: input.contact,
    opportunities: input.opportunities.map((opportunity) => opportunity.id),
  });

export type CrmAbility = Ability<ContactAction, ReachableContact>;

export const allowAll: CrmAbility = { can: () => true };
