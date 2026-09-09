import { Contact, CrmContactId } from "@crm-chat/domain";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { Database, Tables } from "../db";
import { deletion, isoOf, optionalIsoOf, present } from "./Row";

export class ContactRepositoryError extends Schema.TaggedError<ContactRepositoryError>()(
  "Persistance.Crm.Contact.RepositoryError",
  { message: Schema.String },
) {}

export interface IContactRepository {
  readonly save: (contact: Contact.Contact) => Effect.Effect<Contact.Contact, ContactRepositoryError>;
  readonly findById: (
    id: CrmContactId.Id,
  ) => Effect.Effect<Option.Option<Contact.Contact>, ContactRepositoryError>;
  readonly findByIdentity: (
    identity: Contact.Identity.Identity,
  ) => Effect.Effect<Contact.Identity.Found, ContactRepositoryError>;
  readonly all: () => Effect.Effect<Contact.Contact[], ContactRepositoryError>;
}

export class Repository extends Context.Service<Repository, IContactRepository>()(
  "@crm-chat/server/persistence/Contact/Repository",
) {}

const failed = Effect.mapError(
  (e: { readonly message: string }) => new ContactRepositoryError({ message: e.message }),
);

const decodeContact = Schema.decodeUnknownEffect(Schema.toCodecJson(Contact.Contact));

type ContactRow = typeof Tables.crmContacts.$inferSelect;

const toRow = (contact: Contact.Contact): typeof Tables.crmContacts.$inferInsert => {
  const identity = Contact.Identity.identityOf({ email: contact.email, phone: contact.phone });
  return {
    id: contact.id,
    name: contact.name,
    company: contact.company ?? null,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
    emailKey: identity.email ?? null,
    phoneKey: identity.phone ?? null,
    createdAt: isoOf(contact.createdAt),
    updatedAt: isoOf(contact.updatedAt),
    deletedAt: optionalIsoOf(contact.deletedAt),
  };
};

const fromRow = (row: ContactRow) =>
  decodeContact({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...present({ company: row.company, email: row.email, phone: row.phone }),
    ...deletion(row.deletedAt),
  });

const alive = isNull(Tables.crmContacts.deletedAt);

export const makeSql = Effect.gen(function* () {
  const db = yield* Database.Database;

  const save: IContactRepository["save"] = Effect.fn("save")(function* (contact) {
    const row = toRow(contact);
    const { id: _, createdAt: __, ...patch } = row;
    yield* db
      .insert(Tables.crmContacts)
      .values(row)
      .onConflictDoUpdate({ target: Tables.crmContacts.id, set: patch });
    return contact;
  }, failed);

  const findById: IContactRepository["findById"] = Effect.fn("findById")(function* (id) {
    const rows = yield* db
      .select()
      .from(Tables.crmContacts)
      .where(and(eq(Tables.crmContacts.id, id), alive));
    const row = rows[0];
    return row === undefined ? Option.none() : Option.some(yield* fromRow(row));
  }, failed);

  const findByIdentity: IContactRepository["findByIdentity"] = Effect.fn("findByIdentity")(
    function* (identity) {
      const conditions = [
        ...(identity.email === undefined ? [] : [eq(Tables.crmContacts.emailKey, identity.email)]),
        ...(identity.phone === undefined ? [] : [eq(Tables.crmContacts.phoneKey, identity.phone)]),
      ];
      if (conditions.length === 0) return { byEmail: Option.none(), byPhone: Option.none() };
      const rows = yield* db
        .select()
        .from(Tables.crmContacts)
        .where(and(or(...conditions), alive));
      const contacts = yield* Effect.forEach(rows, (row) =>
        Effect.map(fromRow(row), (contact) => ({ row, contact })),
      );
      const byEmail = contacts.find(
        ({ row }) => identity.email !== undefined && row.emailKey === identity.email,
      );
      const byPhone = contacts.find(
        ({ row }) => identity.phone !== undefined && row.phoneKey === identity.phone,
      );
      return {
        byEmail: Option.fromNullishOr(byEmail?.contact),
        byPhone: Option.fromNullishOr(byPhone?.contact),
      };
    },
    failed,
  );

  const all: IContactRepository["all"] = Effect.fn("all")(function* () {
    const rows = yield* db
      .select()
      .from(Tables.crmContacts)
      .where(alive)
      .orderBy(asc(Tables.crmContacts.name));
    return yield* Effect.forEach(rows, fromRow);
  }, failed);

  return Repository.of({ save, findById, findByIdentity, all });
});

export const layerSql = Layer.effect(Repository)(makeSql);
