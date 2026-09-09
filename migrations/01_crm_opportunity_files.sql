CREATE TABLE "crm_opportunity_files" (
	"id" char(26) PRIMARY KEY,
	"opportunity_id" char(26) NOT NULL,
	"filename" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"author_id" char(26) NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE TABLE "crm_opportunity_file_contents"(
	"file_id" char(26) PRIMARY KEY,
	"data" bytea NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE INDEX "crm_opportunity_files_opportunity_idx" ON "crm_opportunity_files" ("opportunity_id","created_at");--> statement-breakpoint
ALTER TABLE "crm_opportunity_file_contents" ADD CONSTRAINT "crm_opportunity_file_contents_iYqxFinCm74K_fkey" FOREIGN KEY ("file_id") REFERENCES "crm_opportunity_files"("id");--> statement-breakpoint
ALTER TABLE "crm_opportunity_files" ADD CONSTRAINT "crm_opportunity_files_opportunity_id_crm_opportunities_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "crm_opportunities"("id");--> statement-breakpoint
ALTER TABLE "crm_opportunity_files" ADD CONSTRAINT "crm_opportunity_files_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id");