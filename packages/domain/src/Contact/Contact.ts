import { Effect, Schema } from "effect";
import { CrmContactId } from "../ids";
import { Timestampable } from "../primitives";

const OptionalNonEmptyString = Schema.NonEmptyString.pipe(Schema.optional, Schema.optionalKey);

export class Contact extends Schema.Class<Contact, { readonly _: unique symbol }>("CrmContact")({
  id: CrmContactId.Id,
  name: Schema.NonEmptyString,
  company: OptionalNonEmptyString,
  email: OptionalNonEmptyString,
  phone: OptionalNonEmptyString,
  ...Timestampable,
}) {}

type ContactInput = Pick<Contact, "name" | "company" | "email" | "phone">;

export const make = (input: ContactInput) =>
  Effect.gen(function* () {
    const id = yield* CrmContactId.makeId;
    return yield* Effect.mapError(
      Contact.makeEffect({ ...input, id }),
      (issue) => new Schema.SchemaError(issue),
    );
  });

export const Id = CrmContactId.Id;
export type Id = CrmContactId.Id;
