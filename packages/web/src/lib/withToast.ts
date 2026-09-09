import { Cause, Effect, Option } from "effect";
import { toast } from "sonner";

type ToastOptions<A, E, Args extends ReadonlyArray<unknown>> = {
  onWaiting: string | ((...args: Args) => string);
  onSuccess: string | ((value: A, ...args: Args) => string);
  onFailure: string | ((error: Option.Option<E>, ...args: Args) => string);
};

export const withToast =
  <A = any, E = any, Args extends ReadonlyArray<unknown> = ReadonlyArray<any>>(
    options: ToastOptions<A, E, Args>,
  ) =>
  <A2 extends A, E2 extends E, R>(
    self: Effect.Effect<A2, E2, R>,
    ...args: Args
  ): Effect.Effect<A2, E2, R> =>
    Effect.suspend(() => {
      const id = toast.loading(
        typeof options.onWaiting === "string" ? options.onWaiting : options.onWaiting(...args),
      );
      return self.pipe(
        Effect.tap((value) =>
          Effect.sync(() => {
            toast.success(
              typeof options.onSuccess === "string"
                ? options.onSuccess
                : options.onSuccess(value, ...args),
              { id },
            );
          }),
        ),
        Effect.tapCause((cause) =>
          Effect.sync(() => {
            toast.error(
              typeof options.onFailure === "string"
                ? options.onFailure
                : options.onFailure(Cause.findErrorOption(cause), ...args),
              { id },
            );
          }),
        ),
      );
    });
