import { Effect, Schema } from "effect";

export type Ability<Action extends string, Subject> = {
  readonly can: (action: Action, subject: Subject) => boolean;
};

export class AbilityError extends Schema.TaggedError<AbilityError>()("AbilityError", {
  message: Schema.String,
}) {}

export const require = <Action extends string, Subject>(
  ability: Ability<Action, Subject>,
  action: Action,
  subject: Subject,
): Effect.Effect<void, AbilityError> =>
  ability.can(action, subject)
    ? Effect.void
    : Effect.fail(new AbilityError({ message: `Ação "${action}" não permitida.` }));
