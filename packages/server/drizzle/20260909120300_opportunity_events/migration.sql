CREATE TYPE "crm_opportunity_event_kind" AS ENUM('created', 'staged');--> statement-breakpoint
CREATE TABLE "crm_opportunity_events" (
	"id" char(26) PRIMARY KEY,
	"opportunity_id" char(26) NOT NULL,
	"kind" "crm_opportunity_event_kind" NOT NULL,
	"from_stage" "crm_opportunity_stage",
	"to_stage" "crm_opportunity_stage",
	"author_id" char(26),
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE INDEX "crm_opportunity_events_opportunity_idx" ON "crm_opportunity_events" ("opportunity_id","created_at");--> statement-breakpoint
ALTER TABLE "crm_opportunity_events" ADD CONSTRAINT "crm_opportunity_events_opportunity_id_crm_opportunities_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "crm_opportunities"("id");--> statement-breakpoint
ALTER TABLE "crm_opportunity_events" ADD CONSTRAINT "crm_opportunity_events_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id");
