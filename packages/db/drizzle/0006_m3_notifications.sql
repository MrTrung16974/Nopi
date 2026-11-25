ALTER TABLE "notifications" ALTER COLUMN "recipient_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "student_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "recipient_student_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "body" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "attempts" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_student_id_students_id_fk" FOREIGN KEY ("recipient_student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_student_idx" ON "devices" USING btree ("student_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_chk" CHECK ("notifications"."recipient_user_id" IS NOT NULL OR "notifications"."recipient_student_id" IS NOT NULL);