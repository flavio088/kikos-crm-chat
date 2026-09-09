import { Schema } from "effect";
import * as Conflict from "../Conflict";
import * as Missing from "../Missing";

export class CrmConflictError extends Schema.Error<CrmConflictError>("CrmConflictError")(
  {
    message: Schema.String,
    reason: Conflict.Reason,
  },
  { httpApiStatus: 409 },
) {}

export class CrmNotFoundError extends Schema.Error<CrmNotFoundError>("CrmNotFoundError")(
  {
    message: Schema.String,
    reason: Missing.Reason,
  },
  { httpApiStatus: 404 },
) {}
