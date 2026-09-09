import { Principal } from "@kikos/core";
import { Policy, Scope } from "@kikos/crm-core";
import {
  CrmConflictError,
  CrmForbiddenError,
  CrmNotFoundError,
  type CrmQuotationFailure,
  type CrmContactFailure,
  type CrmConversationFailure,
  type CrmDestinationFailure,
  type CrmDistributionFailure,
  type CrmOpportunityFailure,
  type CrmOpportunityListFailure,
  type CrmPoolFailure,
  type CrmScopedFailure,
} from "@kikos/crm-services";
import {
  CrmConflictError as CrmConflictResponse,
  CrmNotFoundError as CrmNotFoundResponse,
} from "@kikos/crm-contracts";
import { ApplicationError, ForbiddenError } from "@kikos/primitives";
import { Effect } from "effect";

export const currentCrmActor = Effect.gen(function* () {
  const principal = yield* Principal.CurrentUser;
  const scope = yield* Scope.CurrentCrmScope;
  const ability = yield* Policy.CurrentCrmAbility;
  return { principal, scope, ability };
});

const applicationError = (error: { readonly _tag: string; readonly message: string }) =>
  ApplicationError.make({ message: error.message, error: error._tag });

/**
 * The reason crosses with the message here too: a 404 that only says "not
 * found" leaves the screen guessing which of the three names failed to
 * resolve, which is how admitting somebody into an open store came back as
 * "esta loja não existe mais". The alias keeps the two `CrmNotFoundError`s
 * apart — the failure the service raises, and the response the contract
 * declares.
 */
const scopedError = (
  error:
    | CrmScopedFailure
    | CrmOpportunityFailure
    | CrmQuotationFailure
    | CrmConversationFailure
    | CrmContactFailure
    | CrmDistributionFailure
    | CrmPoolFailure,
) => {
  if (error instanceof CrmForbiddenError) return new ForbiddenError({ message: error.message });
  if (error instanceof CrmNotFoundError)
    return new CrmNotFoundResponse({ message: error.message, reason: error.reason });
  // Creating an opportunity can now collide on identity, so a 409 reaches this
  // mapper too — flattening it into a 500 would lose the reason the screen
  // needs to name the two contacts it could not tell apart.
  if (error instanceof CrmConflictError)
    return new CrmConflictResponse({ message: error.message, reason: error.reason });
  return applicationError(error);
};

/**
 * The reason crosses with the message: dropping it here would put the wire back
 * where it was, with three different refusals arriving in one indistinguishable
 * shape. The alias keeps the two `CrmConflictError`s apart — the failure the
 * service raises, and the response the contract declares.
 */
const writeError = (error: CrmDestinationFailure | CrmQuotationFailure) => scopedError(error);

export type CrmListing<T> = {
  readonly items: ReadonlyArray<T>;
  readonly total: number;
  readonly page: number;
  readonly limit: number;
};

/**
 * A listing that can only fail one way — no scope to refuse, no name that can
 * be missing — so every failure is a 500 and the shape of it is whatever the
 * service raised. Generic in the error because `applicationError` reads nothing
 * but the tag and the message: two services with unrelated error types answer
 * this mapper alike, and neither has to borrow the other's.
 */
export const mapListResponse = <
  T,
  E extends { readonly _tag: string; readonly message: string },
  R,
>(
  effect: Effect.Effect<T, E, R>,
) =>
  Effect.mapError(
    Effect.map(effect, (data) => ({ data })),
    applicationError,
  );

/**
 * The page can be refused now that it can name a store: asking for one the
 * caller cannot reach is a 403, not an empty page, so the mapper answers
 * through `scopedError` rather than flattening everything into a 500.
 */
export const mapPageResponse = <T, R>(
  effect: Effect.Effect<CrmListing<T>, CrmOpportunityListFailure | CrmContactFailure, R>,
) =>
  Effect.mapError(
    Effect.map(effect, (listing) => ({
      data: listing.items,
      page: { total: listing.total, page: listing.page, limit: listing.limit },
    })),
    scopedError,
  );

  export const mapScopedError = <T, R>(
  effect: Effect.Effect<
    T,
    | CrmScopedFailure
    | CrmOpportunityFailure
    | CrmContactFailure
    | CrmConversationFailure
    | CrmDistributionFailure
    | CrmPoolFailure,
    R
  >,
) => Effect.mapError(effect, scopedError);


export const mapScopedResponse = <T, R>(
  effect: Effect.Effect <
    T,
    | CrmScopedFailure
    | CrmOpportunityFailure
    | CrmContactFailure
    | CrmConversationFailure
    | CrmDistributionFailure
    | CrmPoolFailure,
    R
  >,
) =>
  Effect.mapError(
    Effect.map(effect, (data) => ({ data })),
    scopedError,
  );

export const mapWriteResponse = <T, R>(effect: Effect.Effect<T, CrmDestinationFailure, R>) =>
  Effect.mapError(
    Effect.map(effect, (data) => ({ data })),
    writeError,
  );

export const mapQuotationResponse = <T, R>(effect: Effect.Effect<T, CrmQuotationFailure, R>) =>
  Effect.mapError(
    Effect.map(effect, (data) => ({ data })),
    writeError,
  );
