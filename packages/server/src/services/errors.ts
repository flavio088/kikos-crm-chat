import { Conflict, Missing, type Policy, type UserId } from "@crm-chat/domain";
import { Schema } from "effect";

export class CrmForbiddenError extends Schema.TaggedError<CrmForbiddenError>()(
  "Services.Crm.ForbiddenError",
  { message: Schema.String },
) {}

export class CrmNotFoundError extends Schema.TaggedError<CrmNotFoundError>()(
  "Services.Crm.NotFoundError",
  { message: Schema.String, reason: Missing.Reason },
) {}

export class CrmConflictError extends Schema.TaggedError<CrmConflictError>()(
  "Services.Crm.ConflictError",
  { message: Schema.String, reason: Conflict.Reason },
) {}

export type CrmActor = {
  readonly principal: { readonly id: UserId.Id; readonly name: string };
  readonly ability: Policy.CrmAbility;
};
