import { Schema, SchemaGetter } from "effect";

const Ulid = Schema.String.check(Schema.isULID());

export const makeId = <const T extends string>(name: T) =>
  Schema.TemplateLiteral([name, "_", Ulid]).pipe(Schema.brand(`${name}_id`));

export const bareId = <const T extends string>(name: T) => {
  const Id = makeId(name);
  const prefix = `${name}_`;
  return Ulid.pipe(
    Schema.decodeTo(Id, {
      decode: SchemaGetter.transform(
        (bare) => `${prefix}${bare}` as Schema.Schema.Type<typeof Id>,
      ),
      encode: SchemaGetter.transform((id) => id.slice(prefix.length)),
    }),
  );
};
