import { DateTime, Effect, Schema } from "effect";
import { ulid } from "ulid";
import { makeId as makeIdSchema } from "./Id";

export const Id = makeIdSchema("crm_opportunity");
export type Id = Schema.Schema.Type<typeof Id>;

export const makeId = Effect.gen(function* () {
  const now = yield* DateTime.now;
  return yield* Effect.mapError(
    Id.makeEffect(`crm_opportunity_${ulid(now.epochMilliseconds)}`),
    (issue) => new Schema.SchemaError(issue),
  );
});
