import { Quotation, Destination, Distribution, Event, Opportunity, Membership, Pool } from "@kikos/crm-core";
import { Uf } from "@kikos/primitives";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { boolean, bytea, check, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";
import type { Schema } from "effect";
import { literalsOf } from "./enums";
import { instant, money, timestamps, ulid } from "./shared";
import { users } from "./User";

export const crmDestinationStanding = pgEnum(
  "crm_destination_standing",
  literalsOf(Destination.Standing.Standing),
);

export const crmDestinationErpState = pgEnum(
  "crm_destination_erp_state",
  literalsOf(Destination.ErpState.ErpState),
);

export const crmMembershipRole = pgEnum("crm_membership_role", literalsOf(Membership.Role.Role));

export const crmOpportunitySegment = pgEnum("crm_opportunity_segment", Opportunity.Segment.Segment.literals);

export const crmOpportunitySource = pgEnum("crm_opportunity_source", Opportunity.Source.Source.literals);

export const crmOpportunityStage = pgEnum("crm_opportunity_stage", Opportunity.Stage.Target.literals);

export const crmOpportunityPlacementKind = pgEnum(
  "crm_opportunity_placement_kind",
  Opportunity.Placement.Any.discriminants,
);

export const crmQuotationStatus = pgEnum("crm_quotation_status", literalsOf(Quotation.Status.Status));

export const crmEventKind = pgEnum("crm_event_kind", Event.Kind.literals);

export const crmDestinationLocatorKind = pgEnum(
  "crm_destination_locator_kind",
  Destination.Locator.Kind.literals,
);

export const crmDistributionOutcome = pgEnum(
  "crm_distribution_outcome",
  Distribution.Outcome.Outcome.literals,
);

export const crmRegion = pgEnum("crm_region", Uf.Region.literals);

export const crmLandingPagePolicy = pgEnum(
  "crm_landing_page_policy",
  Pool.LandingPagePolicy.literals,
);

export const crmPools = pgTable(
  "crm_pools",
  {
    id: ulid("crm_pool")().primaryKey(),
    slug: text().notNull(),
    name: text().notNull(),
    active: boolean().notNull().default(true),
    // Everything that decides how this half of the company competes with the
    // other. All of it is configuration a person turns on a screen — there is
    // no engine state in this table any more. The weighted draw that kept a
    // running `credit` here is gone: load per seller decides between the halves
    // now, which is what stops a store in Pará from splitting its leads with a
    // matrix desk that is already buried.
    /** Capacity multiplier: it divides the load, so 2 means "carries twice". */
    weight: integer().notNull().default(1),
    /** Kilometres worth one open opportunity per seller — the slider. */
    proximityKm: integer("proximity_km").notNull().default(500),
    /** Open opportunities per seller before the search widens past a destination. */
    loadCeiling: integer("load_ceiling").notNull().default(10),
    // The least specific tier the search may widen to when every destination in
    // the tier is over the ceiling. Null never widens. The engine only ever
    // widens downward, so a floor at or above the opening tier is a no-op.
    overflowTo: crmDestinationLocatorKind("overflow_to").default("uf"),
    landingPagePolicy: crmLandingPagePolicy("landing_page_policy")
      .notNull()
      .default("until_saturated"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("crm_pools_slug_key").on(table.slug),
    // The three numbers the score is built from, guarded here and not only in
    // the domain: a zero weight divides the load into infinity and a negative
    // ceiling saturates a network that is empty, and both would read as a
    // routing bug long before anybody thought to look at a row.
    check("crm_pools_weight_positive", sql`${table.weight} > 0`),
    check("crm_pools_proximity_positive", sql`${table.proximityKm} > 0`),
    check("crm_pools_ceiling_not_negative", sql`${table.loadCeiling} >= 0`),
  ],
);

export const crmDestinations = pgTable(
  "crm_destinations",
  {
    id: ulid("crm_destination")().primaryKey(),
    poolId: ulid("crm_pool")("pool_id")
      .notNull()
      .references(() => crmPools.id),
    name: text().notNull(),
    slug: text().notNull(),
    position: integer().notNull(),
    standing: crmDestinationStanding().notNull().default("receiving"),
    // Where this destination answers from, for the distance the router weighs.
    // Kept apart from `erp_branch_uf`, which is the erp's copy about a branch:
    // the matrix channels are branches nowhere and still have to sit somewhere
    // on the map, and a person may correct a store's without the next reconcile
    // arguing about it.
    uf: text(),
    /** The SAP branch (OBPL) this destination answers for. */
    erpBranchId: integer("erp_branch_id"),
    erpState: crmDestinationErpState("erp_state").notNull().default("unlinked"),
    erpSeenAt: instant("erp_seen_at"),
    // The copy of what SAP says about that branch — cnpj, default warehouse,
    // city and federal unit. Nullable to the last one: a destination may have
    // no anchor, and an anchored one may sit on a branch OBPL holds no cnpj
    // for. No check ties them to `erp_branch_id`, on purpose — the erp is free
    // to answer for a branch with half of them empty.
    erpBranchTaxId: text("erp_branch_tax_id"),
    erpBranchWarehouse: text("erp_branch_warehouse"),
    erpBranchCity: text("erp_branch_city"),
    erpBranchUf: text("erp_branch_uf"),
    pausedAt: instant("paused_at"),
    pausedBy: ulid("user")("paused_by").references(() => users.id),
    pausedReason: text("paused_reason"),
    // Whom this destination served last, and where they stood. The anchor of
    // the seller rotation lives on the destination row because choosing is a
    // single UPDATE of it, which is what serializes two leads arriving at once.
    // The id is the honest anchor and survives the manager reordering the
    // roster; the position is the fallback for when that person has left.
    lastSellerId: ulid("user")("last_seller_id").references(() => users.id),
    lastSellerPosition: integer("last_seller_position"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("crm_destinations_slug_key").on(table.slug),
    index("crm_destinations_pool_idx").on(table.poolId, table.position),
    check(
      "crm_destinations_paused_consistency",
      sql`(${table.standing} = 'paused') = (${table.pausedAt} is not null)`,
    ),
    // A soft-deleted destination must not keep holding a branch hostage: the
    // reconciliation looks the anchor up before deciding anything, and a dead
    // row owning it would make a live branch unmappable.
    uniqueIndex("crm_destinations_erp_branch_key")
      .on(table.erpBranchId)
      .where(sql`${table.deletedAt} is null`),
    check(
      "crm_destinations_erp_link_consistency",
      sql`(${table.erpState} = 'unlinked') = (${table.erpBranchId} is null)`,
    ),
    // Canonical or absent, the same shape the locator column already enforces.
    // The distance table is an exact lookup, so `sp` is not a near miss — it is
    // a destination that quietly stops having a place on the map.
    check("crm_destinations_uf_format", sql`${table.uf} is null or ${table.uf} ~ '^[A-Z]{2}$'`),
  ],
);

export const crmDestinationMemberships = pgTable(
  "crm_destination_memberships",
  {
    id: ulid("crm_destination_membership")().primaryKey(),
    destinationId: ulid("crm_destination")("destination_id")
      .notNull()
      .references(() => crmDestinations.id),
    userId: ulid("user")("user_id")
      .notNull()
      .references(() => users.id),
    role: crmMembershipRole().notNull(),
    position: integer().notNull(),
    receiving: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    // Leaving a destination is a soft delete, and readmission is routine in
    // stores that rotate sellers: without the partial clause the dead row keeps
    // the pair taken and the new membership dies on a unique violation.
    uniqueIndex("crm_destination_memberships_key")
      .on(table.destinationId, table.userId)
      .where(sql`${table.deletedAt} is null`),
    index("crm_destination_memberships_user_idx").on(table.userId),
    index("crm_destination_memberships_roster_idx").on(table.destinationId, table.position),
    uniqueIndex("crm_destination_memberships_one_destination_per_seller")
      .on(table.userId)
      .where(sql`${table.role} = 'seller' and ${table.deletedAt} is null`),
  ],
);

/**
 * Which segments a destination is willing to take — the "DDD e segmentos" tab
 * of the spreadsheet, as data. A composite key and no id of its own: the row is
 * the membership, there is nothing else to say about it, and the whole set is
 * rewritten when somebody edits it.
 */
export const crmDestinationSegments = pgTable(
  "crm_destination_segments",
  {
    destinationId: ulid("crm_destination")("destination_id")
      .notNull()
      .references(() => crmDestinations.id),
    segment: crmOpportunitySegment().notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.destinationId, table.segment] }),
    // Step 1 of the engine asks "which destinations take `residencial`?", and
    // the primary key cannot be read in that direction.
    index("crm_destination_segments_segment_idx").on(table.segment, table.destinationId),
  ],
);

/**
 * How an opportunity finds a destination geographically — the rule of the
 * "Lojas" tab as data: *"pegar da UF ou da landing page que finaliza com o nome
 * da loja ou DDD indicado"*. A flattened union: `kind` discriminates and the
 * column beside it belongs to that variant.
 *
 * The specificity (landing page > ddd > uf > any) is NOT a column: it is a
 * property of the `kind`, and storing it would let a row disagree with itself.
 *
 * The CHECK is a deliberate departure from what the rest of this schema does.
 * These rows are seeded and then edited by hand on the rules screen, and a
 * half-filled variant raises nothing — it silently stops routing, which is the
 * one failure nobody would notice.
 */
export const crmDestinationLocators = pgTable(
  "crm_destination_locators",
  {
    id: ulid("crm_destination_locator")().primaryKey(),
    destinationId: ulid("crm_destination")("destination_id")
      .notNull()
      .references(() => crmDestinations.id),
    kind: crmDestinationLocatorKind().notNull(),
    /** The normalized landing page suffix, matched on a `-` boundary. */
    landingPageSlug: text("landing_page_slug"),
    /** `"11"` — text and not an integer: a leading zero is not ours to lose. */
    ddd: text(),
    uf: text(),
    // A closed set of five, so an enum rather than the free text the other two
    // are: nobody types a region, they pick one.
    regiao: crmRegion(),
    // Switched off and still on the screen. A campaign burying one store has to
    // be stoppable without losing what the rule said, and a screen that can only
    // offer "remove" makes turning it back on an act of retyping.
    pausedAt: instant("paused_at"),
    ...timestamps,
  },
  (table) => [
    index("crm_destination_locators_destination_idx").on(table.destinationId),
    index("crm_destination_locators_ddd_idx").on(table.ddd),
    index("crm_destination_locators_uf_idx").on(table.uf),
    index("crm_destination_locators_regiao_idx").on(table.regiao),
    // One landing page names ONE destination. Two rows carrying the same suffix
    // would turn the most specific tier into a rotation, which is exactly what
    // it exists to deny. Partial so that retiring a rule gives the suffix back:
    // `crm_destinations_slug_key` is not partial and that is a known wart.
    uniqueIndex("crm_destination_locators_lp_key")
      .on(table.landingPageSlug)
      .where(sql`${table.deletedAt} is null`),
    // Counting the filled columns is not enough: `kind = 'ddd'` with the `uf`
    // filled counts one and passes, and then matches nothing forever. Each
    // variant is tied to its own column.
    check(
      "crm_destination_locators_variant",
      sql`(${table.kind} = 'landing_page_slug') = (${table.landingPageSlug} is not null)
        and (${table.kind} = 'ddd') = (${table.ddd} is not null)
        and (${table.kind} = 'uf') = (${table.uf} is not null)
        and (${table.kind} = 'regiao') = (${table.regiao} is not null)`,
    ),
    // The matcher compares these exactly, so a rule typed as `sp` or as
    // `Loja Campinas` is a rule that never fires. `Slug.slugOf` and
    // `Locator.make` normalize on the way in; this is what keeps a hand-written
    // INSERT from getting round them.
    check(
      "crm_destination_locators_format",
      sql`(${table.landingPageSlug} is null or ${table.landingPageSlug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
        and (${table.ddd} is null or ${table.ddd} ~ '^[1-9][1-9]$')
        and (${table.uf} is null or ${table.uf} ~ '^[A-Z]{2}$')`,
    ),
  ],
);

/**
 * The mutable memory of the engine: who a pool served last, for one locator.
 *
 * Scoped by the locator that matched (`ddd:11`, `uf:BA`, `lp:jd-europa`) and
 * not by the pool alone, because the candidate set varies per lead: one from
 * Bahia can only reach Salvador, and were it to move a single finger for the
 * whole pool it would leave the São Paulo rotation parked one seat past
 * Salvador forever — one store in SP taking every SP lead. Real starvation.
 *
 * The segment is in the key for the same reason, one dimension on: the
 * candidate set is filtered by segment before it is rotated, so two segments
 * sharing a cursor make one starve the other. With `A@1024` taking only
 * `empresas` and `B@2048`, `C@3072` taking only `residencial`, alternating
 * leads read `A B A B A B…` — every `empresas` lead rewinds the finger to
 * behind B — and C is never served at all.
 *
 * `''` is the value of the `any` locator, so the key stays total.
 */
export const crmRotationCursors = pgTable(
  "crm_rotation_cursors",
  {
    poolId: ulid("crm_pool")("pool_id")
      .notNull()
      .references(() => crmPools.id),
    segment: crmOpportunitySegment().notNull(),
    locatorKind: crmDestinationLocatorKind("locator_kind").notNull(),
    locatorValue: text("locator_value").notNull(),
    lastDestinationId: ulid("crm_destination")("last_destination_id").references(
      () => crmDestinations.id,
    ),
    lastDestinationPosition: integer("last_destination_position"),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.poolId, table.segment, table.locatorKind, table.locatorValue],
    }),
  ],
);

/**
 * The person, kept apart from the buying intent.
 *
 * `email_key` and `phone_key` are the normalized forms of the two columns
 * beside them, and they are what identity is decided on — never the raw ones.
 * They exist as stored columns rather than as expressions because they are
 * also the uniqueness the database enforces, and because the old comparison
 * (`= <lowercased needle>` against a raw column) silently missed any row whose
 * casing differed. `Contact.Identity.identityOf` is the only thing that writes
 * them.
 *
 * The two unique indexes are also what closes the race the manual and webhook
 * paths both had: two deliveries for one person, milliseconds apart, used to
 * read "no match" and both insert. Now the second one loses, and the service
 * re-reads the winner instead of opening a duplicate.
 *
 * A contact born of an identity split holds *neither* key — its e-mail belongs
 * to one row and its phone to another, so claiming either would evict the
 * person who already had it. That is what keeps it out of every later match
 * until somebody resolves it, and why the pair of conflict columns is how you
 * find out who it collided with.
 */
export const crmContacts = pgTable(
  "crm_contacts",
  {
    id: ulid("crm_contact")().primaryKey(),
    name: text().notNull(),
    company: text(),
    email: text(),
    phone: text(),
    contactRole: text("contact_role"),
    // Both follow the phone rather than the request: the ddd is read off it
    // and the uf is read off the ddd. Splitting them from the person would let
    // two opportunities disagree about where one human lives.
    uf: text(),
    ddd: text(),
    emailKey: text("email_key"),
    phoneKey: text("phone_key"),
    identityConflict: boolean("identity_conflict").notNull().default(false),
    conflictEmailContactId: ulid("crm_contact")("conflict_email_contact_id").references(
      (): AnyPgColumn => crmContacts.id,
    ),
    conflictPhoneContactId: ulid("crm_contact")("conflict_phone_contact_id").references(
      (): AnyPgColumn => crmContacts.id,
    ),
    ...timestamps,
  },
  (table) => [
    // Nulls are distinct in a postgres unique index, so any number of contacts
    // may hold no e-mail — which is exactly the shape of a phone-only contact
    // and of a conflicted one. The partial clause is for soft deletes: a dead
    // row must not keep an address hostage.
    uniqueIndex("crm_contacts_email_key")
      .on(table.emailKey)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex("crm_contacts_phone_key")
      .on(table.phoneKey)
      .where(sql`${table.deletedAt} is null`),
    index("crm_contacts_name_idx").on(table.name),
    index("crm_contacts_created_at_idx").on(table.createdAt),
    // The review queue. Partial, because the flagged rows are the rare ones.
    index("crm_contacts_conflict_idx")
      .on(table.createdAt)
      .where(sql`${table.identityConflict}`),
    check(
      "crm_contacts_conflict_consistency",
      sql`${table.identityConflict} = (${table.conflictEmailContactId} is not null and ${table.conflictPhoneContactId} is not null)`,
    ),
    // A key without the column it derives from is a key nothing can recompute.
    check(
      "crm_contacts_email_key_consistency",
      sql`${table.emailKey} is null or ${table.email} is not null`,
    ),
    check(
      "crm_contacts_phone_key_consistency",
      sql`${table.phoneKey} is null or ${table.phone} is not null`,
    ),
  ],
);

export const crmOpportunities = pgTable(
  "crm_opportunities",
  {
    id: ulid("crm_opportunity")().primaryKey(),
    contactId: ulid("crm_contact")("contact_id")
      .notNull()
      .references(() => crmContacts.id),
    segment: crmOpportunitySegment().notNull(),
    source: crmOpportunitySource().notNull(),
    landingPageSlug: text("landing_page_slug"),
    createdBy: ulid("user")("created_by").references(() => users.id),
    stage: crmOpportunityStage().notNull().default("new"),
    stagedAt: instant("staged_at").notNull(),
    ...timestamps,
  },
  (table) => [
    // The listing reads a contact's history newest-first, and the intake asks
    // "does this person already have one open?" — both are this index.
    index("crm_opportunities_contact_idx").on(table.contactId, table.createdAt),
    index("crm_opportunities_created_at_idx").on(table.createdAt),
    index("crm_opportunities_segment_idx").on(table.segment),
    index("crm_opportunities_stage_idx").on(table.stage, table.stagedAt),
  ],
);

export const crmOpportunityPlacements = pgTable(
  "crm_opportunity_placements",
  {
    id: ulid("crm_opportunity_placement")().primaryKey(),
    opportunityId: ulid("crm_opportunity")("opportunity_id")
      .notNull()
      .references(() => crmOpportunities.id),
    kind: crmOpportunityPlacementKind().notNull(),
    destinationId: ulid("crm_destination")("destination_id")
      .notNull()
      .references(() => crmDestinations.id),
    userId: ulid("user")("user_id").references(() => users.id),
    placedAt: instant("placed_at").notNull(),
    dueAt: instant("due_at"),
    reason: text(),
    placedBy: ulid("user")("placed_by").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("crm_opportunity_placements_opportunity_idx").on(table.opportunityId, table.placedAt),
    index("crm_opportunity_placements_destination_idx").on(table.destinationId, table.placedAt),
    index("crm_opportunity_placements_user_idx").on(table.userId, table.placedAt),
    index("crm_opportunity_placements_due_idx")
      .on(table.dueAt)
      .where(sql`${table.kind} = 'assigned'`),
  ],
);

/**
 * One run of the engine over one opportunity, **including the runs that placed
 * nothing**. This is state, not a log: "arrived and nobody could take it" is
 * only distinguishable from "just arrived" because the row exists, and that is
 * what makes the `unrouted` status reachable at all.
 *
 * `trace` answers "why did this go to Recife?" six months later. It has to be
 * stored rather than re-derived: by then the rules will have been edited, and
 * replaying them would answer for today's table instead of the one that
 * decided. `unique (opportunity_id, attempt)` is what makes a retry idempotent.
 */
export const crmDistributions = pgTable(
  "crm_distributions",
  {
    id: ulid("crm_distribution")().primaryKey(),
    opportunityId: ulid("crm_opportunity")("opportunity_id")
      .notNull()
      .references(() => crmOpportunities.id),
    attempt: integer().notNull(),
    outcome: crmDistributionOutcome().notNull(),
    poolId: ulid("crm_pool")("pool_id").references(() => crmPools.id),
    destinationId: ulid("crm_destination")("destination_id").references(() => crmDestinations.id),
    userId: ulid("user")("user_id").references(() => users.id),
    matchedLocatorKind: crmDestinationLocatorKind("matched_locator_kind"),
    matchedLocatorValue: text("matched_locator_value"),
    trace: jsonb().$type<Schema.Json>().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("crm_distributions_attempt_key").on(table.opportunityId, table.attempt),
    index("crm_distributions_opportunity_idx").on(table.opportunityId, table.createdAt),
    // The operational alert is "nothing was placed lately", so the index is on
    // the outcome rather than on the destination.
    index("crm_distributions_outcome_idx").on(table.outcome, table.createdAt),
    check("crm_distributions_attempt_positive", sql`${table.attempt} > 0`),
    // A `placed` with no seller and an `unrouted` carrying a destination are
    // both decisions that never happened; neither should be storable.
    check(
      "crm_distributions_outcome_consistency",
      sql`case ${table.outcome}
        when 'placed' then ${table.poolId} is not null and ${table.destinationId} is not null
          and ${table.userId} is not null
          and ${table.matchedLocatorKind} is not null and ${table.matchedLocatorValue} is not null
        when 'placed_unassigned' then ${table.poolId} is not null and ${table.destinationId} is not null
          and ${table.userId} is null
          and ${table.matchedLocatorKind} is not null and ${table.matchedLocatorValue} is not null
        when 'unrouted' then ${table.poolId} is null and ${table.destinationId} is null
          and ${table.userId} is null
          and ${table.matchedLocatorKind} is null and ${table.matchedLocatorValue} is null
      end`,
    ),
  ],
);

export const crmQuotations = pgTable(
  "crm_quotations",
  {
    id: ulid("crm_quotation")().primaryKey(),
    ref: integer().generatedAlwaysAsIdentity().notNull(),
    opportunityId: ulid("crm_opportunity")("opportunity_id")
      .notNull()
      .references(() => crmOpportunities.id),
    destinationId: ulid("crm_destination")("destination_id")
      .notNull()
      .references(() => crmDestinations.id),
    sellerId: ulid("user")("seller_id")
      .notNull()
      .references(() => users.id),
    title: text().notNull(),
    value: money().notNull(),
    status: crmQuotationStatus().notNull().default("new"),
    description: text(),
    expectedCloseDate: date("expected_close_date", { mode: "string" }),
    closedAt: instant("closed_at"),
    ...timestamps,
  },
  (table) => [
    index("crm_quotations_board_idx").on(table.destinationId, table.status),
    index("crm_quotations_opportunity_idx").on(table.opportunityId),
    index("crm_quotations_seller_idx").on(table.sellerId, table.status),
    uniqueIndex("crm_quotations_ref_key").on(table.ref),
    check("crm_quotations_value_positive", sql`${table.value} > 0`),
    check(
      "crm_quotations_closed_consistency",
      sql`(${table.status} in ('won', 'lost')) = (${table.closedAt} is not null)`,
    ),
  ],
);

export const crmNotes = pgTable(
  "crm_notes",
  {
    id: ulid("crm_note")().primaryKey(),
    opportunityId: ulid("crm_opportunity")("opportunity_id").references(() => crmOpportunities.id),
    quotationId: ulid("crm_quotation")("quotation_id").references(() => crmQuotations.id),
    body: text().notNull(),
    authorId: ulid("user")("author_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("crm_notes_opportunity_idx").on(table.opportunityId, table.createdAt),
    index("crm_notes_quotation_idx").on(table.quotationId, table.createdAt),
    check("crm_notes_one_owner", sql`num_nonnulls(${table.opportunityId}, ${table.quotationId}) = 1`),
  ],
);

export const crmEvents = pgTable(
  "crm_events",
  {
    id: ulid("crm_event")().primaryKey(),
    kind: crmEventKind().notNull(),
    opportunityId: ulid("crm_opportunity")("opportunity_id")
      .notNull()
      .references(() => crmOpportunities.id),
    destinationId: ulid("crm_destination")("destination_id").references(() => crmDestinations.id),
    actorUserId: ulid("user")("actor_user_id").references(() => users.id),
    payload: jsonb().$type<Schema.Json>().notNull(),
    ...timestamps,
  },
  (table) => [
    index("crm_events_opportunity_idx").on(table.opportunityId, table.createdAt),
    index("crm_events_destination_idx").on(table.destinationId, table.createdAt),
    index("crm_events_actor_idx").on(table.actorUserId, table.createdAt),
  ],
);

/**
 * A file attached to an opportunity's history. Kept apart from `crm_notes` —
 * a note answers to either an opportunity or a quotation and always carries a
 * body; a file answers only to an opportunity and never carries one. Sharing
 * the table would mean loosening `crm_notes_one_owner` and making `body`
 * optional for a case that has nothing to do with quotations.
 */
export const crmOpportunityFiles = pgTable(
  "crm_opportunity_files",
  {
    id: ulid("crm_opportunity_file")().primaryKey(),
    opportunityId: ulid("crm_opportunity")("opportunity_id")
      .notNull()
      .references(() => crmOpportunities.id),
    filename: text().notNull(),
    mediaType: text("media_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    authorId: ulid("user")("author_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("crm_opportunity_files_opportunity_idx").on(table.opportunityId, table.createdAt),
  ],
);

/**
 * File bytes stay out of `crm_opportunity_files`, mirroring
 * `ticket_entry_file_contents` — so listing an opportunity's history never
 * loads or serializes its attachments. The row above is committed before these
 * bytes are written, which is what lets the foreign key hold.
 */
export const crmOpportunityFileContents = pgTable("crm_opportunity_file_contents", {
  fileId: ulid("crm_opportunity_file")("file_id")
    .primaryKey()
    .references(() => crmOpportunityFiles.id),
  data: bytea().notNull(),
  ...timestamps,
});

/**
 * One thread per contact, and the reason it hangs off the person rather than
 * off an opportunity: somebody who bought last year and comes back is one
 * conversation, not two. `Note` and the attachments answer to a negotiation;
 * this answers to a relationship.
 *
 * `last_inbound_at` is the twenty-four hour window Meta enforces — only a
 * message *from* the customer opens it. Derived from the messages it would be
 * a scan of the thread on every screen; kept here it is one column.
 */
export const crmConversations = pgTable(
  "crm_conversations",
  {
    id: ulid("crm_conversation")().primaryKey(),
    contactId: ulid("crm_contact")("contact_id")
      .notNull()
      .references(() => crmContacts.id),
    lastInboundAt: instant("last_inbound_at"),
    ...timestamps,
  },
  (table) => [
    // One thread per contact, and a soft-deleted one gives the contact back.
    uniqueIndex("crm_conversations_contact_key")
      .on(table.contactId)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const crmConversationDirection = pgEnum("crm_conversation_direction", ["inbound", "outbound"]);

export const crmConversationMessageKind = pgEnum("crm_conversation_message_kind", [
  "text",
  "media",
  "template",
]);

/**
 * `external_id` is the id Meta assigns on send, and it is what the delivery
 * receipts arrive keyed by — minutes or hours later, on their own webhook.
 * Absent on an inbound message, which nobody acknowledges back.
 *
 * `author_id` is the person who typed it, and it is null for everything
 * inbound: the customer is not a user of this system.
 */
export const crmConversationMessages = pgTable(
  "crm_conversation_messages",
  {
    id: ulid("crm_conversation_message")().primaryKey(),
    conversationId: ulid("crm_conversation")("conversation_id")
      .notNull()
      .references(() => crmConversations.id),
    direction: crmConversationDirection().notNull(),
    kind: crmConversationMessageKind().notNull(),
    body: text(),
    filename: text(),
    mediaType: text("media_type"),
    sizeBytes: integer("size_bytes"),
    templateName: text("template_name"),
    templateParameters: jsonb("template_parameters").$type<ReadonlyArray<string>>(),
    externalId: text("external_id"),
    authorId: ulid("user")("author_id").references(() => users.id),
    sentAt: instant("sent_at").notNull(),
    deliveredAt: instant("delivered_at"),
    readAt: instant("read_at"),
    ...timestamps,
  },
  (table) => [
    index("crm_conversation_messages_thread_idx").on(table.conversationId, table.sentAt),
    // The receipts arrive by this id and nothing else.
    index("crm_conversation_messages_external_idx").on(table.externalId),
    check(
      "crm_conversation_messages_author_consistency",
      sql`(${table.direction} = 'inbound') = (${table.authorId} is null)`,
    ),
  ],
);

/**
 * Bytes out of the message row, as everywhere else here: reading a thread
 * should never load the photos that passed through it.
 */
export const crmConversationMedia = pgTable("crm_conversation_media", {
  messageId: ulid("crm_conversation_message")("message_id")
    .primaryKey()
    .references(() => crmConversationMessages.id),
  data: bytea().notNull(),
  ...timestamps,
});

/**
 * A message from a number no contact holds.
 *
 * It does not become a contact on its own. The crm resolves identity through
 * `email_key` and `phone_key` with partial unique indexes and a conflict flag
 * — a whole design built to not write the same person down twice. Creating a
 * row for every wrong number and every robot would fill it with people nobody
 * asked for, each claiming a phone key.
 */
export const crmUnclaimedMessages = pgTable(
  "crm_unclaimed_messages",
  {
    id: ulid("crm_conversation_message")().primaryKey(),
    phone: text().notNull(),
    kind: crmConversationMessageKind().notNull(),
    body: text(),
    receivedAt: instant("received_at").notNull(),
    ...timestamps,
  },
  (table) => [index("crm_unclaimed_messages_received_idx").on(table.receivedAt)],
);