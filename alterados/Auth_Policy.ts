import { Ability } from "@kikos/ability";
import { Principal, Role } from "@kikos/core";
import { CrmDestinationId, UserId } from "@kikos/effect-identity";
import { Context, Schema } from "effect";
import { Contact } from "../../Contact/Contact";
import { Destination } from "../../Destination/Destination";
import { DestinationRevenue } from "../../Destination/Revenue";
import { Opportunity } from "../../Opportunity/Opportunity";
import * as Placement from "../../Opportunity/Placement";
import type { CrmScope } from "../Scope";

export type DestinationAction =
  | "read"
  | "update"
  | "reorder_rotation"
  | "manage_members"
  | "manage_rules"
  | "pause";

export type OpportunityAction = "read" | "update" | "delete" | "note" | "place";

export type ContactAction = "read" | "update" | "converse";

export type QuotationAction = "read" | "create" | "update" | "close" | "note" | "delete";

export class PlacedOpportunity extends Schema.Class<PlacedOpportunity, { readonly _: unique symbol }>(
  "CrmPlacedOpportunity",
)({
  opportunity: Opportunity,
  placement: Placement.Any.pipe(Schema.optional, Schema.optionalKey),
}) {
  get destinationId(): CrmDestinationId.Id | undefined {
    return this.placement?.destinationId;
  }

  /**
   * The store that still holds this, which a reclaim answers `undefined` to.
   *
   * `destinationId` above is the factual one — the store named on the newest
   * placement, whatever kind it is — and it is what a listing filtered by
   * store reads. Reach is a different question. A reclaim exists precisely to
   * say "this store no longer has it", so answering the store there would have
   * left the losing store reading and editing a lead the engine had already
   * taken off them: `redistribute` with nowhere else to go would report "sem
   * destino" on one screen while the store went on working it on another.
   */
  get heldAt(): CrmDestinationId.Id | undefined {
    return this.placement !== undefined && Placement.isAssigned(this.placement)
      ? this.placement.destinationId
      : undefined;
  }

  get assignedTo(): UserId.Id | undefined {
    return this.placement !== undefined && Placement.isAssigned(this.placement)
      ? this.placement.userId
      : undefined;
  }
}

export const placedOpportunity = (
  opportunity: Opportunity,
  placement: Placement.Any | undefined,
): PlacedOpportunity => new PlacedOpportunity(placement === undefined ? { opportunity } : { opportunity, placement });

/**
 * A contact seen through the opportunities it owns, which is the only way the
 * crm ever sees one: a contact has no store of its own, so it is reachable
 * exactly as far as its work is.
 *
 * Both arrays are folded from the latest placement of each opportunity — the
 * same reading `PlacedOpportunity` does one row at a time — and both are
 * scoped to nothing: they carry every opportunity the contact has, so the
 * ability can answer over the whole person rather than over the slice the
 * caller happens to see. A contact whose opportunities were never placed
 * arrives with both empty, and is therefore admin-only, which is the same
 * answer every rd-station opportunity gets today.
 */
export class ReachableContact extends Schema.Class<ReachableContact, { readonly _: unique symbol }>(
  "CrmReachableContact",
)({
  contact: Contact,
  /** The stores holding this contact's opportunities right now. */
  destinations: Schema.Array(CrmDestinationId.Id),
  /** The sellers who hold one of them. */
  assignedTo: Schema.Array(UserId.Id),
}) {}

export const reachableContact = (input: {
  readonly contact: Contact;
  readonly destinations: ReadonlyArray<CrmDestinationId.Id>;
  readonly assignedTo: ReadonlyArray<UserId.Id>;
}): ReachableContact =>
  new ReachableContact({
    contact: input.contact,
    destinations: [...input.destinations],
    assignedTo: [...input.assignedTo],
  });

export class QuotationOwnership extends Schema.Class<QuotationOwnership, { readonly _: unique symbol }>(
  "CrmQuotationOwnership",
)({
  destinationId: CrmDestinationId.Id,
  sellerId: UserId.Id,
}) {}

export const quotationOwnership = (quotation: {
  readonly destinationId: CrmDestinationId.Id;
  readonly sellerId: UserId.Id;
}): QuotationOwnership =>
  new QuotationOwnership({ destinationId: quotation.destinationId, sellerId: quotation.sellerId });

export type CrmPair =
  | readonly [DestinationAction, typeof Destination]
  | readonly ["read", typeof DestinationRevenue]
  | readonly [OpportunityAction, typeof PlacedOpportunity]
  | readonly [ContactAction, typeof ReachableContact]
  | readonly [QuotationAction, typeof QuotationOwnership];

export type CrmAbility = Ability.Ability<CrmPair>;

export const oversees = (role: Role.Role): boolean => Role.isAdmin(role) || Role.isOperator(role);

export const defineCrmAbilityFor = (
  principal: Principal.Principal,
  scope: CrmScope,
): CrmAbility =>
  Ability.define<CrmPair>(({ can, cannot }) => {
    if (oversees(principal.role)) {
      can("manage", "all");
      return;
    }

    can("read", Destination, (destination) => scope.works(destination.id));

    can("update", Destination, (destination) => scope.manages(destination.id));
      can("converse", ReachableContact, (reachable) => reachable.destinations.some((destinationId) => scope.works(destinationId)),);
    can("reorder_rotation", Destination, (destination) => scope.manages(destination.id));
    can("manage_members", Destination, (destination) => scope.manages(destination.id));
    can("pause", Destination, (destination) => scope.manages(destination.id));

    /**
     * Nobody below an admin edits the routing rules, and this says so out loud
     * rather than leaving it to the absence of a `can`.
     *
     * Reordering the rodizio is already a covert way to hand the next lead to
     * a chosen seller, which is why the screen names who is up next out loud.
     * The routing rules are the same lever pointed one level higher: a gestor
     * who could add `ddd:11` to their own store would be dealing themselves
     * every lead from Sao Paulo, and no screen in that store would show it.
     * That decision sits above any single store, so it stays with the admin.
     */
    cannot("manage_rules", Destination, () => true);

    can("read", DestinationRevenue, (revenue) => scope.manages(revenue.destinationId));

    cannot("read", DestinationRevenue, (revenue) => !scope.manages(revenue.destinationId));

    /**
     * Two readings of the same row, and the split is the point.
     *
     * `sees` is the factual one — the store named on the newest placement —
     * and it is what the listing is filtered by, so a store keeps seeing a
     * lead that was taken back from it, marked "Retomada". That is its own
     * history, and `sellerTally` counts those reclaims for exactly that reason:
     * the seller rows plus the reclaims are what add up to the store's total on
     * the screen.
     *
     * `holds` is the narrower one, and it is what every write asks for. A
     * reclaim says nobody has the lead any more, so the store it was taken
     * *from* must not go on noting, editing or deleting it — `redistribute`
     * with nowhere else to put a lead used to report "sem destino" while the
     * losing store carried on working it. Seeing it is history; touching it
     * would be still holding it.
     */
    const sees = (placed: PlacedOpportunity) =>
      placed.destinationId !== undefined && scope.works(placed.destinationId);
    const holds = (placed: PlacedOpportunity) =>
      placed.heldAt !== undefined && scope.works(placed.heldAt);
    const governs = (placed: PlacedOpportunity) =>
      placed.heldAt !== undefined && scope.manages(placed.heldAt);

    can("read", PlacedOpportunity, sees);
    can("note", PlacedOpportunity, holds);
    can("update", PlacedOpportunity, (placed) =>
      governs(placed) || (holds(placed) && placed.assignedTo === scope.userId),
    );
    can("delete", PlacedOpportunity, governs);

    /**
     * Placing by hand is admin-only for the reason above, read from the other
     * side: moving an opportunity between stores — and choosing the store for
     * one nothing could route — is a decision no single store makes. A gestor
     * holding this could take every `unrouted` lead for their own store, and a
     * seller holding it could push their own work onto somebody else.
     */
    cannot("place", PlacedOpportunity, () => true);

    /**
     * Reading a contact is reading at least one of its opportunities: the
     * person is visible exactly as far as their work is, and never wider.
     *
     * Writing is narrower on purpose. The data on a contact is shared by every
     * opportunity hanging from it, so a seller who merely *reaches* the person
     * — because some other store is working them — would be rewriting the
     * phone number the other store is dialling. Editing therefore asks for the
     * same standing `update` asks for on a single opportunity: govern a store
     * that holds one, or personally hold one.
     */
    can("read", ReachableContact, (reachable) =>
      reachable.destinations.some((destinationId) => scope.works(destinationId)),
    );
    can(
      "update",
      ReachableContact,
      (reachable) =>
        reachable.destinations.some((destinationId) => scope.manages(destinationId)) ||
        reachable.assignedTo.includes(scope.userId),
    );

    const staffs = (quotation: QuotationOwnership) => scope.works(quotation.destinationId);
    const owns = (quotation: QuotationOwnership) =>
      staffs(quotation) && quotation.sellerId === scope.userId;
    const administers = (quotation: QuotationOwnership) => scope.manages(quotation.destinationId);

    can("read", QuotationOwnership, staffs);
    can("note", QuotationOwnership, staffs);
    can("create", QuotationOwnership, (quotation) => administers(quotation) || owns(quotation));
    can("update", QuotationOwnership, (quotation) => administers(quotation) || owns(quotation));
    can("close", QuotationOwnership, (quotation) => administers(quotation) || owns(quotation));
  });

export class CurrentCrmAbility extends Context.Service<CurrentCrmAbility, CrmAbility>()(
  "@kikos/crm-core/CurrentCrmAbility",
) {}
