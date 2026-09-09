import { Schema } from "effect";
import { Multipart } from "effect/unstable/http";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import * as Contact from "../Contact";
import { CrmOpportunityFileId, CrmOpportunityId } from "../ids";
import * as Opportunity from "../Opportunity";
import * as OpportunityEvent from "../OpportunityEvent";
import * as OpportunityFile from "../OpportunityFile";
import * as OpportunityNote from "../OpportunityNote";
import { ApplicationError, Contracts, File, ForbiddenError } from "../primitives";
import { CrmConflictError, CrmNotFoundError } from "./Errors";

export const OpportunityCard = Schema.Struct({
  opportunity: Opportunity.Opportunity,
  contact: Contact.Contact,
});
export type OpportunityCard = Schema.Schema.Type<typeof OpportunityCard>;

export const OpportunityTimelineEntry = Schema.Union([
  Schema.Struct({
    kind: Schema.tag("note"),
    at: Schema.DateTimeUtc,
    note: OpportunityNote.OpportunityNote,
  }),
  Schema.Struct({
    kind: Schema.tag("event"),
    at: Schema.DateTimeUtc,
    event: OpportunityEvent.OpportunityEvent,
  }),
  Schema.Struct({
    kind: Schema.tag("file"),
    at: Schema.DateTimeUtc,
    file: OpportunityFile.OpportunityFile,
  }),
]).pipe(Schema.toTaggedUnion("kind"));
export type OpportunityTimelineEntry = Schema.Schema.Type<typeof OpportunityTimelineEntry>;

export const OpportunityDetail = Schema.Struct({
  opportunity: Opportunity.Opportunity,
  contact: Contact.Contact,
  timeline: Schema.Array(OpportunityTimelineEntry),
});
export type OpportunityDetail = Schema.Schema.Type<typeof OpportunityDetail>;

export const GetOpportunityBoard = {
  ...Contracts.response(Schema.Array(OpportunityCard), [ApplicationError, ForbiddenError]),
};

export const GetOpportunity = {
  input: { id: CrmOpportunityId.Id },
  ...Contracts.response(OpportunityDetail, [ApplicationError, ForbiddenError, CrmNotFoundError]),
};

export const SetOpportunityStage = {
  input: { id: CrmOpportunityId.Id },
  payload: Schema.Struct({ stage: Opportunity.Stage }),
  ...Contracts.response(OpportunityDetail, [ApplicationError, ForbiddenError, CrmNotFoundError]),
};

export const AddOpportunityNote = {
  input: { id: CrmOpportunityId.Id },
  payload: Schema.Struct({ body: Schema.NonEmptyString }),
  ...Contracts.response(OpportunityDetail, [ApplicationError, ForbiddenError, CrmNotFoundError]),
};

export const UploadOpportunityFileInput = Schema.Struct({
  file: Multipart.SingleFileSchema,
}).pipe(
  HttpApiSchema.asMultipart({
    maxParts: 1,
    maxFileSize: File.MAX_SIZE_BYTES,
    maxTotalSize: File.MAX_SIZE_BYTES,
  }),
);

const OpportunityFileParams = { id: CrmOpportunityId.Id, fileId: CrmOpportunityFileId.Id };

export const AttachOpportunityFile = {
  input: { id: CrmOpportunityId.Id },
  payload: UploadOpportunityFileInput,
  ...Contracts.response(OpportunityDetail, [
    ApplicationError,
    ForbiddenError,
    CrmNotFoundError,
    CrmConflictError,
  ]),
};

export const OpportunityFileContent = {
  input: OpportunityFileParams,
  success: Schema.Uint8Array.pipe(
    HttpApiSchema.asUint8Array({ contentType: "application/octet-stream" }),
  ),
  error: [ApplicationError, ForbiddenError, CrmNotFoundError] as const,
};

export const DetachOpportunityFile = {
  input: OpportunityFileParams,
  ...Contracts.response(OpportunityDetail, [ApplicationError, ForbiddenError, CrmNotFoundError]),
};

export const OpportunityApiGroup = HttpApiGroup.make("crmOpportunities")
  .add(
    HttpApiEndpoint.get("board", "/board", {
      success: GetOpportunityBoard.success,
      error: GetOpportunityBoard.error,
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
    HttpApiEndpoint.post("setStage", "/:id/stage", {
      params: SetOpportunityStage.input,
      payload: SetOpportunityStage.payload,
      success: SetOpportunityStage.success,
      error: SetOpportunityStage.error,
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
    HttpApiEndpoint.delete("detachFile", "/:id/files/:fileId", {
      params: DetachOpportunityFile.input,
      success: DetachOpportunityFile.success,
      error: DetachOpportunityFile.error,
    }),
  )
  .prefix("/crm/opportunities");
