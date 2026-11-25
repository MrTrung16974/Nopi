ALTER TABLE "export_jobs" ADD COLUMN "params" jsonb;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "export_jobs_requester_idx" ON "export_jobs" USING btree ("requested_by","created_at");