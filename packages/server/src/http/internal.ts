import {
  ApplicationError,
  CrmConflictError as CrmConflictResponse,
  CrmNotFoundError as CrmNotFoundResponse,
  ForbiddenError,
} from "@crm-chat/domain";
import { Effect } from "effect";
import { CrmConflictError, CrmForbiddenError, CrmNotFoundError } from "../services/errors";
import { CurrentActor } from "./actor";

export const currentCrmActor = Effect.gen(function* () {
  return yield* CurrentActor;
});

type Tagged = { readonly _tag: string; readonly message: string };

type Mapped<E> = E extends CrmForbiddenError
  ? ForbiddenError
  : E extends CrmNotFoundError
    ? CrmNotFoundResponse
    : E extends CrmConflictError
      ? CrmConflictResponse
      : ApplicationError;

const scopedError = (error: Tagged) => {
  if (error instanceof CrmForbiddenError) return new ForbiddenError({ message: error.message });
  if (error instanceof CrmNotFoundError)
    return new CrmNotFoundResponse({ message: error.message, reason: error.reason });
  if (error instanceof CrmConflictError)
    return new CrmConflictResponse({ message: error.message, reason: error.reason });
  return new ApplicationError({ message: error.message, error: error._tag });
};

export const mapScopedError = <T, E extends Tagged, R>(
  effect: Effect.Effect<T, E, R>,
): Effect.Effect<T, Mapped<E>, R> =>
  Effect.mapError(effect, (error) => scopedError(error) as Mapped<E>);

export const mapScopedResponse = <T, E extends Tagged, R>(
  effect: Effect.Effect<T, E, R>,
): Effect.Effect<{ readonly data: T }, Mapped<E>, R> =>
  Effect.mapError(
    Effect.map(effect, (data) => ({ data })),
    (error) => scopedError(error) as Mapped<E>,
  );
