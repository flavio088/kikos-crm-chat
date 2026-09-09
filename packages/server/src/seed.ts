import {
  Contact,
  Conversation,
  CrmConversationMessageId,
  Opportunity,
  OpportunityEvent,
  OpportunityNote,
  UserId,
} from "@crm-chat/domain";
import { DateTime, Effect } from "effect";
import { Database, Tables } from "./db";
import * as ContactPersistence from "./persistence/Contact";
import * as ConversationPersistence from "./persistence/Conversation";
import * as ConversationMessagePersistence from "./persistence/ConversationMessage";
import * as OpportunityPersistence from "./persistence/Opportunity";
import * as OpportunityEventPersistence from "./persistence/OpportunityEvent";
import * as OpportunityNotePersistence from "./persistence/OpportunityNote";
import { isoOf } from "./persistence/Row";

export type SeededUser = { readonly id: UserId.Id; readonly name: string };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const CONTACTS = [
  { name: "Ana Souza", company: "Academia Corpo Livre", phone: "11999990001", email: "ana@corpolivre.com.br", title: "Academia em Pinheiros", stage: "novo" },
  { name: "Bruno Lima", company: "Hotel Praia Azul", phone: "21999990002", email: "bruno@praiaazul.com", title: "Sala de ginástica do hotel", stage: "em_contato" },
  { name: "Carla Mendes", company: "Tech Corp", phone: "31999990003", email: "carla@techcorp.com", title: "Espaço fitness corporativo", stage: "proposta" },
  { name: "Diego Rocha", company: "Studio Forma", phone: "41999990004", email: "diego@studioforma.com.br", title: "Reposição de equipamentos", stage: "ganho" },
  { name: "Elisa Martins", company: "Condomínio Vista Verde", phone: "51999990005", email: "elisa@vistaverde.com.br", title: "Academia do condomínio", stage: "perdido" },
] as const;

const firstUser = Effect.gen(function* () {
  const db = yield* Database.Database;
  const rows = yield* db.select().from(Tables.users).limit(1);
  return rows[0];
});

const insertUser = Effect.gen(function* () {
  const db = yield* Database.Database;
  const id = yield* UserId.makeId;
  const now = yield* DateTime.now;
  yield* db
    .insert(Tables.users)
    .values({ id, name: "Vendedor Kikos", createdAt: isoOf(now), updatedAt: isoOf(now) });
  return { id, name: "Vendedor Kikos" };
});

const text = (input: {
  readonly conversationId: Conversation.Conversation["id"];
  readonly direction: Conversation.Message.Direction;
  readonly body: string;
  readonly at: DateTime.Utc;
  readonly authorId?: UserId.Id;
}) =>
  Effect.gen(function* () {
    const id = yield* CrmConversationMessageId.makeId;
    return new Conversation.Message.Text({
      id,
      conversationId: input.conversationId,
      direction: input.direction,
      kind: "text",
      body: input.body,
      ...(input.authorId === undefined ? {} : { authorId: input.authorId }),
      sentAt: input.at,
      createdAt: input.at,
      updatedAt: input.at,
    });
  });

const seedConversations = (user: SeededUser, contacts: ReadonlyArray<Contact.Contact>) =>
  Effect.gen(function* () {
    const conversations = yield* ConversationPersistence.Repository;
    const messages = yield* ConversationMessagePersistence.Repository;
    const now = yield* DateTime.now;
    const [open, closed] = contacts;
    if (open === undefined || closed === undefined) return;

    const openThread = yield* Conversation.make({ contactId: open.id });
    const openInboundAt = DateTime.makeUnsafe(DateTime.toEpochMillis(now) - HOUR);
    yield* conversations.save(
      new Conversation.Conversation({ ...openThread, lastInboundAt: openInboundAt }),
    );
    yield* messages.save(
      yield* text({
        conversationId: openThread.id,
        direction: "inbound",
        body: "Oi! Vi o anúncio de vocês, ainda tem vaga para montar a academia em setembro?",
        at: openInboundAt,
      }),
    );

    const closedThread = yield* Conversation.make({ contactId: closed.id });
    const closedInboundAt = DateTime.makeUnsafe(DateTime.toEpochMillis(now) - 2 * DAY);
    yield* conversations.save(
      new Conversation.Conversation({ ...closedThread, lastInboundAt: closedInboundAt }),
    );
    yield* messages.save(
      yield* text({
        conversationId: closedThread.id,
        direction: "inbound",
        body: "Bom dia, pode me mandar o orçamento da sala de ginástica?",
        at: closedInboundAt,
      }),
    );
    yield* messages.save(
      yield* text({
        conversationId: closedThread.id,
        direction: "outbound",
        body: "Bom dia, Bruno! Envio ainda hoje.",
        at: DateTime.makeUnsafe(DateTime.toEpochMillis(closedInboundAt) + HOUR),
        authorId: user.id,
      }),
    );
  });

const seedNotes = (user: SeededUser, opportunities: ReadonlyArray<Opportunity.Opportunity>) =>
  Effect.gen(function* () {
    const notes = yield* OpportunityNotePersistence.Repository;
    const first = opportunities[0];
    if (first === undefined) return;
    yield* notes.save(
      yield* OpportunityNote.make({
        opportunityId: first.id,
        body: "Ligou pedindo orçamento para 12 estações. Quer visita técnica na próxima semana.",
        authorId: user.id,
      }),
    );
  });

const seedAll = Effect.gen(function* () {
  const contacts = yield* ContactPersistence.Repository;
  const opportunities = yield* OpportunityPersistence.Repository;
  const events = yield* OpportunityEventPersistence.Repository;
  const user = yield* insertUser;

  const saved: Contact.Contact[] = [];
  const opened: Opportunity.Opportunity[] = [];
  for (const entry of CONTACTS) {
    const contact = yield* contacts.save(
      yield* Contact.make({
        name: entry.name,
        company: entry.company,
        phone: entry.phone,
        email: entry.email,
      }),
    );
    saved.push(contact);
    const opportunity = yield* opportunities.save(
      yield* Opportunity.make({ contactId: contact.id, title: entry.title, stage: entry.stage }),
    );
    opened.push(opportunity);
    yield* events.save(
      yield* OpportunityEvent.make({ opportunityId: opportunity.id, kind: "created" }),
    );
  }

  yield* seedNotes(user, opened);
  yield* seedConversations(user, saved);
  yield* Effect.log(`Seed: ${saved.length} contatos e oportunidades criados`);
  return user;
});

export const ensureSeeded = Effect.gen(function* () {
  const existing = yield* firstUser;
  const user: SeededUser =
    existing === undefined
      ? yield* seedAll
      : { id: existing.id, name: existing.name };
  return { user };
});
