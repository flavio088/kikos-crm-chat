CREATE TYPE "crm_opportunity_stage" AS ENUM('novo', 'em_contato', 'proposta', 'ganho', 'perdido');--> statement-breakpoint
CREATE TABLE "users" (
	"id" char(26) PRIMARY KEY,
	"name" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE TABLE "crm_contacts" (
	"id" char(26) PRIMARY KEY,
	"name" text NOT NULL,
	"company" text,
	"email" text,
	"phone" text,
	"email_key" text,
	"phone_key" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE TABLE "crm_opportunities" (
	"id" char(26) PRIMARY KEY,
	"contact_id" char(26) NOT NULL,
	"title" text NOT NULL,
	"stage" "crm_opportunity_stage" NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE UNIQUE INDEX "crm_contacts_email_key" ON "crm_contacts" ("email_key") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_contacts_phone_key" ON "crm_contacts" ("phone_key") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "crm_opportunities_contact_idx" ON "crm_opportunities" ("contact_id");--> statement-breakpoint
CREATE INDEX "crm_opportunities_stage_idx" ON "crm_opportunities" ("stage","updated_at");--> statement-breakpoint
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_contact_id_crm_contacts_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id");
