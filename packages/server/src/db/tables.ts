import { bareId, Opportunity, OpportunityEvent } from "@crm-chat/domain";
import { sql } from "drizzle-orm";
import {
  bytea,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { DateTime, Schema } from "effect";

export const ulid = <const T extends string>(name: T) => {
  const codec = bareId(name);
  const toBare = Schema.encodeUnknownSync(codec);
  const toPrefixed = Schema.decodeUnknownSync(codec);

  return customType<{ data: Schema.Schema.Type<typeof codec>; driverData: string }>({
    dataType: () => "char(26)",
    toDriver: (id) => toBare(id),
    fromDriver: (raw) => toPrefixed(raw),
  });
};

export const instant = customType<{ data: string; driverData: number | string }>({
  dataType: () => "bigint",
  toDriver: (iso) => DateTime.toEpochMillis(DateTime.makeUnsafe(iso)),
  fromDriver: (raw) => DateTime.formatIso(DateTime.makeUnsafe(Number(raw))),
});

export const timestamps = {
  createdAt: instant("created_at").notNull(),
  updatedAt: instant("updated_at").notNull(),
  deletedAt: instant("deleted_at"),
};

export const users = pgTable("users", {
  id: ulid("user")().primaryKey(),
  name: text().notNull(),
  ...timestamps,
});

export const crmContacts = pgTable(
  "crm_contacts",
  {
    id: ulid("crm_contact")().primaryKey(),
    name: text().notNull(),
    company: text(),
    email: text(),
    phone: text(),
    emailKey: text("email_key"),
    phoneKey: text("phone_key"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("crm_contacts_email_key")
      .on(table.emailKey)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex("crm_contacts_phone_key")
      .on(table.phoneKey)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const crmOpportunityStage = pgEnum("crm_opportunity_stage", Opportunity.STAGES);

export const crmOpportunities = pgTable(
  "crm_opportunities",
  {
    id: ulid("crm_opportunity")().primaryKey(),
    contactId: ulid("crm_contact")("contact_id")
      .notNull()
      .references(() => crmContacts.id),
    title: text().notNull(),
    stage: crmOpportunityStage().notNull(),
    ...timestamps,
  },
  (table) => [
    index("crm_opportunities_contact_idx").on(table.contactId),
    index("crm_opportunities_stage_idx").on(table.stage, table.updatedAt),
  ],
);

export const crmOpportunityEventKind = pgEnum("crm_opportunity_event_kind", OpportunityEvent.KINDS);

export const crmOpportunityEvents = pgTable(
  "crm_opportunity_events",
  {
    id: ulid("crm_opportunity_event")().primaryKey(),
    opportunityId: ulid("crm_opportunity")("opportunity_id")
      .notNull()
      .references(() => crmOpportunities.id),
    kind: crmOpportunityEventKind().notNull(),
    fromStage: crmOpportunityStage("from_stage"),
    toStage: crmOpportunityStage("to_stage"),
    authorId: ulid("user")("author_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("crm_opportunity_events_opportunity_idx").on(table.opportunityId, table.createdAt),
  ],
);

export const crmOpportunityNotes = pgTable(
  "crm_opportunity_notes",
  {
    id: ulid("crm_opportunity_note")().primaryKey(),
    opportunityId: ulid("crm_opportunity")("opportunity_id")
      .notNull()
      .references(() => crmOpportunities.id),
    body: text().notNull(),
    authorId: ulid("user")("author_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("crm_opportunity_notes_opportunity_idx").on(table.opportunityId, table.createdAt),
  ],
);

export const crmOpportunityFiles = pgTable(
  "crm_opportunity_files",
  {
    id: ulid("crm_opportunity_file")().primaryKey(),
    opportunityId: ulid("crm_opportunity")("opportunity_id")
      .notNull()
      .references(() => crmOpportunities.id),
    filename: text().notNull(),
    mediaType: text("media_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    authorId: ulid("user")("author_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("crm_opportunity_files_opportunity_idx").on(table.opportunityId, table.createdAt),
  ],
);

export const crmOpportunityFileContents = pgTable("crm_opportunity_file_contents", {
  fileId: ulid("crm_opportunity_file")("file_id")
    .primaryKey()
    .references(() => crmOpportunityFiles.id),
  data: bytea().notNull(),
  ...timestamps,
});

export const crmConversations = pgTable(
  "crm_conversations",
  {
    id: ulid("crm_conversation")().primaryKey(),
    contactId: ulid("crm_contact")("contact_id")
      .notNull()
      .references(() => crmContacts.id),
    lastInboundAt: instant("last_inbound_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("crm_conversations_contact_key")
      .on(table.contactId)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const crmConversationDirection = pgEnum("crm_conversation_direction", [
  "inbound",
  "outbound",
]);

export const crmConversationMessageKind = pgEnum("crm_conversation_message_kind", [
  "text",
  "media",
  "template",
]);

export const crmConversationMessages = pgTable(
  "crm_conversation_messages",
  {
    id: ulid("crm_conversation_message")().primaryKey(),
    conversationId: ulid("crm_conversation")("conversation_id")
      .notNull()
      .references(() => crmConversations.id),
    direction: crmConversationDirection().notNull(),
    kind: crmConversationMessageKind().notNull(),
    body: text(),
    filename: text(),
    mediaType: text("media_type"),
    sizeBytes: integer("size_bytes"),
    templateName: text("template_name"),
    templateParameters: jsonb("template_parameters").$type<ReadonlyArray<string>>(),
    externalId: text("external_id"),
    authorId: ulid("user")("author_id").references(() => users.id),
    sentAt: instant("sent_at").notNull(),
    deliveredAt: instant("delivered_at"),
    readAt: instant("read_at"),
    ...timestamps,
  },
  (table) => [
    index("crm_conversation_messages_thread_idx").on(table.conversationId, table.sentAt),
    index("crm_conversation_messages_external_idx").on(table.externalId),
    check(
      "crm_conversation_messages_author_consistency",
      sql`(${table.direction} = 'inbound') = (${table.authorId} is null)`,
    ),
  ],
);

export const crmConversationMedia = pgTable("crm_conversation_media", {
  messageId: ulid("crm_conversation_message")("message_id")
    .primaryKey()
    .references(() => crmConversationMessages.id),
  data: bytea().notNull(),
  ...timestamps,
});
