import { assert, describe, it } from "@effect/vitest";
import { Principal } from "@kikos/core";
import { Contact, Destination, Opportunity, Membership, Policy, Pool, Scope } from "@kikos/crm-core";
import {
  CrmDestinationId,
  CrmOpportunityId,
  CrmOpportunityPlacementId,
  CrmPoolId,
  UserId,
} from "@kikos/effect-identity";
import { Database, Tables } from "@kikos/persistance";
import { File as PrimitiveFile } from "@kikos/primitives";
import { DateTime, Effect, Option, Schema } from "effect";
import {
  ContactPersistence,
  CrmConflictError,
  CrmForbiddenError,
  CrmNotFoundError,
  CrmOpportunityService,
  DestinationPersistence,
  DistributionPersistence,
  EventPersistence,
  openOf,
  OpportunityFileContentPersistence,
  OpportunityPersistence,
  MembershipPersistence,
  NotePersistence,
  Persistance,
  PlacementPersistence,
  PoolPersistence,
} from "../src";
import type { OpportunityCreation, OpportunityDetail, OpportunitySummary } from "../src";
import { contactIdOf, insertContact, insertUser, ServicesTest, userIdOf } from "./internal";

const destinationAt = Effect.fn("destinationAt")(function* (
  poolId: CrmPoolId.Id,
  slug: string,
  index: number,
) {
  const destinations = yield* DestinationPersistence.Repository;
  return yield* destinations.save(
    yield* Destination.make({
      poolId,
      name: slug,
      slug,
      position: Destination.FIRST_POSITION + index * Destination.POSITION_GAP,
    }),
  );
});

const memberAt = Effect.fn("memberAt")(function* (
  destinationId: CrmDestinationId.Id,
  userId: UserId.Id,
  role: Membership.Role.Role,
) {
  const memberships = yield* MembershipPersistence.Repository;
  return yield* memberships.save(
    yield* Membership.make({
      destinationId,
      userId,
      role,
      position: Destination.FIRST_POSITION,
    }),
  );
});

type OpportunityFields = {
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
  readonly daysAgo?: number;
};

/**
 * Stages the person and one opportunity for them. `contact_id` is NOT NULL, so
 * there is no such thing as work with nobody behind it.
 */
const opportunityAt = Effect.fn("opportunityAt")(function* (fields: OpportunityFields) {
  const contacts = yield* ContactPersistence.Repository;
  const opportunities = yield* OpportunityPersistence.Repository;
  const now = yield* DateTime.now;
  const at = DateTime.subtract(now, { days: fields.daysAgo ?? 0 });

  const contact = yield* contacts.save(
    new Contact.Contact({
      ...(yield* Contact.make({
        name: fields.name,
        ...(fields.email === undefined ? {} : { email: fields.email }),
        ...(fields.phone === undefined ? {} : { phone: fields.phone }),
      })),
      createdAt: at,
      updatedAt: at,
    }),
  );

  const fresh = yield* Opportunity.make({
    contactId: contact.id,
    segment: "construtora",
    source: "manual",
  });
  return yield* opportunities.save(new Opportunity.Opportunity({ ...fresh, createdAt: at, updatedAt: at }));
});

const assignTo = Effect.fn("assignTo")(function* (
  opportunityId: Opportunity.Id,
  destinationId: CrmDestinationId.Id,
  userId: UserId.Id | undefined,
) {
  const placements = yield* PlacementPersistence.Repository;
  const now = yield* DateTime.now;
  return yield* placements.save(
    yield* Opportunity.Placement.assign({
      opportunityId,
      destinationId,
      ...(userId === undefined ? {} : { userId }),
      dueAt: DateTime.add(now, { days: 1 }),
    }),
  );
});

const actorOf = (role: Principal.Principal["role"], userId: UserId.Id, scope: Scope.CrmScope) => {
  const principal = new Principal.Principal({ id: userId, role });
  return { principal, scope, ability: Policy.defineCrmAbilityFor(principal, scope) };
};

const opportunityOf = (creation: OpportunityCreation): OpportunitySummary => {
  if (creation.outcome === "already_handled") {
    throw new Error("This creation carried no opportunity");
  }
  return creation.opportunity;
};

const manualOpportunity = (fields: {
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
  readonly separateOpportunity?: boolean;
}) => ({
  name: fields.name,
  company: undefined,
  email: fields.email,
  phone: fields.phone,
  contactRole: undefined,
  segment: "construtora" as const,
  source: "manual" as const,
  uf: undefined,
  ddd: undefined,
  landingPageSlug: undefined,
  contactId: undefined,
  separateOpportunity: fields.separateOpportunity ?? false,
});

const soloActor = Effect.fn("soloActor")(function* (suffix: string) {
  const userId = yield* insertUser(userIdOf(suffix), "operator");
  return actorOf("admin", userId, Scope.empty(userId));
});

const subsetsOf = <A>(items: ReadonlyArray<A>): Array<Array<A>> =>
  items.reduce<Array<Array<A>>>(
    (acc, item) => [...acc, ...acc.map((subset) => [...subset, item])],
    [[]],
  );

describe("crm opportunity dedupe", () => {
  it.effect("a second contact with the same email lands as a note on the open opportunity", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const notes = yield* NotePersistence.Repository;
      const events = yield* EventPersistence.Repository;
      const opportunities = yield* OpportunityPersistence.Repository;

      const actor = yield* soloActor("EE01");
      const existing = yield* opportunityAt({
        name: "Construtora Alfa",
        email: "compras@alfa.com.br",
        daysAgo: 30,
      });

      const creation = yield* service.create(
        actor,
        manualOpportunity({ name: "Alfa Empreendimentos", email: "compras@alfa.com.br" }),
      );

      assert.strictEqual(creation.outcome, "deduplicated");
      assert.strictEqual(opportunityOf(creation).opportunity.id, existing.id);
      assert.strictEqual((yield* opportunities.all()).length, 1);
      assert.strictEqual((yield* notes.forOpportunity(existing.id)).length, 1);
      assert.deepStrictEqual(
        (yield* events.forOpportunity(existing.id)).map((event) => event.kind),
        ["noted"],
      );
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("the same phone deduplicates even when the email is absent", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const opportunities = yield* OpportunityPersistence.Repository;

      const actor = yield* soloActor("EE02");
      const existing = yield* opportunityAt({ name: "Construtora Beta", phone: "71999990000" });

      const creation = yield* service.create(
        actor,
        manualOpportunity({ name: "Beta Obras", phone: "71999990000" }),
      );

      assert.strictEqual(creation.outcome, "deduplicated");
      assert.strictEqual(opportunityOf(creation).opportunity.id, existing.id);
      assert.strictEqual((yield* opportunities.all()).length, 1);
    }).pipe(Effect.provide(ServicesTest)),
  );

  /**
   * The sixty-day window is gone with the string comparison it guarded: the
   * candidates are this contact's own opportunities, so an old row can no
   * longer swallow an unrelated lead. Age alone therefore decides nothing —
   * an opportunity that is still open still absorbs, however long it has sat
   * there. What opens a second one is the first being closed.
   */
  it.effect("age alone no longer opens a second opportunity — only closing does", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const opportunities = yield* OpportunityPersistence.Repository;

      const actor = yield* soloActor("EE03");
      const existing = yield* opportunityAt({
        name: "Construtora Gama",
        email: "obras@gama.com.br",
        daysAgo: 400,
      });

      const creation = yield* service.create(
        actor,
        manualOpportunity({ name: "Gama Retrofit", email: "obras@gama.com.br" }),
      );

      assert.strictEqual(creation.outcome, "deduplicated");
      assert.strictEqual(opportunityOf(creation).opportunity.id, existing.id);
      assert.strictEqual((yield* opportunities.all()).length, 1);
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("two contacts with neither email nor phone stay apart", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const opportunities = yield* OpportunityPersistence.Repository;

      const actor = yield* soloActor("EE04");
      yield* opportunityAt({ name: "Visitante" });

      const creation = yield* service.create(actor, manualOpportunity({ name: "Outro visitante" }));

      assert.strictEqual(creation.outcome, "created");
      assert.strictEqual((yield* opportunities.all()).length, 2);
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("a separate opportunity is created even against an open twin", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const opportunities = yield* OpportunityPersistence.Repository;
      const notes = yield* NotePersistence.Repository;

      const actor = yield* soloActor("EE05");
      const existing = yield* opportunityAt({
        name: "Construtora Delta",
        email: "compras@delta.com.br",
        daysAgo: 3,
      });

      const creation = yield* service.create(
        actor,
        manualOpportunity({
          name: "Delta — segundo empreendimento",
          email: "compras@delta.com.br",
          separateOpportunity: true,
        }),
      );

      assert.strictEqual(creation.outcome, "created");
      assert.notStrictEqual(opportunityOf(creation).opportunity.id, existing.id);
      assert.strictEqual((yield* opportunities.all()).length, 2);
      assert.strictEqual((yield* notes.forOpportunity(existing.id)).length, 0);
    }).pipe(Effect.provide(ServicesTest)),
  );

  /**
   * Reuse is about the funnel, not about identity: whose opportunity it is was
   * settled before this ran. Only an open one absorbs a fresh conversion — a
   * won or lost twin means the person came back, which is a new opportunity.
   */
  it.effect("only an open opportunity absorbs a fresh conversion", () =>
    Effect.gen(function* () {
      const opportunity = yield* Opportunity.make({
        contactId: contactIdOf("AM01"),
        segment: "construtora",
        source: "manual",
      });
      const candidate = { opportunity, stage: "new" as const, placements: [], distributions: [] };

      assert.isTrue(Option.isSome(openOf([{ ...candidate, quotations: [] }])));
      assert.isTrue(Option.isNone(openOf([{ ...candidate, stage: "lost" as const, quotations: [] }])));
      assert.isTrue(Option.isNone(openOf([{ ...candidate, quotations: [{ kind: "won" as const }] }])));
      assert.isTrue(Option.isNone(openOf([{ ...candidate, quotations: [{ kind: "lost" as const }] }])));
      assert.isTrue(Option.isSome(openOf([{ ...candidate, quotations: [{ kind: "open" as const }] }])));
    }),
  );

});

const twoStores = Effect.fn("twoStores")(function* (suffix: string) {
  const pools = yield* PoolPersistence.Repository;
  const pool = yield* pools.save(yield* Pool.make({ slug: "stores", name: "Rede de lojas" }));
  const salvador = yield* destinationAt(pool.id, "salvador", 0);
  const floripa = yield* destinationAt(pool.id, "floripa", 1);

  const outsider = yield* insertUser(userIdOf(`${suffix}1`), "outsider");
  const holder = yield* insertUser(userIdOf(`${suffix}2`), "holder");
  yield* memberAt(salvador.id, outsider, "seller");
  yield* memberAt(floripa.id, holder, "manager");

  const held = yield* opportunityAt({
    name: "Construtora Ômega",
    email: "compras@omega.com.br",
    phone: "71977776666",
    daysAgo: 5,
  });
  yield* assignTo(held.id, floripa.id, holder);

  return {
    held,
    fromSalvador: actorOf(
      "employee",
      outsider,
      new Scope.CrmScope({ userId: outsider, managed: [], selling: [salvador.id] }),
    ),
    fromFloripa: actorOf(
      "employee",
      holder,
      new Scope.CrmScope({ userId: holder, managed: [floripa.id], selling: [] }),
    ),
  };
});

describe("crm opportunity dedupe across stores", () => {
  it.effect("a seller of another store is told nothing but the contact being handled", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const opportunities = yield* OpportunityPersistence.Repository;
      const notes = yield* NotePersistence.Repository;
      const events = yield* EventPersistence.Repository;

      const { held, fromSalvador } = yield* twoStores("HH0");

      const creation = yield* service.create(
        fromSalvador,
        manualOpportunity({ name: "Ômega Engenharia", email: "compras@omega.com.br" }),
      );

      assert.deepStrictEqual(creation, { outcome: "already_handled" });
      assert.strictEqual((yield* opportunities.all()).length, 1);
      assert.strictEqual((yield* notes.forOpportunity(held.id)).length, 0);

      const logged = yield* events.forOpportunity(held.id);
      assert.deepStrictEqual(
        logged.map((event) => event.kind),
        ["noted"],
      );
      assert.isUndefined(logged[0]?.actorUserId);
      assert.strictEqual(JSON.stringify(logged[0]?.payload).includes("Ômega Engenharia"), false);
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("the phone matching alone blocks the same way the email does", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const opportunities = yield* OpportunityPersistence.Repository;

      const { fromSalvador } = yield* twoStores("HH1");

      const creation = yield* service.create(
        fromSalvador,
        manualOpportunity({ name: "Ômega Obras", phone: "71977776666" }),
      );

      assert.deepStrictEqual(creation, { outcome: "already_handled" });
      assert.strictEqual((yield* opportunities.all()).length, 1);
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("the store that holds the opportunity still sees it whole", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const notes = yield* NotePersistence.Repository;
      const events = yield* EventPersistence.Repository;

      const { held, fromFloripa } = yield* twoStores("HH2");

      const creation = yield* service.create(
        fromFloripa,
        manualOpportunity({ name: "Ômega Engenharia", email: "compras@omega.com.br" }),
      );

      assert.strictEqual(creation.outcome, "deduplicated");
      assert.strictEqual(opportunityOf(creation).opportunity.id, held.id);
      assert.strictEqual(opportunityOf(creation).contact.email, "compras@omega.com.br");
      assert.strictEqual(opportunityOf(creation).status, "assigned");

      const written = yield* notes.forOpportunity(held.id);
      assert.strictEqual(written.length, 1);
      assert.strictEqual(written[0]?.authorId, fromFloripa.principal.id);

      const logged = yield* events.forOpportunity(held.id);
      assert.strictEqual(logged[0]?.actorUserId, fromFloripa.principal.id);
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("a separate opportunity is created even from another store", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const opportunities = yield* OpportunityPersistence.Repository;

      const { held, fromSalvador } = yield* twoStores("HH3");

      const creation = yield* service.create(
        fromSalvador,
        manualOpportunity({
          name: "Ômega — segundo empreendimento",
          email: "compras@omega.com.br",
          separateOpportunity: true,
        }),
      );

      assert.strictEqual(creation.outcome, "created");
      assert.notStrictEqual(opportunityOf(creation).opportunity.id, held.id);
      assert.strictEqual((yield* opportunities.all()).length, 2);
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("naming a contact out of reach is refused, never served", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const opportunities = yield* OpportunityPersistence.Repository;
      const { held, fromSalvador } = yield* twoStores("HH4");

      const refused = yield* Effect.flip(
        service.create(fromSalvador, {
          ...manualOpportunity({ name: "Ômega", separateOpportunity: true }),
          contactId: held.contactId,
        }),
      );
      assert.instanceOf(refused, CrmNotFoundError);
      assert.strictEqual((yield* opportunities.all()).length, 1);

      const admin = yield* soloActor("HH5");
      const created = yield* service.create(admin, {
        ...manualOpportunity({ name: "Ômega", separateOpportunity: true }),
        contactId: held.contactId,
      });
      assert.strictEqual(created.outcome, "created");
      assert.strictEqual(opportunityOf(created).contact.id, held.contactId);
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("a lead nobody holds is not somebody else's to hide behind", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const pools = yield* PoolPersistence.Repository;
      const notes = yield* NotePersistence.Repository;
      const attempts = yield* DistributionPersistence.Repository;

      const orphan = yield* opportunityAt({ name: "Sigma", email: "compras@sigma.com.br" });
      const pool = yield* pools.save(yield* Pool.make({ slug: "stores", name: "Rede" }));
      const store = yield* destinationAt(pool.id, "campinas", 0);
      const sellerId = yield* insertUser(userIdOf("HH6"), "seller");
      yield* memberAt(store.id, sellerId, "seller");
      const seller = actorOf(
        "employee",
        sellerId,
        Scope.fromStandings(sellerId, [{ destinationId: store.id, role: "seller" }]),
      );

      const creation = yield* service.create(
        seller,
        manualOpportunity({ name: "Sigma", email: "compras@sigma.com.br" }),
      );

      assert.strictEqual(creation.outcome, "deduplicated");
      assert.strictEqual(opportunityOf(creation).opportunity.id, orphan.id);
      assert.strictEqual((yield* notes.forOpportunity(orphan.id)).length, 1);
      assert.strictEqual((yield* attempts.forOpportunity(orphan.id)).length, 1);
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("the numbers of the draw are shown to the admin and the gestor, and to nobody else", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const pools = yield* PoolPersistence.Repository;
      const segments = yield* Persistance.DestinationSegmentPersistence.Repository;
      const locators = yield* Persistance.LocatorPersistence.Repository;

      const pool = yield* pools.save(yield* Pool.make({ slug: "stores", name: "Rede" }));
      const store = yield* destinationAt(pool.id, "campinas", 0);
      yield* segments.setFor(store.id, ["construtora"]);
      yield* locators.save(
        yield* Destination.Locator.make({ destinationId: store.id, kind: "uf", uf: "SP" }),
      );
      const sellerId = yield* insertUser(userIdOf("HH7"), "seller");
      yield* memberAt(store.id, sellerId, "seller");
      const gestorId = yield* insertUser(userIdOf("HH8"), "gestor");
      yield* memberAt(store.id, gestorId, "manager");

      const admin = yield* soloActor("HH9");
      const created = yield* service.create(admin, {
        ...manualOpportunity({ name: "Tau", email: "compras@tau.com.br" }),
        uf: "SP",
      });
      const id = opportunityOf(created).opportunity.id;
      assert.strictEqual(opportunityOf(created).placement?.destinationId, store.id);

      const traceOf = (actor: ReturnType<typeof actorOf>) =>
        Effect.map(
          service.detail(actor, id),
          (detail) => detail.distributions[0]?.trace as Record<string, unknown>,
        );

      const seller = actorOf(
        "employee",
        sellerId,
        Scope.fromStandings(sellerId, [{ destinationId: store.id, role: "seller" }]),
      );
      const gestor = actorOf(
        "employee",
        gestorId,
        new Scope.CrmScope({ userId: gestorId, managed: [store.id], selling: [] }),
      );

      assert.isDefined((yield* traceOf(admin)).weighed);
      assert.isDefined((yield* traceOf(gestor)).weighed);
      const shown = yield* traceOf(seller);
      assert.isUndefined(shown.weighed);
      assert.isUndefined(shown.considered);
      assert.isDefined(shown.matched);
    }).pipe(Effect.provide(ServicesTest)),
  );
});

describe("crm opportunity listing", () => {
  it.effect("the query-side filter agrees with the ability on every scope", () =>
    Effect.gen(function* () {
      const pools = yield* PoolPersistence.Repository;
      const opportunities = yield* OpportunityPersistence.Repository;
      const service = yield* CrmOpportunityService;

      const pool = yield* pools.save(yield* Pool.make({ slug: "stores", name: "Rede de lojas" }));
      const salvador = yield* destinationAt(pool.id, "salvador", 0);
      const floripa = yield* destinationAt(pool.id, "floripa", 1);
      const natal = yield* destinationAt(pool.id, "natal", 2);

      const seller = yield* insertUser(userIdOf("FF01"), "seller");
      const placed = yield* Effect.forEach(
        [salvador, floripa, natal],
        (destination, index) =>
          Effect.gen(function* () {
            const opportunity = yield* opportunityAt({
              name: `opportunity ${destination.slug}`,
              email: `opportunity${index}@kikos.test`,
            });
            yield* assignTo(opportunity.id, destination.id, seller);
            return opportunity;
          }),
      );
      yield* opportunityAt({ name: "opportunity sem colocação", email: "unplaced@kikos.test" });

      const everything = yield* opportunities.all();
      assert.strictEqual(everything.length, placed.length + 1);

      const userId = userIdOf("FF02");
      yield* Effect.forEach(subsetsOf([salvador.id, floripa.id, natal.id]), (subset) =>
        Effect.gen(function* () {
          const scope = new Scope.CrmScope({
            userId,
            managed: subset.filter((_, index) => index % 2 === 0),
            selling: subset.filter((_, index) => index % 2 === 1),
          });
          const actor = actorOf("employee", userId, scope);

          const listed = yield* service.list(actor, {
            segment: undefined,
            source: undefined,
            search: undefined,
            status: undefined,
            stage: undefined,
            destinationId: undefined,
            page: undefined,
            limit: undefined,
          });
          const filtered = everything.filter((contacted) =>
            actor.ability.can("read", contacted.placed),
          );

          assert.deepStrictEqual(
            listed.items.map((summary) => summary.opportunity.id),
            filtered.map((contacted) => contacted.placed.opportunity.id),
          );
          assert.strictEqual(listed.total, filtered.length);
        }),
      );

      const admin = actorOf("admin", userId, Scope.empty(userId));
      const asAdmin = yield* service.list(admin, {
        segment: undefined,
        source: undefined,
        search: undefined,
        status: undefined,
        stage: undefined,
        destinationId: undefined,
        page: undefined,
        limit: undefined,
      });
      assert.deepStrictEqual(
        asAdmin.items.map((summary) => summary.opportunity.id),
        everything.map((contacted) => contacted.placed.opportunity.id),
      );
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("the segment filter and the search narrow the scoped page", () =>
    Effect.gen(function* () {
      const pools = yield* PoolPersistence.Repository;
      const service = yield* CrmOpportunityService;

      const pool = yield* pools.save(yield* Pool.make({ slug: "stores", name: "Rede de lojas" }));
      const salvador = yield* destinationAt(pool.id, "salvador", 0);
      const boss = yield* insertUser(userIdOf("FF03"), "boss");
      yield* memberAt(salvador.id, boss, "manager");

      const alfa = yield* opportunityAt({ name: "Construtora Alfa", email: "alfa@kikos.test" });
      const beta = yield* opportunityAt({ name: "Condomínio Beta", email: "beta@kikos.test" });
      yield* assignTo(alfa.id, salvador.id, undefined);
      yield* assignTo(beta.id, salvador.id, undefined);

      const scope = new Scope.CrmScope({ userId: boss, managed: [salvador.id], selling: [] });
      const actor = actorOf("employee", boss, scope);

      const searched = yield* service.list(actor, {
        segment: undefined,
        source: undefined,
        search: "beta",
        status: undefined,
        stage: undefined,
        destinationId: undefined,
        page: undefined,
        limit: undefined,
      });
      assert.deepStrictEqual(
        searched.items.map((summary) => summary.opportunity.id),
        [beta.id],
      );

      const sourced = yield* service.list(actor, {
        segment: "construtora",
        source: "rd_station",
        search: undefined,
        status: undefined,
        stage: undefined,
        destinationId: undefined,
        page: undefined,
        limit: undefined,
      });
      assert.deepStrictEqual(sourced.items, []);
      assert.strictEqual(sourced.total, 0);

      const paged = yield* service.list(actor, {
        segment: undefined,
        source: undefined,
        search: undefined,
        status: undefined,
        stage: undefined,
        destinationId: undefined,
        page: 2,
        limit: 1,
      });
      assert.strictEqual(paged.items.length, 1);
      assert.strictEqual(paged.total, 2);
      assert.strictEqual(paged.page, 2);
      assert.strictEqual(paged.limit, 1);
    }).pipe(Effect.provide(ServicesTest)),
  );
});

describe("crm opportunity administration", () => {
  it.effect("a seller may not delete the opportunity it works", () =>
    Effect.gen(function* () {
      const pools = yield* PoolPersistence.Repository;
      const opportunities = yield* OpportunityPersistence.Repository;
      const service = yield* CrmOpportunityService;

      const pool = yield* pools.save(yield* Pool.make({ slug: "stores", name: "Rede de lojas" }));
      const salvador = yield* destinationAt(pool.id, "salvador", 0);

      const seller = yield* insertUser(userIdOf("GG01"), "seller");
      const boss = yield* insertUser(userIdOf("GG02"), "boss");
      yield* memberAt(salvador.id, seller, "seller");
      yield* memberAt(salvador.id, boss, "manager");

      const opportunity = yield* opportunityAt({ name: "Construtora Épsilon", email: "eps@kikos.test" });
      yield* assignTo(opportunity.id, salvador.id, seller);

      const asSeller = actorOf(
        "employee",
        seller,
        new Scope.CrmScope({ userId: seller, managed: [], selling: [salvador.id] }),
      );
      const refused = yield* service.remove(asSeller, opportunity.id).pipe(Effect.flip);
      assert.instanceOf(refused, CrmForbiddenError);
      assert.strictEqual((yield* opportunities.all()).length, 1);

      // Editing an opportunity is editing what was asked for; who to call is
      // corrected through the contact, which every opportunity of theirs shares.
      const updated = yield* service.update(asSeller, opportunity.id, { segment: "academia" });
      assert.strictEqual(updated.opportunity.segment, "academia");

      const asBoss = actorOf(
        "employee",
        boss,
        new Scope.CrmScope({ userId: boss, managed: [salvador.id], selling: [] }),
      );
      yield* service.remove(asBoss, opportunity.id);
      assert.deepStrictEqual(yield* opportunities.all(), []);
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("a note joins the timeline and leaves the derived status alone", () =>
    Effect.gen(function* () {
      const pools = yield* PoolPersistence.Repository;
      const service = yield* CrmOpportunityService;

      const pool = yield* pools.save(yield* Pool.make({ slug: "stores", name: "Rede de lojas" }));
      const salvador = yield* destinationAt(pool.id, "salvador", 0);

      const seller = yield* insertUser(userIdOf("GG03"), "seller");
      yield* memberAt(salvador.id, seller, "seller");

      const opportunity = yield* opportunityAt({ name: "Construtora Zeta", email: "zeta@kikos.test" });
      yield* assignTo(opportunity.id, salvador.id, seller);

      const actor = actorOf(
        "employee",
        seller,
        new Scope.CrmScope({ userId: seller, managed: [], selling: [salvador.id] }),
      );

      const before = yield* service.detail(actor, opportunity.id);
      assert.strictEqual(before.status, "assigned");

      const after = yield* service.addNote(actor, opportunity.id, "cliente pediu retorno na segunda");

      assert.strictEqual(after.status, before.status);
      assert.strictEqual(
        after.timeline.filter((entry) => entry.kind === "note").length,
        before.timeline.filter((entry) => entry.kind === "note").length + 1,
      );
      assert.isTrue(
        after.timeline.some(
          (entry) => entry.kind === "note" && entry.note.body === "cliente pediu retorno na segunda",
        ),
      );
      assert.deepStrictEqual(
        [...after.timeline].map((entry) => DateTime.toEpochMillis(entry.at)),
        [...after.timeline]
          .map((entry) => DateTime.toEpochMillis(entry.at))
          .sort((a, b) => a - b),
      );
    }).pipe(Effect.provide(ServicesTest)),
  );
});

/**
 * The eight magic bytes a png opens with. `hasValidContent` reads them, so a
 * test that wants an attachment to be accepted has to carry them — an array of
 * zeroes declaring `image/png` is exactly what the mismatch branch refuses.
 */
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

const pngNamed = (filename: string) => ({
  filename,
  content: { mediaType: "image/png", data: PNG_BYTES } as const satisfies PrimitiveFile.File,
});

const filesIn = (detail: OpportunityDetail) =>
  detail.timeline.flatMap((entry) => (entry.kind === "file" ? [entry.file] : []));

describe("crm opportunity files", () => {
  it.effect("an attachment lands in the timeline with its bytes beside it", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const contents = yield* OpportunityFileContentPersistence.Repository;

      const actor = yield* soloActor("KK01");
      const opportunity = yield* opportunityAt({ name: "Construtora Ipê", email: "ipe@kikos.test" });

      const detail = yield* service.attachFile(
        actor,
        opportunity.id,
        pngNamed("planta-baixa.png"),
      );

      const [file, ...rest] = filesIn(detail);
      assert.deepStrictEqual(rest, []);
      assert.strictEqual(file?.filename, "planta-baixa.png");
      assert.strictEqual(file?.opportunityId, opportunity.id);
      // Both read off the content that arrived rather than taken from the
      // caller — the whole reason `attachFile` takes a decoded file and not a
      // media type and a size.
      assert.strictEqual(file?.mediaType, "image/png");
      assert.strictEqual(file?.sizeBytes, PNG_BYTES.byteLength);
      assert.strictEqual(file?.authorId, actor.principal.id);

      const stored = yield* contents.findByFileId(file!.id);
      assert.deepStrictEqual(Option.getOrUndefined(stored), PNG_BYTES);
    }).pipe(Effect.provide(ServicesTest)),
  );

  /**
   * The declared type is the one thing about an upload that the schema cannot
   * settle on its own: `image/png` and `application/pdf` are both in the
   * accepted set, so a payload lying about which one it is decodes cleanly and
   * only the magic bytes catch it. The refusal is before either write, so the
   * assertion is not just the error — it is that the history is untouched.
   */
  it.effect("content that does not match the declared media type is refused", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;

      const actor = yield* soloActor("KK02");
      const opportunity = yield* opportunityAt({ name: "Construtora Cedro", email: "cedro@kikos.test" });

      const refused = yield* service
        .attachFile(actor, opportunity.id, {
          filename: "contrato.pdf",
          content: { mediaType: "application/pdf", data: PNG_BYTES },
        })
        .pipe(Effect.flip);

      assert.instanceOf(refused, CrmConflictError);
      assert.strictEqual((refused as CrmConflictError).reason, "content_mismatch");
      assert.deepStrictEqual(filesIn(yield* service.detail(actor, opportunity.id)), []);
    }).pipe(Effect.provide(ServicesTest)),
  );

  /**
   * Read through the seller the opportunity is placed with rather than an
   * admin. `fileContent` asks the ability under `read`, and an admin passes
   * that verb on everything — so an admin here would still go green with the
   * check taken out. The seller is the one whose permission is actually being
   * asserted, and the one who downloads attachments in production.
   */
  it.effect("the bytes come back to the seller the opportunity is placed with", () =>
    Effect.gen(function* () {
      const pools = yield* PoolPersistence.Repository;
      const service = yield* CrmOpportunityService;

      const pool = yield* pools.save(yield* Pool.make({ slug: "stores", name: "Rede de lojas" }));
      const salvador = yield* destinationAt(pool.id, "salvador", 0);
      const sellerId = yield* insertUser(userIdOf("KK03"), "seller");
      yield* memberAt(salvador.id, sellerId, "seller");

      const opportunity = yield* opportunityAt({
        name: "Construtora Jatobá",
        email: "jatoba@kikos.test",
      });
      yield* assignTo(opportunity.id, salvador.id, sellerId);

      const actor = actorOf(
        "employee",
        sellerId,
        new Scope.CrmScope({ userId: sellerId, managed: [], selling: [salvador.id] }),
      );

      const detail = yield* service.attachFile(actor, opportunity.id, pngNamed("medidas.png"));
      const attached = filesIn(detail)[0]!;

      const got = yield* service.fileContent(actor, opportunity.id, attached.id);

      assert.strictEqual(got.file.id, attached.id);
      assert.strictEqual(got.file.filename, "medidas.png");
      assert.deepStrictEqual(got.data, PNG_BYTES);
    }).pipe(Effect.provide(ServicesTest)),
  );

  /**
   * The IDOR guard. `fileContent` authorizes the *opportunity* in the path and
   * then loads the file by id, so without the ownership comparison a caller
   * cleared for one opportunity could name any file id in the system and get
   * its bytes — the id is the only thing standing between them and it.
   *
   * The actor is an admin on purpose, and it is the whole point of the test.
   * Admin passes `read` on both opportunities, so the refusal cannot be the
   * ability firing: it can only be `file.opportunityId` disagreeing with the
   * opportunity that was authorized. A scoped seller here would prove nothing,
   * because the scope alone would have stopped them at the second opportunity.
   *
   * Both branches that can refuse here raise `CrmNotFoundError` with reason
   * `opportunity_not_found` — the ownership comparison and `requireOpportunity`
   * behind it — so the error alone does not say which one fired. Two things
   * pin it down. The `detail` call proves the second opportunity exists and is
   * readable, and the message carries the *file* id rather than the
   * opportunity id, which only the ownership branch writes.
   *
   * The last two assertions are the control. The same file id fetched against
   * the opportunity it belongs to succeeds, so the refusal above is about the
   * pairing and not about an id that was never good for anything.
   */
  it.effect("a file id from another opportunity is refused, not served", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;

      const actor = yield* soloActor("KK04");
      const mine = yield* opportunityAt({ name: "Construtora Aroeira", email: "aroeira@kikos.test" });
      const theirs = yield* opportunityAt({ name: "Construtora Peroba", email: "peroba@kikos.test" });

      const detail = yield* service.attachFile(actor, mine.id, pngNamed("orcamento.png"));
      const attached = filesIn(detail)[0]!;

      // Not staging: the assertion that the refusal below is the ownership
      // check and not this actor being unable to reach `theirs` at all.
      assert.strictEqual((yield* service.detail(actor, theirs.id)).opportunity.id, theirs.id);

      const refused = yield* service
        .fileContent(actor, theirs.id, attached.id)
        .pipe(Effect.flip);

      assert.instanceOf(refused, CrmNotFoundError);
      assert.strictEqual((refused as CrmNotFoundError).reason, "opportunity_not_found");
      assert.include(refused.message, attached.id);

      const served = yield* service.fileContent(actor, mine.id, attached.id);
      assert.deepStrictEqual(served.data, PNG_BYTES);
    }).pipe(Effect.provide(ServicesTest)),
  );
});

/**
 * The row is written straight to the table instead of through the repository.
 * The opportunity domain is mid-split and the class no longer carries `name`,
 * `segment` or `source`, so `save` leaves those columns empty and the insert is
 * rejected by a table that still declares them NOT NULL. What is under test
 * here is the read side, and this keeps it off a write being rebuilt on another
 * front — the moment the split lands, `opportunityAt` above serves just as well.
 */
const opportunityRowAt = Effect.fn("opportunityRowAt")(function* (
  name: string,
  secondsAgo: number,
  segment: Opportunity.Segment.Segment = "construtora",
) {
  const db = yield* Database.Database;
  const id = yield* CrmOpportunityId.makeId;
  const at = DateTime.formatIso(DateTime.subtract(yield* DateTime.now, { seconds: secondsAgo }));
  const contact = yield* insertContact({ id: contactIdOf(nextContactSuffix()), name });
  yield* db.insert(Tables.crmOpportunities).values({
    id,
    contactId: contact.id,
    segment,
    source: "manual",
    stagedAt: at,
    createdAt: at,
    updatedAt: at,
  });
  return id;
});

/**
 * Crockford base32 has no I, L, O or U, so a suffix cannot be derived from a
 * name — a counter keeps the ids valid and the runs repeatable.
 */
let contactSuffix = 0;
const nextContactSuffix = () => `X${String(++contactSuffix).padStart(3, "0")}`;

const softDeleted = Effect.fn("softDeleted")(function* (opportunityId: Opportunity.Id) {
  const opportunities = yield* OpportunityPersistence.Repository;
  const found = yield* opportunities.findById(opportunityId);
  if (Option.isSome(found)) yield* opportunities.remove(found.value.placed.opportunity);
});

const listingFor = (destinationId: CrmDestinationId.Id | undefined) => ({
  segment: undefined,
  source: undefined,
  search: undefined,
  status: undefined,
  stage: undefined,
  destinationId,
  page: undefined,
  limit: undefined,
});

const tallyFor = (destinationId: CrmDestinationId.Id) => ({
  destinationId,
  segment: undefined,
  source: undefined,
  search: undefined,
  status: undefined,
  stage: undefined,
});

const storesFor = Effect.fn("storesFor")(function* () {
  const pools = yield* PoolPersistence.Repository;
  const pool = yield* pools.save(yield* Pool.make({ slug: "stores", name: "Rede de lojas" }));
  return {
    salvador: yield* destinationAt(pool.id, "salvador", 0),
    floripa: yield* destinationAt(pool.id, "floripa", 1),
  };
});

/**
 * `assignTo` above stamps `placedAt` from the clock, which is fine while an
 * opportunity has one placement and useless the moment it has two: the latest
 * of two placements written in the same tick is a coin toss. These two pin the
 * instant instead, so "the most recent placement" means something the test can
 * actually assert.
 */
const assignedAt = Effect.fn("assignedAt")(function* (
  opportunityId: Opportunity.Id,
  destinationId: CrmDestinationId.Id,
  userId: UserId.Id | undefined,
  secondsAgo: number,
) {
  const placements = yield* PlacementPersistence.Repository;
  const now = yield* DateTime.now;
  const placed = yield* Opportunity.Placement.assign({
    opportunityId,
    destinationId,
    ...(userId === undefined ? {} : { userId }),
    dueAt: DateTime.add(now, { days: 1 }),
  });
  return yield* placements.save(
    new Opportunity.Placement.Assigned({
      ...placed,
      placedAt: DateTime.subtract(now, { seconds: secondsAgo }),
    }),
  );
});

const reclaimedAt = Effect.fn("reclaimedAt")(function* (
  opportunityId: Opportunity.Id,
  destinationId: CrmDestinationId.Id,
  userId: UserId.Id | undefined,
  secondsAgo: number,
) {
  const placements = yield* PlacementPersistence.Repository;
  const now = yield* DateTime.now;
  const placed = yield* Opportunity.Placement.reclaim({
    opportunityId,
    destinationId,
    ...(userId === undefined ? {} : { userId }),
    after: now,
    reason: "prazo de primeiro contato expirado",
  });
  return yield* placements.save(
    new Opportunity.Placement.Reclaimed({
      ...placed,
      placedAt: DateTime.subtract(now, { seconds: secondsAgo }),
    }),
  );
});

const decodePlacementId = Schema.decodeUnknownSync(CrmOpportunityPlacementId.Id);

const placementIdOf = (suffix: string): CrmOpportunityPlacementId.Id =>
  decodePlacementId(`crm_opportunity_placement_01TEST${"0".repeat(20 - suffix.length)}${suffix}`);

/**
 * The exact collision the tie-break exists for, built rather than waited for.
 * `assignedAt` and `reclaimedAt` each read the clock on their own, so two of
 * them land near each other and the tie almost never actually happens — which
 * is precisely why the bug it causes is so easy to miss.
 *
 * Both placements are written on one instant and their ids are pinned, because
 * the id is what both implementations settle the tie on and neither derives it
 * from the write order: a `crm_opportunity_placement` id comes from the plain
 * ULID factory, whose tail is random inside a millisecond. Pinning is how the
 * test says which id is the greater one instead of leaving it to that coin
 * toss. The reclaim carries it, so "the latest placement" has exactly one right
 * answer here — and the answer decides whether the opportunity is counted for
 * the seller at all, not merely for which seller.
 *
 * They are written the other way round, reclaim first, so that no
 * implementation can reach that answer by keeping the order it was handed.
 */
const tiedAt = Effect.fn("tiedAt")(function* (
  opportunityId: Opportunity.Id,
  destinationId: CrmDestinationId.Id,
  userId: UserId.Id,
  secondsAgo: number,
  suffix: string,
) {
  const placements = yield* PlacementPersistence.Repository;
  const now = yield* DateTime.now;
  const placedAt = DateTime.subtract(now, { seconds: secondsAgo });
  const assigned = yield* Opportunity.Placement.assign({
    opportunityId,
    destinationId,
    userId,
    dueAt: DateTime.add(now, { days: 1 }),
  });
  const reclaimed = yield* Opportunity.Placement.reclaim({
    opportunityId,
    destinationId,
    userId,
    after: assigned.placedAt,
    reason: "prazo de primeiro contato expirado",
  });
  const latest = yield* placements.save(
    new Opportunity.Placement.Reclaimed({ ...reclaimed, id: placementIdOf(`${suffix}2`), placedAt }),
  );
  yield* placements.save(
    new Opportunity.Placement.Assigned({ ...assigned, id: placementIdOf(`${suffix}1`), placedAt }),
  );
  return latest;
});

const managerOf = Effect.fn("managerOf")(function* (
  suffix: string,
  destinationId: CrmDestinationId.Id,
) {
  const boss = yield* insertUser(userIdOf(suffix), "boss");
  yield* memberAt(destinationId, boss, "manager");
  return actorOf(
    "employee",
    boss,
    new Scope.CrmScope({ userId: boss, managed: [destinationId], selling: [] }),
  );
});

describe("crm opportunity listing by store", () => {
  it.effect("naming a store answers with that store's opportunities and nothing else", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const { salvador, floripa } = yield* storesFor();

      const boss = yield* insertUser(userIdOf("FF10"), "boss");
      yield* memberAt(salvador.id, boss, "manager");

      const here = yield* opportunityRowAt("Construtora Salvador", 2);
      const there = yield* opportunityRowAt("Construtora Floripa", 1);
      yield* assignTo(here, salvador.id, undefined);
      yield* assignTo(there, floripa.id, undefined);

      const actor = actorOf(
        "employee",
        boss,
        new Scope.CrmScope({ userId: boss, managed: [salvador.id, floripa.id], selling: [] }),
      );

      const everywhere = yield* service.list(actor, listingFor(undefined));
      assert.deepStrictEqual(
        [...everywhere.items.map((summary) => summary.opportunity.id)].sort(),
        [here, there].sort(),
      );
      assert.strictEqual(everywhere.total, 2);

      const atSalvador = yield* service.list(actor, listingFor(salvador.id));
      assert.deepStrictEqual(
        atSalvador.items.map((summary) => summary.opportunity.id),
        [here],
      );
      assert.strictEqual(atSalvador.total, 1);
      assert.strictEqual(atSalvador.items[0]?.placement?.destinationId, salvador.id);
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("a store the scope does not name is refused rather than answered empty", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const { salvador, floripa } = yield* storesFor();

      const boss = yield* insertUser(userIdOf("FF11"), "boss");
      yield* memberAt(salvador.id, boss, "manager");

      const there = yield* opportunityRowAt("Construtora Floripa", 1);
      yield* assignTo(there, floripa.id, undefined);

      const actor = actorOf(
        "employee",
        boss,
        new Scope.CrmScope({ userId: boss, managed: [salvador.id], selling: [] }),
      );

      const refused = yield* service.list(actor, listingFor(floripa.id)).pipe(Effect.flip);
      assert.instanceOf(refused, CrmForbiddenError);
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("an admin reads a store no membership of theirs names", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const { salvador, floripa } = yield* storesFor();

      const here = yield* opportunityRowAt("Construtora Salvador", 2);
      const there = yield* opportunityRowAt("Construtora Floripa", 1);
      yield* assignTo(here, salvador.id, undefined);
      yield* assignTo(there, floripa.id, undefined);

      const adminId = yield* insertUser(userIdOf("FF12"), "admin");
      const admin = actorOf("admin", adminId, Scope.empty(adminId));

      const atFloripa = yield* service.list(admin, listingFor(floripa.id));
      assert.deepStrictEqual(
        atFloripa.items.map((summary) => summary.opportunity.id),
        [there],
      );
      assert.strictEqual(atFloripa.total, 1);

      const atSalvador = yield* service.list(admin, listingFor(salvador.id));
      assert.deepStrictEqual(
        atSalvador.items.map((summary) => summary.opportunity.id),
        [here],
      );
    }).pipe(Effect.provide(ServicesTest)),
  );

  /**
   * The state the whole system is in today: nothing writes a placement outside
   * a test, so every opportunity is unplaced and every store answers empty.
   * That is the honest answer, not a gap — an opportunity belongs to a store
   * only once something places it there.
   */
  it.effect("an opportunity nothing ever placed belongs to no store", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const { salvador } = yield* storesFor();

      const placed = yield* opportunityRowAt("Construtora Colocada", 2);
      const loose = yield* opportunityRowAt("Construtora Sem Loja", 1);
      yield* assignTo(placed, salvador.id, undefined);

      const adminId = yield* insertUser(userIdOf("FF13"), "admin");
      const admin = actorOf("admin", adminId, Scope.empty(adminId));

      const everything = yield* service.list(admin, listingFor(undefined));
      assert.deepStrictEqual(
        [...everything.items.map((summary) => summary.opportunity.id)].sort(),
        [placed, loose].sort(),
      );

      const atSalvador = yield* service.list(admin, listingFor(salvador.id));
      assert.deepStrictEqual(
        atSalvador.items.map((summary) => summary.opportunity.id),
        [placed],
      );
      assert.strictEqual(atSalvador.total, 1);
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("the store's opportunities are counted seller by seller, busiest first", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const { salvador, floripa } = yield* storesFor();
      const actor = yield* managerOf("FF14", salvador.id);
      const vera = yield* insertUser(userIdOf("FF15"), "vera");
      const bruno = yield* insertUser(userIdOf("FF16"), "bruno");

      const first = yield* opportunityRowAt("Construtora Um", 4);
      const second = yield* opportunityRowAt("Construtora Dois", 3);
      const third = yield* opportunityRowAt("Construtora Tres", 2);
      const elsewhere = yield* opportunityRowAt("Construtora Floripa", 1);

      yield* assignedAt(first, salvador.id, vera, 40);
      yield* assignedAt(second, salvador.id, vera, 30);
      yield* assignedAt(third, salvador.id, bruno, 20);
      yield* assignedAt(elsewhere, floripa.id, vera, 10);

      const tally = yield* service.sellerTally(actor, tallyFor(salvador.id));

      assert.strictEqual(tally.destinationId, salvador.id);
      assert.deepStrictEqual(
        [...tally.sellers],
        [
          { userId: vera, total: 2 },
          { userId: bruno, total: 1 },
        ],
      );
      assert.strictEqual(tally.reclaimed, 0);
      assert.strictEqual(tally.total, 3);
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("a reassigned opportunity counts once, for whoever holds it now", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const { salvador } = yield* storesFor();
      const actor = yield* managerOf("FF17", salvador.id);
      const vera = yield* insertUser(userIdOf("FF18"), "vera");
      const bruno = yield* insertUser(userIdOf("FF19"), "bruno");

      const opportunity = yield* opportunityRowAt("Construtora Passada Adiante", 2);
      yield* assignedAt(opportunity, salvador.id, vera, 60);
      yield* assignedAt(opportunity, salvador.id, bruno, 30);

      const tally = yield* service.sellerTally(actor, tallyFor(salvador.id));

      assert.deepStrictEqual([...tally.sellers], [{ userId: bruno, total: 1 }]);
      assert.strictEqual(tally.total, 1);
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("an opportunity nothing ever placed counts for no seller", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const { salvador } = yield* storesFor();
      const actor = yield* managerOf("FF20", salvador.id);
      const vera = yield* insertUser(userIdOf("FF21"), "vera");

      const held = yield* opportunityRowAt("Construtora Colocada", 2);
      yield* opportunityRowAt("Construtora Sem Loja", 1);
      yield* assignedAt(held, salvador.id, vera, 30);

      const tally = yield* service.sellerTally(actor, tallyFor(salvador.id));

      assert.deepStrictEqual([...tally.sellers], [{ userId: vera, total: 1 }]);
      assert.strictEqual(tally.total, 1);
    }).pipe(Effect.provide(ServicesTest)),
  );

  it.effect("a store the scope does not name is refused rather than counted", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const { salvador, floripa } = yield* storesFor();
      const actor = yield* managerOf("FF22", salvador.id);
      const vera = yield* insertUser(userIdOf("FF23"), "vera");

      const there = yield* opportunityRowAt("Construtora Floripa", 1);
      yield* assignedAt(there, floripa.id, vera, 30);

      const refused = yield* service.sellerTally(actor, tallyFor(floripa.id)).pipe(Effect.flip);

      assert.instanceOf(refused, CrmForbiddenError);
    }).pipe(Effect.provide(ServicesTest)),
  );

  /**
   * The seller is optional on a placement, so work can land at a store with
   * nobody holding it. It is a row of its own — the pile a manager is meant to
   * act on — and it sorts after a person on a tie so it never reads as one.
   */
  it.effect("work placed at the store under no seller is its own row", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const { salvador } = yield* storesFor();
      const actor = yield* managerOf("FF24", salvador.id);
      const vera = yield* insertUser(userIdOf("FF25"), "vera");

      const hers = yield* opportunityRowAt("Construtora Um", 4);
      const alsoHers = yield* opportunityRowAt("Construtora Dois", 3);
      const loose = yield* opportunityRowAt("Construtora Tres", 2);
      const alsoLoose = yield* opportunityRowAt("Construtora Quatro", 1);

      yield* assignedAt(hers, salvador.id, vera, 40);
      yield* assignedAt(alsoHers, salvador.id, vera, 30);
      yield* assignedAt(loose, salvador.id, undefined, 20);
      yield* assignedAt(alsoLoose, salvador.id, undefined, 10);

      const tally = yield* service.sellerTally(actor, tallyFor(salvador.id));

      assert.deepStrictEqual(
        [...tally.sellers],
        [
          { userId: vera, total: 2 },
          { userId: undefined, total: 2 },
        ],
      );
      assert.strictEqual(tally.total, 4);
    }).pipe(Effect.provide(ServicesTest)),
  );

  /**
   * The counter reads "what each seller is holding", and a reclaim is the store
   * taking work back. Crediting the seller it was pulled from would report the
   * opposite of what happened. The opportunity is still the store's, which is
   * why it is absent from `sellers` and present in `reclaimed` and in `total` —
   * the rows come up short of the total, and the answer says by how much and
   * why instead of leaving the reader to guess.
   */
  it.effect("an opportunity the store reclaimed counts for nobody, and still counts for the store", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const { salvador } = yield* storesFor();
      const actor = yield* managerOf("FF26", salvador.id);
      const vera = yield* insertUser(userIdOf("FF27"), "vera");

      const taken = yield* opportunityRowAt("Construtora Retomada", 2);
      yield* assignedAt(taken, salvador.id, vera, 60);
      yield* reclaimedAt(taken, salvador.id, vera, 30);

      const tally = yield* service.sellerTally(actor, tallyFor(salvador.id));
      assert.deepStrictEqual([...tally.sellers], []);
      assert.strictEqual(tally.reclaimed, 1);
      assert.strictEqual(tally.total, 1);

      const atSalvador = yield* service.list(actor, listingFor(salvador.id));
      assert.strictEqual(atSalvador.total, 1);
      assert.strictEqual(atSalvador.items[0]?.status, "reclaimed");
    }).pipe(Effect.provide(ServicesTest)),
  );

  /**
   * The case the screen is actually read in: people holding work while one
   * lead sits back at the counter. The assertion that matters is the last one
   * — rows plus reclaims equal the total — because that is the sum a manager
   * does by eye, and until the reclaims travelled as a number of their own it
   * was a sum that could not come out.
   */
  it.effect("the seller rows and the reclaims add up to the store's total", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const { salvador } = yield* storesFor();
      const actor = yield* managerOf("FF28", salvador.id);
      const vera = yield* insertUser(userIdOf("FF29"), "vera");
      const bruno = yield* insertUser(userIdOf("FF30"), "bruno");

      const hers = yield* opportunityRowAt("Construtora Um", 5);
      const alsoHers = yield* opportunityRowAt("Construtora Dois", 4);
      const his = yield* opportunityRowAt("Construtora Tres", 3);
      const loose = yield* opportunityRowAt("Construtora Quatro", 2);
      const taken = yield* opportunityRowAt("Construtora Cinco", 1);

      yield* assignedAt(hers, salvador.id, vera, 50);
      yield* assignedAt(alsoHers, salvador.id, vera, 40);
      yield* assignedAt(his, salvador.id, bruno, 30);
      yield* assignedAt(loose, salvador.id, undefined, 20);
      yield* assignedAt(taken, salvador.id, bruno, 60);
      yield* reclaimedAt(taken, salvador.id, bruno, 10);

      const tally = yield* service.sellerTally(actor, tallyFor(salvador.id));

      assert.deepStrictEqual(
        [...tally.sellers],
        [
          { userId: vera, total: 2 },
          { userId: bruno, total: 1 },
          { userId: undefined, total: 1 },
        ],
      );
      assert.strictEqual(tally.reclaimed, 1);
      assert.strictEqual(tally.total, 5);

      const listed = yield* service.list(actor, listingFor(salvador.id));
      assert.strictEqual(listed.total, tally.total);
      assert.strictEqual(
        tally.sellers.reduce((running, row) => running + row.total, 0) + tally.reclaimed,
        tally.total,
      );
    }).pipe(Effect.provide(ServicesTest)),
  );

  /**
   * The frequent case, and the one that made the screen look broken: filter the
   * page by segment and the counters used to keep answering for the whole
   * store, so a total of four sat beside rows summing to far more. Taking the
   * listing's own filters is what makes the two numbers describe one set — and
   * the assertion is exactly that, the tally's total against the page's.
   */
  it.effect("the filters narrow the count the same way they narrow the page", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const { salvador } = yield* storesFor();
      const actor = yield* managerOf("FF31", salvador.id);
      const vera = yield* insertUser(userIdOf("FF32"), "vera");
      const bruno = yield* insertUser(userIdOf("FF33"), "bruno");

      const gym = yield* opportunityRowAt("Academia Um", 4, "academia");
      const site = yield* opportunityRowAt("Construtora Um", 3);
      const alsoSite = yield* opportunityRowAt("Construtora Dois", 2);
      const taken = yield* opportunityRowAt("Construtora Tres", 1);

      yield* assignedAt(gym, salvador.id, vera, 40);
      yield* assignedAt(site, salvador.id, vera, 30);
      yield* assignedAt(alsoSite, salvador.id, bruno, 20);
      yield* assignedAt(taken, salvador.id, bruno, 60);
      yield* reclaimedAt(taken, salvador.id, bruno, 10);

      const whole = yield* service.sellerTally(actor, tallyFor(salvador.id));
      assert.strictEqual(whole.total, 4);
      assert.strictEqual(whole.reclaimed, 1);

      const query = { ...tallyFor(salvador.id), segment: "academia" as const };
      const gyms = yield* service.sellerTally(actor, query);
      assert.deepStrictEqual([...gyms.sellers], [{ userId: vera, total: 1 }]);
      assert.strictEqual(gyms.reclaimed, 0);
      assert.strictEqual(gyms.total, 1);

      const page = yield* service.list(actor, { ...listingFor(salvador.id), segment: "academia" });
      assert.strictEqual(page.total, gyms.total);
    }).pipe(Effect.provide(ServicesTest)),
  );

  /**
   * Two placements on the same instant is not a hypothetical: assigning and
   * reclaiming both stamp `placedAt` from a clock they read for themselves, so
   * one millisecond is enough. Ordering on the instant alone leaves the sql
   * side free to hand back either row, and the two rows here disagree about
   * whether anybody is holding the lead at all.
   *
   * The history read is the same rule the memory repository counts by — it
   * tallies through `Placement.latest` over everything the placement
   * repository returns — so asserting the two together is asserting that the
   * count agrees with it rather than merely agreeing with itself. Both halves
   * here are still sql; the twin further down is where the other
   * implementation answers the same question.
   */
  it.effect("two placements on one instant are settled by the placement id, in sql", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const placements = yield* PlacementPersistence.Repository;
      const { salvador } = yield* storesFor();
      const actor = yield* managerOf("FF34", salvador.id);
      const vera = yield* insertUser(userIdOf("FF35"), "vera");

      const held = yield* opportunityRowAt("Construtora Segura", 3);
      const tied = yield* opportunityRowAt("Construtora Empatada", 2);
      yield* assignedAt(held, salvador.id, vera, 30);
      yield* tiedAt(tied, salvador.id, vera, 30, "AA");

      const history = yield* placements.forOpportunity(tied);
      const latest = Option.getOrUndefined(Opportunity.Placement.latest(history));
      assert.strictEqual(history.length, 2);
      assert.strictEqual(latest?.kind, "reclaimed");

      const tally = yield* service.sellerTally(actor, tallyFor(salvador.id));
      assert.deepStrictEqual([...tally.sellers], [{ userId: vera, total: 1 }]);
      assert.strictEqual(tally.reclaimed, 1);
      assert.strictEqual(tally.total, 2);
    }).pipe(Effect.provide(ServicesTest)),
  );

  /**
   * Equal numbers have to come back in one order or the rows shuffle between
   * reads of the same data. This half asserts the sql answer and no more: a
   * grouped read carries no order of its own — postgres hands back
   * hash-aggregate buckets — so there is nothing here for the tie-break to
   * override, and the rows would arrive in this order even without it. The
   * twin in memory further down is where the tie-break is held to account,
   * because there the order it overrides is a defined one.
   */
  it.effect("two sellers holding the same amount come back in one fixed order", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const { salvador } = yield* storesFor();
      const actor = yield* managerOf("FF36", salvador.id);
      const zara = yield* insertUser(userIdOf("FF99"), "zara");
      const alma = yield* insertUser(userIdOf("FF37"), "alma");

      const hers = yield* opportunityRowAt("Construtora Um", 2);
      const his = yield* opportunityRowAt("Construtora Dois", 1);
      yield* assignedAt(hers, salvador.id, zara, 40);
      yield* assignedAt(his, salvador.id, alma, 30);

      const tally = yield* service.sellerTally(actor, tallyFor(salvador.id));

      assert.deepStrictEqual(
        [...tally.sellers],
        [
          { userId: alma, total: 1 },
          { userId: zara, total: 1 },
        ],
      );
      assert.strictEqual(tally.total, 2);
    }).pipe(Effect.provide(ServicesTest)),
  );

  /**
   * Handing a lead to another store is not a second placement to be counted
   * twice: the opportunity has one latest placement, and it is at the store it
   * moved to. The store it left has to go back to zero, total included, or the
   * old store keeps reporting work it no longer has.
   */
  it.effect("an opportunity reassigned to another store leaves the first store's count at zero", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const { salvador, floripa } = yield* storesFor();

      const boss = yield* insertUser(userIdOf("FF38"), "boss");
      yield* memberAt(salvador.id, boss, "manager");
      yield* memberAt(floripa.id, boss, "manager");
      const actor = actorOf(
        "employee",
        boss,
        new Scope.CrmScope({ userId: boss, managed: [salvador.id, floripa.id], selling: [] }),
      );

      const vera = yield* insertUser(userIdOf("FF39"), "vera");
      const bruno = yield* insertUser(userIdOf("FF40"), "bruno");

      const moved = yield* opportunityRowAt("Construtora Mudada", 2);
      yield* assignedAt(moved, salvador.id, vera, 60);
      yield* assignedAt(moved, floripa.id, bruno, 30);

      const atSalvador = yield* service.sellerTally(actor, tallyFor(salvador.id));
      assert.deepStrictEqual([...atSalvador.sellers], []);
      assert.strictEqual(atSalvador.reclaimed, 0);
      assert.strictEqual(atSalvador.total, 0);

      const atFloripa = yield* service.sellerTally(actor, tallyFor(floripa.id));
      assert.deepStrictEqual([...atFloripa.sellers], [{ userId: bruno, total: 1 }]);
      assert.strictEqual(atFloripa.total, 1);
    }).pipe(Effect.provide(ServicesTest)),
  );

  /**
   * A deleted opportunity is gone from the listing, so it has to be gone from
   * the counters too — the placement outlives the deletion and would otherwise
   * keep crediting a seller with work that no longer exists anywhere else on
   * the screen.
   */
  it.effect("a deleted opportunity leaves the count with the store's total", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const { salvador } = yield* storesFor();
      const actor = yield* managerOf("FF41", salvador.id);
      const vera = yield* insertUser(userIdOf("FF42"), "vera");

      const kept = yield* opportunityRowAt("Construtora Viva", 2);
      const dropped = yield* opportunityRowAt("Construtora Apagada", 1);
      yield* assignedAt(kept, salvador.id, vera, 40);
      yield* assignedAt(dropped, salvador.id, vera, 30);

      yield* softDeleted(dropped);

      const tally = yield* service.sellerTally(actor, tallyFor(salvador.id));
      assert.deepStrictEqual([...tally.sellers], [{ userId: vera, total: 1 }]);
      assert.strictEqual(tally.total, 1);

      const listed = yield* service.list(actor, listingFor(salvador.id));
      assert.strictEqual(listed.total, tally.total);
    }).pipe(Effect.provide(ServicesTest)),
  );

  /**
   * The admin path reads the store without any membership naming it, the same
   * way the listing does. It is the one path where reach is not settled by the
   * scope, so it is the one that would answer an unreachable store if the
   * refusal were left to the query.
   */
  it.effect("an admin counts a store no membership of theirs names", () =>
    Effect.gen(function* () {
      const service = yield* CrmOpportunityService;
      const { salvador, floripa } = yield* storesFor();
      const vera = yield* insertUser(userIdOf("FF43"), "vera");
      const bruno = yield* insertUser(userIdOf("FF44"), "bruno");

      const here = yield* opportunityRowAt("Construtora Salvador", 2);
      const there = yield* opportunityRowAt("Construtora Floripa", 1);
      yield* assignedAt(here, salvador.id, vera, 40);
      yield* assignedAt(there, floripa.id, bruno, 30);

      const adminId = yield* insertUser(userIdOf("FF45"), "admin");
      const admin = actorOf("admin", adminId, Scope.empty(adminId));

      const atSalvador = yield* service.sellerTally(admin, tallyFor(salvador.id));
      assert.deepStrictEqual([...atSalvador.sellers], [{ userId: vera, total: 1 }]);
      assert.strictEqual(atSalvador.total, 1);

      const atFloripa = yield* service.sellerTally(admin, tallyFor(floripa.id));
      assert.deepStrictEqual([...atFloripa.sellers], [{ userId: bruno, total: 1 }]);
      assert.strictEqual(atFloripa.total, 1);
    }).pipe(Effect.provide(ServicesTest)),
  );
});

/**
 * `Persistance.layerMemory` is real wiring — it is what the api's memory groups
 * run on — and nothing exercised it until here. These are the two counting
 * rules that only mean anything because a second implementation has to reach
 * the same answer as the first, so they are the two worth asking it directly.
 * The repository is read without a service in front of it: the memory side
 * answers to no scope, and there are no rows to insert for it.
 */
describe("crm opportunity counts in memory", () => {
  /**
   * The teeth the sql twin cannot have. `living` hands the tally its
   * opportunities newest first, so zara — the later id, on the newer
   * opportunity — is gathered ahead of alma, and `Array.sort` is stable: take
   * the id comparison out of `byBusiest` and the rows come back in the order
   * they were gathered. The assertion is that they do not.
   */
  it.effect("two sellers holding the same amount come back in one fixed order", () =>
    Effect.gen(function* () {
      const opportunities = yield* OpportunityPersistence.Repository;
      const { salvador } = yield* storesFor();
      const zara = userIdOf("FF99");
      const alma = userIdOf("FF37");

      const hers = yield* opportunityAt({ name: "Construtora Um" });
      const his = yield* opportunityAt({ name: "Construtora Dois", daysAgo: 1 });
      yield* assignedAt(hers.id, salvador.id, zara, 40);
      yield* assignedAt(his.id, salvador.id, alma, 30);

      const tally = yield* opportunities.sellerTally(tallyFor(salvador.id));

      assert.deepStrictEqual(
        [...tally.sellers],
        [
          { userId: alma, total: 1 },
          { userId: zara, total: 1 },
        ],
      );
      assert.strictEqual(tally.total, 2);
    }).pipe(Effect.provide(Persistance.layerMemory)),
  );

  /**
   * The same collision the sql twin builds, put to the other implementation.
   * `tiedAt` writes the pair reclaim first, against their ids, so the map hands
   * them back in that order and only `byPlacedAt` comparing the ids puts them
   * right — which is what `Placement.latest` depends on, since it sorts on
   * `placedAt` alone and keeps whatever order it was given on a tie.
   */
  it.effect("two placements on one instant are settled by the placement id, in memory", () =>
    Effect.gen(function* () {
      const opportunities = yield* OpportunityPersistence.Repository;
      const placements = yield* PlacementPersistence.Repository;
      const { salvador } = yield* storesFor();
      const vera = userIdOf("FF35");

      const held = yield* opportunityAt({ name: "Construtora Segura" });
      const tied = yield* opportunityAt({ name: "Construtora Empatada", daysAgo: 1 });
      yield* assignedAt(held.id, salvador.id, vera, 30);
      yield* tiedAt(tied.id, salvador.id, vera, 30, "AA");

      const history = yield* placements.forOpportunity(tied.id);
      const latest = Option.getOrUndefined(Opportunity.Placement.latest(history));
      assert.strictEqual(history.length, 2);
      assert.strictEqual(latest?.kind, "reclaimed");

      const tally = yield* opportunities.sellerTally(tallyFor(salvador.id));
      assert.deepStrictEqual([...tally.sellers], [{ userId: vera, total: 1 }]);
      assert.strictEqual(tally.reclaimed, 1);
      assert.strictEqual(tally.total, 2);
    }).pipe(Effect.provide(Persistance.layerMemory)),
  );
});
