import { Schema } from "effect";

export class ApplicationError extends Schema.Error<ApplicationError>("ApplicationError")({
  message: Schema.String,
  error: Schema.Unknown.pipe(Schema.optional, Schema.optionalKey),
}) {}

export class ForbiddenError extends Schema.Error<ForbiddenError>("ForbiddenError")(
  {
    message: Schema.String,
  },
  { httpApiStatus: 403 },
) {}

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  { message: Schema.String },
) {}
