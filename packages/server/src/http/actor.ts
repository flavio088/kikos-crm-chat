import { Policy } from "@crm-chat/domain";
import { Context, Effect, Layer } from "effect";
import { ensureSeeded } from "../seed";
import type { CrmActor } from "../services/errors";

export class CurrentActor extends Context.Service<CurrentActor, CrmActor>()(
  "@crm-chat/server/http/CurrentActor",
) {}

export const layerSeededActor = Layer.effect(CurrentActor)(
  Effect.gen(function* () {
    const { user } = yield* ensureSeeded;
    yield* Effect.log(`Ator fixo: ${user.name} (${user.id})`);
    return CurrentActor.of({
      principal: { id: user.id, name: user.name },
      ability: Policy.allowAll,
    });
  }),
);
