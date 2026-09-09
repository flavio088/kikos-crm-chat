import { Schema } from "effect";

type Success<T extends Schema.Top> = Schema.Struct<{ data: T }>;

type ErrorSchema = Schema.Top | ReadonlyArray<Schema.Top>;

type Operation<S extends Schema.Top, E extends ErrorSchema> = {
  success: Success<S>;
  error: E;
};

export const success = <T extends Schema.Top>(data: T) => Schema.Struct({ data });

export const response = <S extends Schema.Top, E extends ErrorSchema>(
  successSchema: S,
  error: E,
): Operation<S, E> => ({
  success: success(successSchema),
  error,
});
