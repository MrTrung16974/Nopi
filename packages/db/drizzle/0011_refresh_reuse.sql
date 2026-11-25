ALTER TABLE "student_sessions" ADD COLUMN "prev_refresh_token_hash" text;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "prev_refresh_token_hash" text;--> statement-breakpoint
CREATE INDEX "student_sessions_prev_rt_idx" ON "student_sessions" USING btree ("prev_refresh_token_hash");--> statement-breakpoint
CREATE INDEX "user_sessions_prev_rt_idx" ON "user_sessions" USING btree ("prev_refresh_token_hash");