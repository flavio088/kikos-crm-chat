import { fileURLToPath } from "node:url";
import { PgClient } from "@effect/sql-pg";
import { PgliteClient } from "@effect/sql-pglite";
import * as PgliteDrizzle from "drizzle-orm/effect-pglite";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { Config, Context, Effect, Layer, Option, Redacted } from "effect";

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

const makeDrizzle = PgDrizzle.makeWithDefaults();

export type IDatabase = Omit<Effect.Success<typeof makeDrizzle>, "$client">;

export class Database extends Context.Service<Database, IDatabase>()("@crm-chat/server/Database") {}

export const layerPostgres = (url: string) =>
  Layer.effect(Database)(makeDrizzle).pipe(
    Layer.provide(PgClient.layer({ url: Redacted.make(url) })),
  );

export const layerPglite = (dataDir: string) =>
  Layer.effect(Database)(PgliteDrizzle.makeWithDefaults()).pipe(
    Layer.provide(PgliteClient.layer({ dataDir })),
  );

export const migrateToLatest = Effect.gen(function* () {
  const db = yield* Database;
  yield* migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

export const layerFromEnv = Layer.unwrap(
  Effect.gen(function* () {
    const url = yield* Config.string("DATABASE_URL").pipe(Config.option);
    if (Option.isSome(url)) {
      yield* Effect.log(`Database: postgres (${url.value.replace(/\/\/.*@/, "//***@")})`);
      return layerPostgres(url.value);
    }
    yield* Effect.log("Database: pglite (./pgdata)");
    return layerPglite("./pgdata");
  }),
);
