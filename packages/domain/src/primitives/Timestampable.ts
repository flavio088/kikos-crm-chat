import { DateTime, Schema } from "effect";

export const Timestamps = Schema.Struct({
  createdAt: Schema.DateTimeUtc.pipe(
    Schema.withConstructorDefault(DateTime.now),
    Schema.withDecodingDefault(DateTime.now),
  ),
  updatedAt: Schema.DateTimeUtc.pipe(
    Schema.withConstructorDefault(DateTime.now),
    Schema.withDecodingDefault(DateTime.now),
  ),
  deletedAt: Schema.DateTimeUtc.pipe(Schema.optional, Schema.optionalKey),
});

export const Timestampable = Timestamps.fields;
