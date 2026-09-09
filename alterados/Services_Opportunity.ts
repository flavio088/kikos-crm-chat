import { Ability } from "@kikos/ability";
import { File as PrimitiveFile } from "@kikos/primitives";
import { Contact, Distribution, Event, Intake, Opportunity, OpportunityFile, Note, Policy, Quotation } from "@kikos/crm-core";
import { CrmContactId, CrmDestinationId, CrmOpportunityId,CrmOpportunityFileId, UserId } from "@kikos/effect-identity";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { ContactPersistence } from "../../Persistance/Contact";
import { QuotationPersistence } from "../../Persistance/Quotation";
import { DistributionPersistence } from "../../Persistance/Distribution";
import { EventPersistence } from "../../Persistance/Event";
import { OpportunityPersistence } from "../../Persistance/Opportunity";
import { OpportunityFilePersistence } from "../../Persistance/OpportunityFile";
import { OpportunityFileContentPersistence } from "../../Persistance/OpportunityFileContent";
import { NotePersistence } from "../../Persistance/Note";
import { PlacementPersistence } from "../../Persistance/Placement";
import { standingsOf } from "../Quotation";
import { CrmConflictError, CrmForbiddenError, CrmNotFoundError, type CrmActor } from "../Destination";
import { CrmContactService, type ContactDraft } from "../Contact";
import { CrmDistributionDispatch, CrmDistributionService } from "../Distribution";
import { openOf } from "./Reuse";

export * from "./Reuse";

export class CrmOpportunityError extends Schema.TaggedError<CrmOpportunityError>()("Services.Crm.Opportunity.Error", {
  message: Schema.String,
}) {}

export type CrmOpportunityFailure =
  | CrmOpportunityError
  | CrmForbiddenError
  | CrmNotFoundError
  | CrmConflictError;

/**
 * Listing gained a refusal the day it gained a store: naming one is a request
 * to read that store, and a caller who cannot reach it is turned away rather
 * than handed an empty page. An empty page would be a lie — it reads as "this
 * store has nothing" when the truth is "this store is not yours".
 */
export type CrmOpportunityListFailure = CrmOpportunityError | CrmForbiddenError;

export const DEFAULT_OPPORTUNITY_PAGE_LIMIT = 20;
export const MAX_OPPORTUNITY_PAGE_LIMIT = 100;

export type OpportunitySummary = {
  readonly opportunity: Opportunity.Opportunity;
  /**
   * Travels with the opportunity rather than being fetched behind it: a
   * listing is a table of names, and twenty extra reads per page is the n+1
   * the repository's join exists to avoid.
   */
  readonly contact: Contact.Contact;
  readonly status: Opportunity.Status.Status;
  readonly stage: Opportunity.Stage.Stage;
  readonly placement: Opportunity.Placement.Any | undefined;
};

export type OpportunityTimelineEntry =
  | { readonly kind: "note"; readonly at: DateTime.Utc; readonly note: Note.OnOpportunity }
  | { readonly kind: "event"; readonly at: DateTime.Utc; readonly event: Event.Event }
  | {
      readonly kind: "file";
      readonly at: DateTime.Utc;
      readonly file: OpportunityFile.OpportunityFile;
    };

export type OpportunityDetail = OpportunitySummary & {
  readonly timeline: ReadonlyArray<OpportunityTimelineEntry>;
  /**
   * Every routing attempt this opportunity has been through, failures kept.
   *
   * `status` already folds them into one word, and one word cannot answer the
   * question an `unrouted` lead raises — which is not *that* nothing took it
   * but *why*. The trace on each attempt names the signals it carried and the
   * candidates it weighed, which is what somebody placing it by hand needs.
   */
  readonly distributions: ReadonlyArray<Distribution.Attempt.Any>;
};

export type OpportunityListing = {
  readonly items: ReadonlyArray<OpportunitySummary>;
  readonly total: number;
  readonly page: number;
  readonly limit: number;
};

/**
 * One row per seller holding work at the store, plus at most one row for the
 * work nobody holds yet — `userId` absent.
 *
 * A `userId` here is whoever holds the work, which is not the same list as the
 * store's roster: taking someone off a roster does not move the placements
 * they were holding, so a seller who left the store keeps appearing until the
 * work is placed somewhere else. A screen that draws its rows from the roster
 * and looks each name up here will therefore lose those opportunities from the
 * rows while `total` still counts them. The rows to draw are these ones.
 */
export type OpportunitySellerCount = {
  readonly userId: UserId.Id | undefined;
  readonly total: number;
};

/**
 * The answer is closed: `sellers` and `reclaimed` partition `total`, because
 * the latest placement of an opportunity is an assignment or a reclaim and
 * there is no third kind. A panel can print the rows, print the reclaims, and
 * print the total, and the three agree without anybody subtracting anything.
 *
 * `reclaimed` is its own number rather than a seller row because that is what
 * it is: the store took the work back, so it belongs to the store and to no
 * person. It was always in the store's total; what was missing was any way to
 * see it there.
 *
 * `total` is the count under the same store and the same filters, so it is the
 * listing's total for the same query — not a second, wider number that happens
 * to sit next to it.
 */
export type OpportunitySellerTally = {
  readonly destinationId: CrmDestinationId.Id;
  readonly sellers: ReadonlyArray<OpportunitySellerCount>;
  readonly reclaimed: number;
  readonly total: number;
};

/**
 * The store is named — counting is always counting one store — and the three
 * filters are the listing's own. Taking them was the choice between two ways
 * of making the screen add up, and it is the one that leaves a single set
 * being described: filter the page by segment and the counters answer for that
 * segment, so `total` here and the page's total are the same number rather
 * than two numbers a reader has to reconcile. Omitted, they mean what they
 * mean on the listing — no narrowing, the whole store.
 */
export type OpportunitySellerTallyQuery = {
  readonly destinationId: CrmDestinationId.Id;
  readonly segment: Opportunity.Segment.Segment | undefined;
  readonly source: Opportunity.Source.Source | undefined;
  readonly search: string | undefined;
  readonly status: Opportunity.Status.Status | undefined;
  readonly stage: Opportunity.Stage.Stage | undefined;
};

export type OpportunityListQuery = {
  readonly segment: Opportunity.Segment.Segment | undefined;
  readonly source: Opportunity.Source.Source | undefined;
  readonly search: string | undefined;
  /**
   * The derived status. It is the one filter that answers "quais ninguém está
   * atendendo": without it the `unrouted` leads are a badge to be found by
   * scrolling, which is the failure the whole engine exists to end.
   */
  readonly status: Opportunity.Status.Status | undefined;
  readonly stage: Opportunity.Stage.Stage | undefined;
  readonly destinationId: CrmDestinationId.Id | undefined;
  readonly page: number | undefined;
  readonly limit: number | undefined;
};

export type CreateOpportunityInput = {
  readonly name: string;
  readonly company: string | undefined;
  readonly email: string | undefined;
  readonly phone: string | undefined;
  readonly contactRole: string | undefined;
  readonly segment: Opportunity.Segment.Segment;
  readonly source: Opportunity.Source.Source;
  readonly uf: string | undefined;
  readonly ddd: string | undefined;
  readonly landingPageSlug: string | undefined;
  /** Names the person outright, skipping identity resolution. */
  readonly contactId: CrmContactId.Id | undefined;
  /**
   * Open a second opportunity even though this contact already has one open.
   *
   * It used to mean "skip the duplicate check entirely", which also meant
   * writing the person down twice. Now the contact is resolved either way and
   * only the reuse of the open opportunity is waived — which is what whoever
   * ticks it actually wants.
   */
  readonly separateOpportunity: boolean;
};

/**
 * What is left of editing an opportunity once the person moved out: everything
 * else on the old payload — name, company, e-mail, phone, role — describes the
 * contact, and is corrected through `PATCH /crm/contacts/:id`.
 */
export type UpdateOpportunityInput = {
  readonly segment: Opportunity.Segment.Segment | undefined;
};

export type OpportunityIngestion =
  | { readonly outcome: "created"; readonly opportunity: OpportunitySummary }
  | { readonly outcome: "updated"; readonly opportunity: OpportunitySummary };

export type OpportunityCreation =
  | { readonly outcome: "created"; readonly opportunity: OpportunitySummary }
  | { readonly outcome: "deduplicated"; readonly opportunity: OpportunitySummary }
  | { readonly outcome: "already_handled" };

export const OPPORTUNITY_COLUMN_LIMIT = 20;

export const MAX_OPPORTUNITY_FILES = 20;

export const DEFAULT_OPPORTUNITY_COLUMN_PAGE_LIMIT = 20;

export const MAX_OPPORTUNITY_COLUMN_PAGE_LIMIT = 50;

export type OpportunityCard = OpportunitySummary & {
  readonly quotation: Quotation.Quotation | undefined;
};

export type OpportunityColumn = {
  readonly stage: Opportunity.Stage.Stage;
  readonly opportunities: ReadonlyArray<OpportunityCard>;
  readonly total: number;
  readonly historic: number;
};

export type OpportunityBoard = {
  readonly destinationId: CrmDestinationId.Id | undefined;
  readonly window: Quotation.MonthWindow;
  readonly columns: ReadonlyArray<OpportunityColumn>;
};

export type OpportunityColumnQuery = {
  readonly destinationId: CrmDestinationId.Id | undefined;
  readonly stage: Opportunity.Stage.Stage;
  readonly offset: number | undefined;
  readonly limit: number | undefined;
};

export interface ICrmOpportunityService {
  readonly list: (
    actor: CrmActor,
    query: OpportunityListQuery,
  ) => Effect.Effect<OpportunityListing, CrmOpportunityListFailure>;
  readonly sellerTally: (
    actor: CrmActor,
    query: OpportunitySellerTallyQuery,
  ) => Effect.Effect<OpportunitySellerTally, CrmOpportunityListFailure>;
  readonly detail: (
    actor: CrmActor,
    id: CrmOpportunityId.Id,
  ) => Effect.Effect<OpportunityDetail, CrmOpportunityFailure>;
  readonly board: (
    actor: CrmActor,
    destinationId: CrmDestinationId.Id | undefined,
  ) => Effect.Effect<OpportunityBoard, CrmOpportunityListFailure>;
  readonly column: (
    actor: CrmActor,
    query: OpportunityColumnQuery,
  ) => Effect.Effect<OpportunityColumn, CrmOpportunityListFailure>;
  readonly moveStage: (
    actor: CrmActor,
    id: CrmOpportunityId.Id,
    to: Opportunity.Stage.Target,
  ) => Effect.Effect<OpportunitySummary, CrmOpportunityFailure>;
  readonly create: (
    actor: CrmActor,
    input: CreateOpportunityInput,
  ) => Effect.Effect<OpportunityCreation, CrmOpportunityFailure>;
  readonly ingest: (
    intake: Intake.OpportunityIntake,
  ) => Effect.Effect<OpportunityIngestion, CrmOpportunityFailure>;
  readonly update: (
    actor: CrmActor,
    id: CrmOpportunityId.Id,
    input: UpdateOpportunityInput,
  ) => Effect.Effect<OpportunitySummary, CrmOpportunityFailure>;
  readonly remove: (
    actor: CrmActor,
    id: CrmOpportunityId.Id,
  ) => Effect.Effect<OpportunitySummary, CrmOpportunityFailure>;
  readonly addNote: (
    actor: CrmActor,
    id: CrmOpportunityId.Id,
    body: string,
  ) => Effect.Effect<OpportunityDetail, CrmOpportunityFailure>;
  /**
   * Attaches a file to an opportunity's history.
   *
   * `content` is the decoded `PrimitiveFile.File`, so the media type has
   * already been narrowed to the accepted set by the time it arrives — and
   * `authorId` is read off the actor rather than taken from the caller, the
   * same way `addNote` settles who wrote a note.
   */
  readonly attachFile: (
    actor: CrmActor,
    id: CrmOpportunityId.Id,
    input: { readonly filename: string; readonly content: PrimitiveFile.File },
  ) => Effect.Effect<OpportunityDetail, CrmOpportunityFailure>;

  

    readonly fileContent: (
    actor: CrmActor,
    id: CrmOpportunityId.Id,
    fileId: CrmOpportunityFileId.Id,
  ) => Effect.Effect <
    { readonly file: OpportunityFile.OpportunityFile; readonly data: Uint8Array },
    CrmOpportunityFailure
  >;

    /*
   * Takes an attachment back off the history.
   * Same verb as attaching: whoever may write to a history may correct what
   * they wrote there. The row is kept as the record that a file was attached
   * and taken back; the bytes are dropped for real, because they are what the
   * cap counts.
   */
  readonly detachFile: (
    actor: CrmActor,
    id: CrmOpportunityId.Id,
    fileId: CrmOpportunityFileId.Id,
  ) => Effect.Effect<OpportunityDetail, CrmOpportunityFailure>;
}

export class CrmOpportunityService extends Context.Service<CrmOpportunityService, ICrmOpportunityService>()(
  "@kikos/crm-services/Services/Opportunity/CrmOpportunityService",
) {}

const failed = Effect.mapError(
  (e: { readonly message: string }) => new CrmOpportunityError({ message: e.message }),
);

const requireCan = (
  ability: Policy.CrmAbility,
  action: Policy.OpportunityAction,
  placed: Policy.PlacedOpportunity,
) =>
  Ability.require(ability, action, placed).pipe(
    Effect.mapError((e) => new CrmForbiddenError({ message: e.message })),
  );

const resolveQuery = (query: OpportunityListQuery) => ({
  segment: query.segment,
  source: query.source,
  search: query.search,
  status: query.status,
  stage: query.stage,
  destinationId: query.destinationId,
  page: Math.max(1, query.page ?? 1),
  limit: Math.min(MAX_OPPORTUNITY_PAGE_LIMIT, Math.max(1, query.limit ?? DEFAULT_OPPORTUNITY_PAGE_LIMIT)),
});

/**
 * Naming a store is a request to read that store, so reach is decided before
 * the query runs — the same order the quotation board uses. Leaving it to the
 * filter alone would be enough for a seller but not for the admin path, which
 * reads `page` unscoped: there the destination is the only thing narrowing the
 * result, and an unreachable store would simply be answered.
 *
 * The refusal is deliberate rather than an empty page: an empty page says "this
 * store has nothing", and the honest answer is "this store is not yours".
 */
const requireReach = (actor: CrmActor, destinationId: CrmDestinationId.Id | undefined) => {
  if (Policy.oversees(actor.principal.role)) return Effect.void;
  if (destinationId === undefined) {
    return Effect.fail(
      new CrmForbiddenError({ message: "Only an admin reads every crm destination at once" }),
    );
  }
  return actor.scope.works(destinationId)
    ? Effect.void
    : Effect.fail(
        new CrmForbiddenError({
          message: `The crm destination ${destinationId} is out of reach`,
        }),
      );
};

type QuotationStandings = ReadonlyArray<Opportunity.Status.QuotationStanding>;

type Attempts = ReadonlyArray<Opportunity.Status.DistributionAttempt>;

/**
 * The attempts are read rather than assumed empty, and that is the whole of
 * what makes `unrouted` reachable: an opportunity nobody could take has no
 * placement, exactly like one that has just arrived, and the only thing that
 * tells the two apart is a distribution row saying somebody tried.
 */
const statusOf = (
  stage: Opportunity.Stage.Target,
  placements: ReadonlyArray<Opportunity.Placement.Any>,
  attempts: Attempts,
  quotations: QuotationStandings,
): Opportunity.Status.Status =>
  Opportunity.Status.derive({ stage, placements, distributions: attempts, quotations });

const withheld = (attempt: Distribution.Attempt.Any): Distribution.Attempt.Any => {
  const trace = attempt.trace;
  if (typeof trace !== "object" || trace === null || Array.isArray(trace)) return attempt;
  const { weighed: _weighed, considered: _considered, ...kept } = trace as Schema.JsonObject;
  switch (attempt.outcome) {
    case "placed":
      return new Distribution.Attempt.Placed({ ...attempt, trace: kept });
    case "placed_unassigned":
      return new Distribution.Attempt.PlacedUnassigned({ ...attempt, trace: kept });
    case "unrouted":
      return new Distribution.Attempt.Unrouted({ ...attempt, trace: kept });
  }
};

const summaryOf = (
  contacted: OpportunityPersistence.ContactedOpportunity,
  attempts: Attempts,
  quotations: QuotationStandings,
): OpportunitySummary => ({
  opportunity: contacted.placed.opportunity,
  contact: contacted.contact,
  status: statusOf(
    contacted.placed.opportunity.stage,
    contacted.placed.placement === undefined ? [] : [contacted.placed.placement],
    attempts,
    quotations,
  ),
  stage: Opportunity.Stage.derive({ target: contacted.placed.opportunity.stage, quotations }),
  placement: contacted.placed.placement,
});

const candidateOf = (
  contacted: OpportunityPersistence.ContactedOpportunity,
  attempts: Attempts,
  quotations: QuotationStandings,
) => ({
  opportunity: contacted.placed.opportunity,
  contact: contacted.contact,
  placement: contacted.placed.placement,
  stage: contacted.placed.opportunity.stage,
  placements: contacted.placed.placement === undefined ? [] : [contacted.placed.placement],
  distributions: attempts,
  quotations,
});

const isJsonObject = (payload: Schema.Json): payload is Schema.JsonObject =>
  typeof payload === "object" && payload !== null && !Array.isArray(payload);

const notedNoteId = (event: Event.Event): string | undefined => {
  const noteId = isJsonObject(event.payload) ? event.payload["noteId"] : undefined;
  return typeof noteId === "string" ? noteId : undefined;
};

const echoesNote = (notes: ReadonlyArray<Note.OnOpportunity>, event: Event.Event): boolean => {
  const noteId = notedNoteId(event);
  return noteId !== undefined && notes.some((note) => note.id === noteId);
};

const timelineOf = (
  notes: ReadonlyArray<Note.OnOpportunity>,
  events: ReadonlyArray<Event.Event>,
  files: ReadonlyArray<OpportunityFile.OpportunityFile>,
): ReadonlyArray<OpportunityTimelineEntry> =>
  [
    ...notes.map((note): OpportunityTimelineEntry => ({ kind: "note", at: note.createdAt, note })),
    ...events
      .filter((event) => !echoesNote(notes, event))
      .map((event): OpportunityTimelineEntry => ({ kind: "event", at: event.createdAt, event })),
    /**
     * Attachments carry no echoing event to filter out: a file is not recorded
     * in `crm_events` at all. `Event.Kind` documents why — every literal there
     * costs a branch in the timeline's exhaustive switch, and a state that
     * already lives in a table of its own is not written to the log a second
     * time. The row's own `createdAt` is what places it here.
     */
    ...files.map((file): OpportunityTimelineEntry => ({ kind: "file", at: file.createdAt, file })),
  ].sort((a, b) => DateTime.toEpochMillis(a.at) - DateTime.toEpochMillis(b.at));

const duplicateNoteBody = (input: CreateOpportunityInput): string =>
  `Duplicate contact merged into this opportunity: ${input.name}${
    input.company === undefined ? "" : ` (${input.company})`
  } via ${input.source}`;

const draftOf = (input: CreateOpportunityInput): ContactDraft => ({
  name: input.name,
  company: input.company,
  email: input.email,
  phone: input.phone,
  contactRole: input.contactRole,
  uf: input.uf,
  ddd: input.ddd,
});

const intakeDraftOf = (intake: Intake.OpportunityIntake): ContactDraft => ({
  name: Intake.displayNameOf(intake),
  company: intake.company,
  email: intake.email,
  phone: intake.phone,
  contactRole: intake.contactRole,
  uf: intake.uf,
  ddd: intake.ddd,
});

export const make = Effect.gen(function* () {
  const opportunities = yield* OpportunityPersistence.Repository;
  const placements = yield* PlacementPersistence.Repository;
  const notes = yield* NotePersistence.Repository;
  const events = yield* EventPersistence.Repository;
  const files = yield* OpportunityFilePersistence.Repository;
  const contents = yield* OpportunityFileContentPersistence.Repository;
  const quotations = yield* QuotationPersistence.Repository;
  const attempts = yield* DistributionPersistence.Repository;
  const contacts = yield* ContactPersistence.Repository;
  const contactService = yield* CrmContactService;
  const distribution = yield* CrmDistributionService;
  const dispatch = yield* CrmDistributionDispatch;

  const filing = <A, E, R>(contactId: CrmContactId.Id, body: Effect.Effect<A, E, R>) =>
    contacts.locking(contactId, body).pipe(
      Effect.mapError((e) =>
        e instanceof ContactPersistence.ContactRepositoryError
          ? new CrmOpportunityError({ message: e.message })
          : e,
      ),
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              new CrmNotFoundError({
                reason: "contact_not_found",
                message: `No crm contact ${contactId}`,
              }),
            ),
          onSome: Effect.succeed,
        }),
      ),
    );

  const standingsFor = Effect.fn("standingsFor")(function* (opportunityIds: ReadonlyArray<CrmOpportunityId.Id>) {
    return standingsOf(yield* quotations.standings(opportunityIds).pipe(failed));
  });

  const quotationsOf = Effect.fn("quotationsOf")(function* (opportunityId: CrmOpportunityId.Id) {
    return (yield* standingsFor([opportunityId])).get(opportunityId) ?? [];
  });

  /** One read for a whole page, grouped here — the same shape `standingsFor` answers in. */
  const attemptsFor = Effect.fn("attemptsFor")(function* (
    opportunityIds: ReadonlyArray<CrmOpportunityId.Id>,
  ) {
    const rows = yield* attempts.forOpportunities(opportunityIds).pipe(failed);
    const grouped = new Map<CrmOpportunityId.Id, Opportunity.Status.DistributionAttempt[]>();
    for (const row of rows) {
      const one = Distribution.Attempt.toStatusAttempt(row);
      const held = grouped.get(row.opportunityId);
      if (held === undefined) grouped.set(row.opportunityId, [one]);
      else held.push(one);
    }
    return grouped;
  });

  const attemptsOf = Effect.fn("attemptsOf")(function* (opportunityId: CrmOpportunityId.Id) {
    const rows = yield* attempts.forOpportunity(opportunityId).pipe(failed);
    return rows.map(Distribution.Attempt.toStatusAttempt);
  });

  const requireOpportunity = Effect.fn("requireOpportunity")(function* (id: CrmOpportunityId.Id) {
    const found = yield* opportunities.findById(id).pipe(failed);
    if (Option.isNone(found)) {
      return yield* Effect.fail(
        new CrmNotFoundError({
          reason: "opportunity_not_found",
          message: `No crm opportunity ${id}`,
        }),
      );
    }
    return found.value;
  });

  const detailOf = Effect.fn("detailOf")(function* (
    contacted: OpportunityPersistence.ContactedOpportunity,
  ) {
    const { opportunity } = contacted.placed;
    const history = yield* placements.forOpportunity(opportunity.id).pipe(failed);
    const written = yield* notes.forOpportunity(opportunity.id).pipe(failed);
    const logged = yield* events.forOpportunity(opportunity.id).pipe(failed);
    /** Metadata only — the bytes live in their own table and are read on download. */
    const attached = yield* files.forOpportunity(opportunity.id).pipe(failed);
    /**
     * The rows themselves, not the reduced shape `attemptsOf` answers in: the
     * detail carries both the status they fold into and the trace they hold,
     * and reading them twice for that would be one query too many.
     */
    const tried = yield* attempts.forOpportunity(opportunity.id).pipe(failed);
    const held = yield* quotationsOf(opportunity.id);
    return {
      opportunity,
      contact: contacted.contact,
      status: statusOf(opportunity.stage, history, tried.map(Distribution.Attempt.toStatusAttempt), held),
      stage: Opportunity.Stage.derive({ target: opportunity.stage, quotations: held }),
      placement: Option.getOrUndefined(Opportunity.Placement.latest(history)),
      timeline: timelineOf(written, logged, attached),
      distributions: tried,
    };
  });

  const record = Effect.fn("record")(function* (input: {
    readonly kind: Event.Kind;
    readonly opportunityId: CrmOpportunityId.Id;
    readonly placed: Policy.PlacedOpportunity | undefined;
    readonly actorUserId: UserId.Id | undefined;
    readonly payload: Schema.Json;
  }) {
    const destinationId = input.placed?.destinationId;
    return yield* events
      .save(
        yield* Event.make({
          kind: input.kind,
          opportunityId: input.opportunityId,
          ...(destinationId === undefined ? {} : { destinationId }),
          ...(input.actorUserId === undefined ? {} : { actorUserId: input.actorUserId }),
          payload: input.payload,
        }).pipe(failed),
      )
      .pipe(failed);
  });

  /**
   * The webhook answers before the engine runs, and on purpose.
   *
   * Distributing inline would hold the global lock on `crm_pools` for the
   * length of RD Station's http call, and RD retries on its own timeout — so a
   * slow round would arrive back as a second delivery of the same lead, then a
   * third. Detached, the delivery is recorded and acknowledged, and the routing
   * lands a moment later; a failure shows up in the logs and the lead sits in
   * `received` until somebody retries it, which is visible on the listing.
   */
  const routeInBackground = (opportunityId: CrmOpportunityId.Id) =>
    dispatch.dispatch(
      distribution.distribute(opportunityId).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("crm distribution: an intake was not routed", cause),
        ),
        Effect.asVoid,
      ),
    );

  const cardsOf = Effect.fn("cardsOf")(function* (
    items: ReadonlyArray<OpportunityPersistence.ContactedOpportunity>,
  ) {
    const ids = items.map((contacted) => contacted.placed.opportunity.id);
    const standings = yield* standingsFor(ids);
    const tried = yield* attemptsFor(ids);
    const quoted = yield* quotations.forOpportunities(ids).pipe(failed);
    return items.map((contacted): OpportunityCard => {
      const id = contacted.placed.opportunity.id;
      return {
        ...summaryOf(contacted, tried.get(id) ?? [], standings.get(id) ?? []),
        quotation: quoted.find((quotation) => quotation.opportunityId === id),
      };
    });
  });

  const columnOf = Effect.fn("columnOf")(function* (held: OpportunityPersistence.BoardColumn) {
    return {
      stage: held.stage,
      opportunities: yield* cardsOf(held.items),
      total: held.total,
      historic: held.historic,
    };
  });

  const board: ICrmOpportunityService["board"] = Effect.fn("board")(function* (actor, destinationId) {
    yield* requireReach(actor, destinationId);
    const window = yield* Quotation.currentMonthWindow;
    const columns = yield* opportunities
      .board({ destinationId, window, limit: OPPORTUNITY_COLUMN_LIMIT })
      .pipe(failed);
    return { destinationId, window, columns: yield* Effect.forEach(columns, columnOf) };
  });

  const column: ICrmOpportunityService["column"] = Effect.fn("column")(function* (actor, query) {
    yield* requireReach(actor, query.destinationId);
    const window = yield* Quotation.currentMonthWindow;
    const held = yield* opportunities
      .column({
        destinationId: query.destinationId,
        stage: query.stage,
        window,
        offset: Math.max(0, query.offset ?? 0),
        limit: Math.min(
          MAX_OPPORTUNITY_COLUMN_PAGE_LIMIT,
          Math.max(1, query.limit ?? DEFAULT_OPPORTUNITY_COLUMN_PAGE_LIMIT),
        ),
      })
      .pipe(failed);
    return yield* columnOf(held);
  });

  const moveStage: ICrmOpportunityService["moveStage"] = Effect.fn("moveStage")(function* (actor, id, to) {
    const contacted = yield* requireOpportunity(id);
    yield* requireCan(actor.ability, "update", contacted.placed);
    const now = yield* DateTime.now;
    const moved = yield* opportunities.moveStage(id, { to, at: now }).pipe(failed);
    switch (moved.outcome) {
      case "missing":
        return yield* Effect.fail(
          new CrmNotFoundError({ reason: "opportunity_not_found", message: `No crm opportunity ${id}` }),
        );
      case "refused":
        return yield* Effect.fail(
          new CrmConflictError({
            reason: "opportunity_stage_refused",
            message: `Opportunity ${id} is ${moved.from} and does not move to ${to}`,
          }),
        );
      case "moved": {
        if (moved.from !== to) {
          yield* record({
            kind: "staged",
            opportunityId: id,
            placed: contacted.placed,
            actorUserId: actor.principal.id,
            payload: { from: moved.from, to },
          });
        }
        const fresh = yield* requireOpportunity(id);
        return summaryOf(fresh, yield* attemptsOf(id), yield* quotationsOf(id));
      }
    }
  });

  const list: ICrmOpportunityService["list"] = Effect.fn("list")(function* (actor, query) {
    const resolved = resolveQuery(query);
    if (resolved.destinationId !== undefined) yield* requireReach(actor, resolved.destinationId);
    const found = Policy.oversees(actor.principal.role)
      ? yield* opportunities.page(resolved).pipe(failed)
      : yield* opportunities.forScope(actor.scope, resolved).pipe(failed);
    const ids = found.items.map((contacted) => contacted.placed.opportunity.id);
    const standings = yield* standingsFor(ids);
    const tried = yield* attemptsFor(ids);
    return {
      items: found.items.map((contacted) =>
        summaryOf(
          contacted,
          tried.get(contacted.placed.opportunity.id) ?? [],
          standings.get(contacted.placed.opportunity.id) ?? [],
        ),
      ),
      total: found.total,
      page: resolved.page,
      limit: resolved.limit,
    };
  });

  /**
   * The store is named, never inferred, so asking for its counters is asking
   * to read it — the same request the listing makes, refused the same way and
   * in the same order. Reach is settled before the query runs: a caller who
   * cannot reach the store is turned away rather than handed a tally of zeros,
   * which would read as "nobody is working this store" instead of "this store
   * is not yours".
   */
  const sellerTally: ICrmOpportunityService["sellerTally"] = Effect.fn("sellerTally")(function* (
    actor,
    query,
  ) {
    yield* requireReach(actor, query.destinationId);
    const tally = yield* opportunities
      .sellerTally({
        destinationId: query.destinationId,
        segment: query.segment,
        source: query.source,
        search: query.search,
        status: query.status,
        stage: query.stage,
      })
      .pipe(failed);
    return { destinationId: query.destinationId, ...tally };
  });

  const detail: ICrmOpportunityService["detail"] = Effect.fn("detail")(function* (actor, id) {
    const contacted = yield* requireOpportunity(id);
    yield* requireCan(actor.ability, "read", contacted.placed);
    const full = yield* detailOf(contacted);
    const heldAt = contacted.placed.heldAt;
    const trusted =
      Policy.oversees(actor.principal.role) || (heldAt !== undefined && actor.scope.manages(heldAt));
    return trusted ? full : { ...full, distributions: full.distributions.map(withheld) };
  });

  /**
   * The person is settled first, always — even when `separateOpportunity` waives
   * the reuse of an open opportunity. Skipping resolution there is what the old
   * flag did, and it is how one human ended up written down twice.
   */
  const resolveContact = Effect.fn("resolveContact")(function* (draft: ContactDraft) {
    return yield* contactService.resolve(draft).pipe(
      Effect.mapError((e) => new CrmOpportunityError({ message: e.message })),
    );
  });

  const openFor = Effect.fn("openFor")(function* (contactId: CrmContactId.Id) {
    const held = yield* opportunities.forContact(contactId).pipe(failed);
    const ids = held.map((c) => c.placed.opportunity.id);
    const standings = yield* standingsFor(ids);
    const tried = yield* attemptsFor(ids);
    return {
      held,
      open: openOf(
        held.map((c) =>
          candidateOf(
            c,
            tried.get(c.placed.opportunity.id) ?? [],
            standings.get(c.placed.opportunity.id) ?? [],
          ),
        ),
      ),
    };
  });

  const create: ICrmOpportunityService["create"] = Effect.fn("create")(function* (actor, input) {
    const contact =
      input.contactId === undefined
        ? yield* Effect.flatMap(resolveContact(draftOf(input)), (resolution) =>
            /**
             * A human is standing here, so the split is refused by name rather
             * than papered over with a third contact. Whoever is filling the
             * form is exactly the person who can say which of the two rows is
             * the human — and telling them costs one screen, while guessing
             * costs a duplicate nobody notices.
             */
            resolution.outcome === "conflict"
              ? Effect.fail(
                  new CrmConflictError({
                    reason: "contact_identity_conflict",
                    message: `O e-mail responde pelo contato ${resolution.byEmail.id} e o telefone pelo contato ${resolution.byPhone.id}`,
                  }),
                )
              : Effect.succeed(resolution.contact),
          )
        : (yield* contactService.detail(actor, input.contactId).pipe(
            Effect.mapError((e) =>
              e._tag === "Services.Crm.Destination.NotFoundError"
                ? e
                : new CrmOpportunityError({ message: e.message }),
            ),
          )).contact;

    const filed = yield* filing(
      contact.id,
      Effect.gen(function* () {
        if (!input.separateOpportunity) {
          const { open } = yield* openFor(contact.id);

          if (Option.isSome(open)) {
            const placed = Policy.placedOpportunity(open.value.opportunity, open.value.placement);

            if (placed.heldAt !== undefined && !actor.ability.can("read", placed)) {
              yield* record({
                kind: "noted",
                opportunityId: placed.opportunity.id,
                placed,
                actorUserId: undefined,
                payload: { reason: "duplicate", source: input.source },
              });
              return { kind: "already_handled" as const };
            }

            const merged = yield* notes
              .save(
                yield* Note.onOpportunity({
                  opportunityId: placed.opportunity.id,
                  body: duplicateNoteBody(input),
                  authorId: actor.principal.id,
                }).pipe(failed),
              )
              .pipe(failed);
            yield* record({
              kind: "noted",
              opportunityId: placed.opportunity.id,
              placed,
              actorUserId: actor.principal.id,
              payload: { reason: "duplicate", source: input.source, noteId: merged.id },
            });
            return { kind: "deduplicated" as const, placed, open: open.value };
          }
        }

        const opportunity = yield* opportunities
          .save(
            yield* Opportunity.make({
              contactId: contact.id,
              segment: input.segment,
              source: input.source,
              ...(input.landingPageSlug === undefined
                ? {}
                : { landingPageSlug: input.landingPageSlug }),
              createdBy: actor.principal.id,
            }).pipe(failed),
          )
          .pipe(failed);

        yield* record({
          kind: "created",
          opportunityId: opportunity.id,
          placed: undefined,
          actorUserId: actor.principal.id,
          payload: { source: opportunity.source, separateOpportunity: input.separateOpportunity },
        });
        return { kind: "created" as const, opportunity };
      }),
    );

    if (filed.kind === "already_handled") return { outcome: "already_handled" as const };

    /**
     * Inline, and unable to fail the creation: somebody is looking at the form
     * and expects to be told which store took it. The webhook cannot afford the
     * same call — see `ingest`.
     */
    const routing = (
      opportunityId: CrmOpportunityId.Id,
      fallback: Opportunity.Placement.Any | undefined,
    ) =>
      distribution.distribute(opportunityId).pipe(
        Effect.map((outcome) => outcome.placement),
        Effect.catchCause((cause) =>
          Effect.as(
            Effect.logWarning("crm distribution: a manual opportunity was not routed", cause),
            fallback,
          ),
        ),
      );

    if (filed.kind === "deduplicated") {
      const { placed, open } = filed;
      const routed =
        placed.heldAt === undefined
          ? yield* routing(placed.opportunity.id, placed.placement)
          : placed.placement;
      return {
        outcome: "deduplicated" as const,
        opportunity: summaryOf(
          { placed: Policy.placedOpportunity(placed.opportunity, routed), contact },
          open.distributions,
          open.quotations,
        ),
      };
    }

    const routed = yield* routing(filed.opportunity.id, undefined);

    return {
      outcome: "created" as const,
      opportunity: summaryOf(
        { placed: Policy.placedOpportunity(filed.opportunity, routed), contact },
        [],
        [],
      ),
    };
  });

  /**
   * The webhook path, and the one the whole entity was built for: the same
   * person converting again months later reuses their contact and opens a
   * second opportunity behind the closed first one.
   *
   * Nothing here refuses. A lead that cannot be filed is a lead that is lost,
   * so an identity split records the third, flagged contact and carries on —
   * the opposite of what `create` does, because there is nobody standing here
   * to answer the question.
   */
  const ingest: ICrmOpportunityService["ingest"] = Effect.fn("ingest")(function* (intake) {
    const draft = intakeDraftOf(intake);
    const resolution = yield* resolveContact(draft);
    const contact =
      resolution.outcome === "conflict"
        ? yield* contactService
            .recordConflict(draft, resolution)
            .pipe(Effect.mapError((e) => new CrmOpportunityError({ message: e.message })))
        : resolution.contact;

    const filed = yield* filing(
      contact.id,
      Effect.gen(function* () {
        const { held, open } = yield* openFor(contact.id);
        const now = yield* DateTime.now;
        /** Anything at all under this contact means the person has been here before. */
        const returning = held.length > 0;

        if (Option.isSome(open)) {
          const opportunity = yield* opportunities
            .save(new Opportunity.Opportunity({ ...open.value.opportunity, updatedAt: now }))
            .pipe(failed);
          const placed = Policy.placedOpportunity(opportunity, open.value.placement);

          yield* record({
            kind: "reconverted",
            opportunityId: opportunity.id,
            placed,
            actorUserId: undefined,
            payload: { source: intake.source, landingPageSlug: intake.landingPageSlug ?? null },
          });
          return { kind: "updated" as const, placed, open: open.value };
        }

        const opportunity = yield* opportunities
          .save(
            yield* Opportunity.make({
              contactId: contact.id,
              segment: intake.segment,
              source: intake.source,
              ...(intake.landingPageSlug === undefined
                ? {}
                : { landingPageSlug: intake.landingPageSlug }),
            }).pipe(failed),
          )
          .pipe(failed);

        yield* record({
          kind: "created",
          opportunityId: opportunity.id,
          placed: undefined,
          actorUserId: undefined,
          payload: { source: opportunity.source },
        });

        /**
         * Recorded on the new opportunity, which is what links it to the closed
         * ones behind it: before contacts there was no relation at all between a
         * conversion and the opportunity the same person had lost last quarter.
         */
        if (returning) {
          yield* record({
            kind: "reconverted",
            opportunityId: opportunity.id,
            placed: undefined,
            actorUserId: undefined,
            payload: { source: intake.source, previousOpportunities: held.length },
          });
        }
        return { kind: "created" as const, opportunity };
      }),
    );

    if (filed.kind === "updated") {
      const { placed, open } = filed;
      /**
       * A reconversion only reaches the engine when nobody holds the lead yet:
       * the person came back, and the first attempt may well have been an
       * `unrouted` that a new rule now answers. Re-running it on a lead a store
       * is already working would move it out from under them.
       */
      if (placed.heldAt === undefined) yield* routeInBackground(placed.opportunity.id);

      return {
        outcome: "updated" as const,
        opportunity: summaryOf({ placed, contact }, open.distributions, open.quotations),
      };
    }

    yield* routeInBackground(filed.opportunity.id);

    return {
      outcome: "created" as const,
      opportunity: summaryOf(
        { placed: Policy.placedOpportunity(filed.opportunity, undefined), contact },
        [],
        [],
      ),
    };
  });

  const update: ICrmOpportunityService["update"] = Effect.fn("update")(function* (actor, id, input) {
    const contacted = yield* requireOpportunity(id);
    yield* requireCan(actor.ability, "update", contacted.placed);
    const now = yield* DateTime.now;
    const opportunity = yield* opportunities
      .save(
        new Opportunity.Opportunity({
          ...contacted.placed.opportunity,
          segment: input.segment ?? contacted.placed.opportunity.segment,
          updatedAt: now,
        }),
      )
      .pipe(failed);
    return summaryOf(
      { placed: Policy.placedOpportunity(opportunity, contacted.placed.placement), contact: contacted.contact },
      yield* attemptsOf(opportunity.id),
      yield* quotationsOf(opportunity.id),
    );
  });

  const remove: ICrmOpportunityService["remove"] = Effect.fn("remove")(function* (actor, id) {
    const contacted = yield* requireOpportunity(id);
    yield* requireCan(actor.ability, "delete", contacted.placed);
    const held = yield* quotationsOf(contacted.placed.opportunity.id);
    const tried = yield* attemptsOf(contacted.placed.opportunity.id);
    yield* opportunities.remove(contacted.placed.opportunity).pipe(failed);
    return summaryOf(contacted, tried, held);
  });

  const addNote: ICrmOpportunityService["addNote"] = Effect.fn("addNote")(function* (actor, id, body) {
    const contacted = yield* requireOpportunity(id);
    yield* requireCan(actor.ability, "note", contacted.placed);
    const opportunityId = contacted.placed.opportunity.id;
    const note = yield* notes
      .save(
        yield* Note.onOpportunity({ opportunityId, body, authorId: actor.principal.id }).pipe(failed),
      )
      .pipe(failed);
    yield* record({
      kind: "noted",
      opportunityId,
      placed: contacted.placed,
      actorUserId: actor.principal.id,
      payload: { noteId: note.id },
    });
    return yield* detailOf(contacted);
  });

  /**
   * The write behind the attachment button, and the mirror of `addNote`.
   *
   * Three things are settled here rather than trusted from the request. The
   * ability is asked before anything is written, under the same `note` verb —
   * attaching to an opportunity is writing to its history, and a caller who
   * may not write a note may not write a file either. The author is read off
   * the actor. And the bytes are checked against the media type they claim:
   * `hasValidContent` reads the file's magic bytes, so a payload declaring
   * `image/png` and carrying something else is refused rather than stored.
   *
   * The metadata row is committed before the bytes, because the content table
   * points at it — the same order `ticket_entry_file_contents` documents.
   */
  const attachFile: ICrmOpportunityService["attachFile"] = Effect.fn("attachFile")(function* (
    actor,
    id,
    input,
  ) {
    const contacted = yield* requireOpportunity(id);
    yield* requireCan(actor.ability, "note", contacted.placed);

    if (!PrimitiveFile.hasValidContent(input.content)) {
      return yield* Effect.fail(
        new CrmConflictError({
          reason: "content_mismatch",
          message: "O conteúdo do arquivo não corresponde ao tipo informado",
        }),
      );
    }

    const held = yield* files.forOpportunity(contacted.placed.opportunity.id).pipe(failed);
    if (held.length >= MAX_OPPORTUNITY_FILES) {
      return yield* Effect.fail(
        new CrmConflictError({
          reason: "attachment_limit_reached",
          message: `Esta oportunidade já tem ${MAX_OPPORTUNITY_FILES} arquivos. Remova algum antes de anexar outro.`,
        }),
      );
    }

    const opportunityId = contacted.placed.opportunity.id;
    const file = yield* files
      .save(
        yield* OpportunityFile.make({
          opportunityId,
          filename: input.filename,
          content: input.content,
          authorId: actor.principal.id,
        }).pipe(failed),
      )
      .pipe(failed);
    yield* contents.save(file.id, input.content.data).pipe(failed);

    return yield* detailOf(contacted);
  });

    const fileContent: ICrmOpportunityService["fileContent"] = Effect.fn("fileContent")(function* (
    actor,
    id,
    fileId,
  ) {
    const contacted = yield* requireOpportunity(id);
    yield* requireCan(actor.ability, "read", contacted.placed);

    const found = yield* files.findById(fileId).pipe(failed);
    const file = Option.getOrUndefined(found);
    if (file === undefined || file.opportunityId !== contacted.placed.opportunity.id) {
      return yield* Effect.fail(
        new CrmNotFoundError({
          reason: "opportunity_not_found",
          message: `No crm opportunity file ${fileId}`,
        }),
      );
    }

    const foundContent = yield* contents.findByFileId(file.id).pipe(failed);
    const data = Option.getOrUndefined(foundContent);
    if (data === undefined) {
      return yield* Effect.fail(
        new CrmNotFoundError({
          reason: "opportunity_not_found",
          message: `No content stored for crm opportunity file ${file.id}`,
        }),
      );
    }

    return { file, data };
  });

  const detachFile: ICrmOpportunityService["detachFile"] = Effect.fn("detachFile")(function* (
    actor,
    id,
    fileId,
  ) {
    const contacted = yield* requireOpportunity(id);
    yield* requireCan(actor.ability, "note", contacted.placed);

    const found = yield* files.findById(fileId).pipe(failed);
    const file = Option.getOrUndefined(found);
    if (file === undefined || file.opportunityId !== contacted.placed.opportunity.id) {
      return yield* Effect.fail(
        new CrmNotFoundError({
          reason: "opportunity_not_found",
          message: `No crm opportunity file ${fileId}`,
        }),
      );
    }

    // Bytes first: a metadata row without them shows a broken download, while
    // bytes without a row are unreachable and nothing would ever collect them.
    yield* contents.remove(file.id).pipe(failed);
    yield* files.remove(file).pipe(failed);

    return yield* detailOf(contacted);
  });

  return CrmOpportunityService.of({
    list,
    sellerTally,
    detail,
    create,
    ingest,
    update,
    remove,
    addNote,
    attachFile,
    fileContent,
    detachFile,
    board,
    column,
    moveStage,
  });
});

export const layer = Layer.effect(CrmOpportunityService)(make);
