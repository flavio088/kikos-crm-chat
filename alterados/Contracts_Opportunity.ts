import { Authorization } from "@kikos/core-contracts";
import { Contact, Distribution, Event, Opportunity, OpportunityFile, Note, Quotation } from "@kikos/crm-core";
import { CrmContactId, CrmDestinationId, CrmOpportunityFileId, UserId } from "@kikos/effect-identity";
import { ApplicationError, Contracts, File, ForbiddenError } from "@kikos/primitives";
import { Schema } from "effect";
import { Multipart } from "effect/unstable/http";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { CrmConflictError, CrmNotFoundError } from "../Errors";
import { CrmScoped } from "../Middleware";
import { MonthWindow } from "../Quotation/Quotation";

/**
 * The contact rides along rather than being fetched behind this.
 *
 * Every screen that lists opportunities lists them by the person's name, so a
 * summary without the contact is a summary no table can draw — and resolving
 * twenty of them one request at a time behind a page of twenty rows is the n+1
 * the repository's join already avoids.
 */
export const OpportunitySummary = Schema.Struct({
  opportunity: Opportunity.Opportunity,
  contact: Contact.Contact,
  status: Opportunity.Status.Status,
  stage: Opportunity.Stage.Stage,
  placement: Opportunity.Placement.Any.pipe(Schema.optional, Schema.optionalKey),
});
export type OpportunitySummary = Schema.Schema.Type<typeof OpportunitySummary>;

export const OpportunityTimelineEntry = Schema.Union([
  Schema.Struct({
    kind: Schema.tag("note"),
    at: Schema.DateTimeUtc,
    note: Note.OnOpportunity,
  }),
  Schema.Struct({
    kind: Schema.tag("event"),
    at: Schema.DateTimeUtc,
    event: Event.Event,
  }),
  /**
   * An attachment. It carries the metadata only — filename, media type and
   * size — because that is what the history draws; the bytes are fetched on
   * demand through the content endpoint, which is the whole reason they live
   * in a table of their own.
   */
  Schema.Struct({
    kind: Schema.tag("file"),
    at: Schema.DateTimeUtc,
    file: OpportunityFile.OpportunityFile,
  }),
]).pipe(Schema.toTaggedUnion("kind"));
export type OpportunityTimelineEntry = Schema.Schema.Type<typeof OpportunityTimelineEntry>;

export const OpportunityDetail = Schema.Struct({
  ...OpportunitySummary.fields,
  timeline: Schema.Array(OpportunityTimelineEntry),
  /**
   * Every routing attempt, the failed ones kept. `status` folds them into one
   * word, and one word cannot answer what an opportunity showing "Sem destino"
   * actually raises — not *that* nothing took it but *why*, which is what
   * whoever places it by hand has to know.
   */
  distributions: Schema.Array(Distribution.Attempt.Any),
});
export type OpportunityDetail = Schema.Schema.Type<typeof OpportunityDetail>;

export const OpportunityCard = Schema.Struct({
  ...OpportunitySummary.fields,
  quotation: Quotation.Quotation.pipe(Schema.optional, Schema.optionalKey),
});
export type OpportunityCard = Schema.Schema.Type<typeof OpportunityCard>;

export const OpportunityColumn = Schema.Struct({
  stage: Opportunity.Stage.Stage,
  opportunities: Schema.Array(OpportunityCard),
  total: Schema.Int,
  historic: Schema.Int,
});
export type OpportunityColumn = Schema.Schema.Type<typeof OpportunityColumn>;

export const OpportunityBoard = Schema.Struct({
  destinationId: CrmDestinationId.Id.pipe(Schema.optional, Schema.optionalKey),
  window: MonthWindow,
  columns: Schema.Array(OpportunityColumn),
});
export type OpportunityBoard = Schema.Schema.Type<typeof OpportunityBoard>;

export const GetOpportunityBoardQuery = Schema.Struct({
  destinationId: CrmDestinationId.Id.pipe(Schema.optional, Schema.optionalKey),
});
export type GetOpportunityBoardQuery = Schema.Schema.Type<typeof GetOpportunityBoardQuery>;

export const GetOpportunityColumnQuery = Schema.Struct({
  destinationId: CrmDestinationId.Id.pipe(Schema.optional, Schema.optionalKey),
  stage: Opportunity.Stage.Stage,
  offset: Schema.Int.pipe(Schema.optional, Schema.optionalKey),
  limit: Schema.Int.pipe(Schema.optional, Schema.optionalKey),
});
export type GetOpportunityColumnQuery = Schema.Schema.Type<typeof GetOpportunityColumnQuery>;

export const MoveOpportunityStagePayload = Schema.Struct({
  stage: Opportunity.Stage.Target,
});
export type MoveOpportunityStagePayload = Schema.Schema.Type<typeof MoveOpportunityStagePayload>;

export const OpportunityCreation = Schema.Union([
  Schema.Struct({ outcome: Schema.tag("created"), opportunity: OpportunitySummary }),
  Schema.Struct({ outcome: Schema.tag("deduplicated"), opportunity: OpportunitySummary }),
  Schema.Struct({ outcome: Schema.tag("already_handled") }),
]).pipe(Schema.toTaggedUnion("outcome"));
export type OpportunityCreation = Schema.Schema.Type<typeof OpportunityCreation>;

export const GetOpportunitiesQuery = Schema.Struct({
  segment: Opportunity.Segment.Segment.pipe(Schema.optional, Schema.optionalKey),
  source: Opportunity.Source.Source.pipe(Schema.optional, Schema.optionalKey),
  search: Schema.String.pipe(Schema.optional, Schema.optionalKey),
  /**
   * The derived status, and the filter that answers "quais ninguém está
   * atendendo". Without it the `unrouted` ones are a badge somebody has to
   * find by scrolling a listing of four hundred — which is the failure the
   * distribution engine exists to end, coming back through the front door.
   */
  stage: Opportunity.Stage.Stage.pipe(Schema.optional, Schema.optionalKey),
  status: Opportunity.Status.Status.pipe(Schema.optional, Schema.optionalKey),
  /**
   * One store, in the shape the quotation board already asks for it. Omitted,
   * the page stays what it was: everything the caller reaches. Named, it is a
   * request to read that store, and a caller who cannot reach it gets a 403
   * rather than an empty page.
   */
  destinationId: CrmDestinationId.Id.pipe(Schema.optional, Schema.optionalKey),
  page: Schema.Int.pipe(Schema.optional, Schema.optionalKey),
  limit: Schema.Int.pipe(Schema.optional, Schema.optionalKey),
});
export type GetOpportunitiesQuery = Schema.Schema.Type<typeof GetOpportunitiesQuery>;

/**
 * `userId` is absent, not null, when the row is the store's unclaimed pile: the
 * placement makes the store mandatory and the seller optional, so work can sit
 * at a store with nobody holding it. It travels as its own row rather than
 * being dropped, the same way an unplaced opportunity travels with no
 * placement instead of a fake one.
 *
 * A named `userId` is whoever holds the work now, and that is not the same as
 * the store's roster: leaving a store does not move the placements the person
 * was holding, so someone who is gone from the roster keeps a row here until
 * the work is placed again. These rows are the ones to draw. Drawing a row per
 * roster member and reading its number from here silently drops that person's
 * opportunities out of the rows while `total` keeps counting them.
 */
export const OpportunitySellerCount = Schema.Struct({
  userId: UserId.Id.pipe(Schema.optional, Schema.optionalKey),
  total: Schema.Int,
});
export type OpportunitySellerCount = Schema.Schema.Type<typeof OpportunitySellerCount>;

/**
 * Counted over each opportunity's latest placement, and closed on purpose:
 * `sellers` and `reclaimed` partition `total`, because a latest placement is
 * an assignment or a reclaim and there is no third kind. The screen can print
 * the rows, the reclaims and the total and have them agree, without deriving
 * anything from the listing.
 *
 * `reclaimed` is the work the store took back. It belongs to the store and to
 * no seller, so it was never in `sellers` — and it was always in the store's
 * total, which is why the rows appeared to come up short. It is a number of
 * its own now instead of an omission the reader had to know about.
 *
 * `total` is under the same store and the same filters as the request, so it
 * is the listing's total for the same query rather than a wider number sitting
 * next to a narrower one.
 */
export const OpportunitySellerTally = Schema.Struct({
  destinationId: CrmDestinationId.Id,
  sellers: Schema.Array(OpportunitySellerCount),
  reclaimed: Schema.Int,
  total: Schema.Int,
});
export type OpportunitySellerTally = Schema.Schema.Type<typeof OpportunitySellerTally>;

/**
 * The same three narrowings the listing takes, and taken for the reason they
 * have to be: a counter shown beside a filtered page has to count that page.
 * Left to answer for the whole store, it puts a store-wide total beside rows
 * the manager just filtered down, and the mismatch reads as a broken screen
 * rather than as two different questions. Omitted, they mean here what they
 * mean there — no narrowing, the whole store.
 *
 * `destinationId` stays required: counting is counting one store, and which
 * store is never inferred.
 */
export const GetOpportunitySellerTallyQuery = Schema.Struct({
  destinationId: CrmDestinationId.Id,
  segment: Opportunity.Segment.Segment.pipe(Schema.optional, Schema.optionalKey),
  source: Opportunity.Source.Source.pipe(Schema.optional, Schema.optionalKey),
  search: Schema.String.pipe(Schema.optional, Schema.optionalKey),
  /** Carried so the counters keep describing exactly the page beside them. */
  status: Opportunity.Status.Status.pipe(Schema.optional, Schema.optionalKey),
  stage: Opportunity.Stage.Stage.pipe(Schema.optional, Schema.optionalKey),
});
export type GetOpportunitySellerTallyQuery = Schema.Schema.Type<typeof GetOpportunitySellerTallyQuery>;

export const CreateOpportunityPayload = Schema.Struct({
  name: Schema.NonEmptyString,
  company: Schema.NonEmptyString.pipe(Schema.optional, Schema.optionalKey),
  email: Schema.NonEmptyString.pipe(Schema.optional, Schema.optionalKey),
  phone: Schema.NonEmptyString.pipe(Schema.optional, Schema.optionalKey),
  contactRole: Schema.NonEmptyString.pipe(Schema.optional, Schema.optionalKey),
  segment: Opportunity.Segment.Segment,
  source: Opportunity.Source.Source,
  uf: Schema.NonEmptyString.pipe(Schema.optional, Schema.optionalKey),
  ddd: Schema.NonEmptyString.pipe(Schema.optional, Schema.optionalKey),
  landingPageSlug: Schema.NonEmptyString.pipe(Schema.optional, Schema.optionalKey),
  /**
   * Names the person outright — "another opportunity for this contact",
   * straight from their screen — so identity is not resolved from the fields
   * above. The flat fields stay for the manual form, which is where a person
   * is described rather than pointed at.
   */
  contactId: CrmContactId.Id.pipe(Schema.optional, Schema.optionalKey),
  /**
   * Open a second opportunity even though this contact already has one open.
   *
   * It used to mean "skip the duplicate check", which also meant writing the
   * person down a second time. The contact is resolved either way now, and
   * only the reuse is waived — which is what whoever ticks it is asking for.
   */
  separateOpportunity: Schema.Boolean.pipe(Schema.optional, Schema.optionalKey),
});
export type CreateOpportunityPayload = Schema.Schema.Type<typeof CreateOpportunityPayload>;

/**
 * What is left of editing an opportunity once the person moved out. Name,
 * company, e-mail, phone and role describe the contact, and are corrected
 * through `PATCH /crm/contacts/:id` — where the screen can also say that the
 * correction reaches every opportunity that contact holds.
 */
export const UpdateOpportunityPayload = Schema.Struct({
  segment: Opportunity.Segment.Segment.pipe(Schema.optional, Schema.optionalKey),
});
export type UpdateOpportunityPayload = Schema.Schema.Type<typeof UpdateOpportunityPayload>;

export const GetOpportunities = {
  input: GetOpportunitiesQuery,
  ...Contracts.paginatedResponse(Schema.Array(OpportunitySummary), [
    ApplicationError,
    ForbiddenError,
  ]),
};

/**
 * No `CrmNotFoundError`: the store is either reachable, and answered, or out
 * of reach, and refused. There is no third answer to give.
 */
export const GetOpportunitySellerTally = {
  input: GetOpportunitySellerTallyQuery,
  ...Contracts.response(OpportunitySellerTally, [ApplicationError, ForbiddenError]),
};

export const GetOpportunityBoard = {
  input: GetOpportunityBoardQuery,
  ...Contracts.response(OpportunityBoard, [ApplicationError, ForbiddenError]),
};

export const GetOpportunityColumn = {
  input: GetOpportunityColumnQuery,
  ...Contracts.response(OpportunityColumn, [ApplicationError, ForbiddenError]),
};

export const MoveOpportunityStage = {
  input: { id: Opportunity.Id },
  payload: MoveOpportunityStagePayload,
  ...Contracts.response(OpportunitySummary, [
    ApplicationError,
    ForbiddenError,
    CrmNotFoundError,
    CrmConflictError,
  ]),
};

export const GetOpportunity = {
  input: { id: Opportunity.Id },
  ...Contracts.response(OpportunityDetail, [ApplicationError, ForbiddenError, CrmNotFoundError]),
};

export const CreateOpportunity = {
  payload: CreateOpportunityPayload,
  ...Contracts.response(OpportunityCreation, [
    ApplicationError,
    ForbiddenError,
    CrmNotFoundError,
    CrmConflictError,
  ]),
};

export const UpdateOpportunity = {
  input: { id: Opportunity.Id },
  payload: UpdateOpportunityPayload,
  ...Contracts.response(OpportunitySummary, [ApplicationError, ForbiddenError, CrmNotFoundError]),
};

export const DeleteOpportunity = {
  input: { id: Opportunity.Id },
  ...Contracts.response(OpportunitySummary, [ApplicationError, ForbiddenError, CrmNotFoundError]),
};

/**
 * Runs the engine again over an opportunity, with the store currently holding
 * it excluded — otherwise the rotation hands it straight back: the cursor moved
 * on when it was placed, and by the time it comes round that store is simply
 * next.
 */
export const DistributeOpportunity = {
  input: { id: Opportunity.Id },
  ...Contracts.response(OpportunityDetail, [
    ApplicationError,
    ForbiddenError,
    CrmNotFoundError,
    CrmConflictError,
  ]),
};

/**
 * The human override, and what answers a lead nothing could route.
 *
 * `userId` is optional because a store may take work with nobody holding it —
 * the same shape a placement has when the rodizio is empty. When it is named,
 * the person has to be on that store's roster: the column points at `users`,
 * not at a membership, so "Fulano at Salvador" is otherwise representable for a
 * Fulano who never worked there, and nothing downstream would notice.
 */
export const PlaceOpportunity = {
  input: { id: Opportunity.Id },
  payload: Schema.Struct({
    destinationId: CrmDestinationId.Id,
    userId: UserId.Id.pipe(Schema.optional, Schema.optionalKey),
  }),
  ...Contracts.response(OpportunityDetail, [
    ApplicationError,
    ForbiddenError,
    CrmNotFoundError,
    CrmConflictError,
  ]),
};

/**
 * The upload payload, shaped like the ticket one: a single part, capped at the
 * shared `File.MAX_SIZE_BYTES` on both the part and the request, so an
 * oversized body is refused at the boundary rather than read into memory first.
 *
 * The media type the client declares is narrowed by the schema, and then the
 * bytes themselves are checked against it in the service — a declaration is
 * not evidence.
 */
export const UploadOpportunityFileInput = Schema.Struct({
  file: Multipart.SingleFileSchema,
}).pipe(
  HttpApiSchema.asMultipart({
    maxParts: 1,
    maxFileSize: File.MAX_SIZE_BYTES,
    maxTotalSize: File.MAX_SIZE_BYTES,
  }),
);

/**
 * Both the opportunity and the file are named. The opportunity is not
 * redundant: it is what the handler checks the file against, so a file id
 * belonging to somebody else's opportunity is answered as not found rather
 * than served.
 */
const OpportunityFileScopedParams = Schema.Struct({
  id: Opportunity.Id,
  fileId: CrmOpportunityFileId.Id,
});

export const AttachOpportunityFile = {
  input: { id: Opportunity.Id },
  payload: UploadOpportunityFileInput,
  ...Contracts.response(OpportunityDetail, [ApplicationError, ForbiddenError, CrmNotFoundError, CrmConflictError]),
};

export const OpportunityFileContent = {
  input: OpportunityFileScopedParams,
  success: Schema.Uint8Array.pipe(
    HttpApiSchema.asUint8Array({ contentType: "application/octet-stream" }),
  ),
  error: [ApplicationError, ForbiddenError, CrmNotFoundError] as const,
};

export const DetachOpportunityFile = {
  input: OpportunityFileScopedParams,
  ...Contracts.response(OpportunityDetail, [ApplicationError, ForbiddenError, CrmNotFoundError]),
};

export const AddOpportunityNote = {
  input: { id: Opportunity.Id },
  payload: Schema.Struct({ body: Schema.NonEmptyString }),
  ...Contracts.response(OpportunityDetail, [ApplicationError, ForbiddenError, CrmNotFoundError]),
};

export const OpportunityApiGroup = HttpApiGroup.make("crmOpportunities")
  .add(
    HttpApiEndpoint.get("all", "/", {
      query: GetOpportunities.input,
      success: GetOpportunities.success,
      error: GetOpportunities.error,
    }),
  )
    .add(
    HttpApiEndpoint.delete("detachFile", "/:id/files/:fileId", {
      params: DetachOpportunityFile.input,
      success: DetachOpportunityFile.success,
      error: DetachOpportunityFile.error,
    }),
  )
  /**
   * Registered ahead of `/:id`, or the literal path would be read as an
   * opportunity id — the same order the quotation board takes for `/board`.
   */
  .add(
    HttpApiEndpoint.get("sellerTally", "/sellers", {
      query: GetOpportunitySellerTally.input,
      success: GetOpportunitySellerTally.success,
      error: GetOpportunitySellerTally.error,
    }),
  )
  .add(
    HttpApiEndpoint.get("board", "/board", {
      query: GetOpportunityBoard.input,
      success: GetOpportunityBoard.success,
      error: GetOpportunityBoard.error,
    }),
  )
  .add(
    HttpApiEndpoint.get("column", "/board/column", {
      query: GetOpportunityColumn.input,
      success: GetOpportunityColumn.success,
      error: GetOpportunityColumn.error,
    }),
  )
  .add(
    HttpApiEndpoint.get("get", "/:id", {
      params: GetOpportunity.input,
      success: GetOpportunity.success,
      error: GetOpportunity.error,
    }),
  )
  .add(
    HttpApiEndpoint.post("create", "/", {
      payload: CreateOpportunity.payload,
      success: CreateOpportunity.success,
      error: CreateOpportunity.error,
    }),
  )
  .add(
    HttpApiEndpoint.patch("update", "/:id", {
      params: UpdateOpportunity.input,
      payload: UpdateOpportunity.payload,
      success: UpdateOpportunity.success,
      error: UpdateOpportunity.error,
    }),
  )
  .add(
    HttpApiEndpoint.patch("stage", "/:id/stage", {
      params: MoveOpportunityStage.input,
      payload: MoveOpportunityStage.payload,
      success: MoveOpportunityStage.success,
      error: MoveOpportunityStage.error,
    }),
  )
  .add(
    HttpApiEndpoint.delete("remove", "/:id", {
      params: DeleteOpportunity.input,
      success: DeleteOpportunity.success,
      error: DeleteOpportunity.error,
    }),
  )
  .add(
    HttpApiEndpoint.post("addNote", "/:id/notes", {
      params: AddOpportunityNote.input,
      payload: AddOpportunityNote.payload,
      success: AddOpportunityNote.success,
      error: AddOpportunityNote.error,
    }),
  )
  .add(
    HttpApiEndpoint.post("attachFile", "/:id/files", {
      params: AttachOpportunityFile.input,
      payload: AttachOpportunityFile.payload,
      success: AttachOpportunityFile.success,
      error: AttachOpportunityFile.error,
    }),
  )
  .add(
    HttpApiEndpoint.get("fileContent", "/:id/files/:fileId/content", {
      params: OpportunityFileContent.input,
      success: OpportunityFileContent.success,
      error: OpportunityFileContent.error,
    }),
  )
  .add(
    HttpApiEndpoint.post("distribute", "/:id/distribute", {
      params: DistributeOpportunity.input,
      success: DistributeOpportunity.success,
      error: DistributeOpportunity.error,
    }),
  )
  .add(
    HttpApiEndpoint.put("placement", "/:id/placement", {
      params: PlaceOpportunity.input,
      payload: PlaceOpportunity.payload,
      success: PlaceOpportunity.success,
      error: PlaceOpportunity.error,
    }),
  )
  .middleware(CrmScoped)
  .middleware(Authorization)
  .prefix("/crm/opportunities");
