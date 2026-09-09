CREATE TYPE "crm_conversation_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "crm_conversation_message_kind" AS ENUM('text', 'media', 'template');--> statement-breakpoint
CREATE TABLE "crm_conversation_media" (
	"message_id" char(26) PRIMARY KEY,
	"data" bytea NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE TABLE "crm_conversation_messages" (
	"id" char(26) PRIMARY KEY,
	"conversation_id" char(26) NOT NULL,
	"direction" "crm_conversation_direction" NOT NULL,
	"kind" "crm_conversation_message_kind" NOT NULL,
	"body" text,
	"filename" text,
	"media_type" text,
	"size_bytes" integer,
	"template_name" text,
	"template_parameters" jsonb,
	"external_id" text,
	"author_id" char(26),
	"sent_at" bigint NOT NULL,
	"delivered_at" bigint,
	"read_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	CONSTRAINT "crm_conversation_messages_author_consistency" CHECK (("direction" = 'inbound') = ("author_id" is null))
);
--> statement-breakpoint
CREATE TABLE "crm_conversations" (
	"id" char(26) PRIMARY KEY,
	"contact_id" char(26) NOT NULL,
	"last_inbound_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE TABLE "crm_unclaimed_messages" (
	"id" char(26) PRIMARY KEY,
	"phone" text NOT NULL,
	"kind" "crm_conversation_message_kind" NOT NULL,
	"body" text,
	"received_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE INDEX "crm_conversation_messages_thread_idx" ON "crm_conversation_messages" ("conversation_id","sent_at");--> statement-breakpoint
CREATE INDEX "crm_conversation_messages_external_idx" ON "crm_conversation_messages" ("external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_conversations_contact_key" ON "crm_conversations" ("contact_id") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "crm_unclaimed_messages_received_idx" ON "crm_unclaimed_messages" ("received_at");--> statement-breakpoint
ALTER TABLE "crm_conversation_media" ADD CONSTRAINT "crm_conversation_media_w5XxKDKQZWJ9_fkey" FOREIGN KEY ("message_id") REFERENCES "crm_conversation_messages"("id");--> statement-breakpoint
ALTER TABLE "crm_conversation_messages" ADD CONSTRAINT "crm_conversation_messages_QCBhzrA2kxEl_fkey" FOREIGN KEY ("conversation_id") REFERENCES "crm_conversations"("id");--> statement-breakpoint
ALTER TABLE "crm_conversation_messages" ADD CONSTRAINT "crm_conversation_messages_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "crm_conversations" ADD CONSTRAINT "crm_conversations_contact_id_crm_contacts_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id");