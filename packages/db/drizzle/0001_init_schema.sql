CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_uid" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_identities_provider_chk" CHECK ("auth_identities"."provider" IN ('phone', 'google', 'password'))
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"platform" text NOT NULL,
	"push_token" text,
	"app_version" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_pushToken_unique" UNIQUE("push_token")
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"student_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"relationship" text NOT NULL,
	"policy_version" text,
	"consented_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardians_student_id_user_id_pk" PRIMARY KEY("student_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "student_login_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_login_cards_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "student_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"device_id" uuid,
	"method" text NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_sessions_refreshTokenHash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY NOT NULL,
	"home_school_id" uuid,
	"student_code" text NOT NULL,
	"full_name" text NOT NULL,
	"nickname" text,
	"birth_date" date,
	"avatar_key" text,
	"pin_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"email" "citext",
	"password_hash" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_status_chk" CHECK ("users"."status" IN ('invited', 'active', 'locked'))
);
--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	CONSTRAINT "academic_years_range_chk" CHECK ("academic_years"."starts_on" < "academic_years"."ends_on")
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"grade" smallint NOT NULL,
	"name" text NOT NULL,
	"homeroom_teacher_id" uuid,
	"join_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_joinCode_unique" UNIQUE("join_code"),
	CONSTRAINT "classes_grade_chk" CHECK ("classes"."grade" BETWEEN 1 AND 9)
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_on" date DEFAULT now() NOT NULL,
	"left_on" date,
	CONSTRAINT "enrollments_status_chk" CHECK ("enrollments"."status" IN ('active', 'transferred', 'left'))
);
--> statement-breakpoint
CREATE TABLE "school_members" (
	"school_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_members_school_id_user_id_role_pk" PRIMARY KEY("school_id","user_id","role"),
	CONSTRAINT "school_members_role_chk" CHECK ("school_members"."role" IN ('admin', 'teacher', 'guardian_owner'))
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'school' NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schools_kind_chk" CHECK ("schools"."kind" IN ('school', 'family'))
);
--> statement-breakpoint
CREATE TABLE "teaching_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" smallint NOT NULL,
	"valid_from" date DEFAULT now() NOT NULL,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "assignment_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid,
	"owner_user_id" uuid,
	"code" text,
	"name" text NOT NULL,
	"suggested_subject_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"defaults" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid,
	"subject_id" smallint,
	"stage" text,
	"text" text NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grade_subjects" (
	"grade" smallint NOT NULL,
	"subject_id" smallint NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"grading_scheme" text NOT NULL,
	"sort_order" smallint NOT NULL,
	CONSTRAINT "grade_subjects_grade_subject_id_pk" PRIMARY KEY("grade","subject_id"),
	CONSTRAINT "grade_subjects_grade_chk" CHECK ("grade_subjects"."grade" BETWEEN 1 AND 9),
	CONSTRAINT "grade_subjects_scheme_chk" CHECK ("grade_subjects"."grading_scheme" IN ('completion_level', 'pass_fail', 'score_10'))
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"group_code" text,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	CONSTRAINT "subjects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "media_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint,
	"duration_s" numeric(6, 1),
	"thumbnail_key" text,
	"status" text DEFAULT 'uploading' NOT NULL,
	"uploaded_by" uuid,
	"delete_after" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_files_storageKey_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_files_kind_chk" CHECK ("media_files"."kind" IN ('photo', 'video', 'audio', 'document')),
	CONSTRAINT "media_files_status_chk" CHECK ("media_files"."status" IN ('uploading', 'processing', 'ready', 'failed', 'deleted'))
);
--> statement-breakpoint
CREATE TABLE "assignment_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"item_type" text NOT NULL,
	"prompt_text" text,
	"prompt_latex" text,
	"prompt_media_id" uuid,
	"options" jsonb,
	"ai_confidence" numeric(3, 2),
	CONSTRAINT "assignment_items_type_chk" CHECK ("assignment_items"."item_type" IN ('open', 'multiple_choice', 'fill_blank', 'read_aloud'))
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"batch_id" uuid,
	"teaching_assignment_id" uuid,
	"owner_student_id" uuid,
	"kind" text DEFAULT 'homework' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"instructions_audio_id" uuid,
	"original_media_ids" uuid[],
	"submission_kinds" text[] NOT NULL,
	"max_photos" smallint DEFAULT 5 NOT NULL,
	"max_media_seconds" smallint DEFAULT 120 NOT NULL,
	"grading_scheme" text NOT NULL,
	"publish_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"allow_late" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_owner_chk" CHECK ("assignments"."teaching_assignment_id" IS NOT NULL OR "assignments"."owner_student_id" IS NOT NULL),
	CONSTRAINT "assignments_media_cap_chk" CHECK ("assignments"."max_media_seconds" BETWEEN 1 AND 1800),
	CONSTRAINT "assignments_kinds_nonempty_chk" CHECK (cardinality("assignments"."submission_kinds") > 0),
	CONSTRAINT "assignments_kinds_chk" CHECK ("assignments"."submission_kinds" <@ ARRAY['photo','video','audio','document']::text[]),
	CONSTRAINT "assignments_kind_chk" CHECK ("assignments"."kind" IN ('homework', 'practice')),
	CONSTRAINT "assignments_source_chk" CHECK ("assignments"."source" IN ('manual', 'scan', 'template', 'copy')),
	CONSTRAINT "assignments_status_chk" CHECK ("assignments"."status" IN ('draft', 'scheduled', 'published', 'closed')),
	CONSTRAINT "assignments_scheme_chk" CHECK ("assignments"."grading_scheme" IN ('completion_level', 'pass_fail', 'score_10'))
);
--> statement-breakpoint
CREATE TABLE "student_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"last_submitted_at" timestamp with time zone,
	"is_late" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_assignments_status_chk" CHECK ("student_assignments"."status" IN ('assigned', 'submitted', 'returned', 'graded'))
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"scheme" text NOT NULL,
	"level" text,
	"score" numeric(4, 2),
	"comment" text,
	"comment_audio_id" uuid,
	"sticker" text,
	"requires_redo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluations_submissionId_unique" UNIQUE("submission_id"),
	CONSTRAINT "evaluations_scheme_chk" CHECK ("evaluations"."scheme" IN ('completion_level', 'pass_fail', 'score_10')),
	CONSTRAINT "evaluations_level_chk" CHECK ("evaluations"."level" IS NULL OR "evaluations"."level" IN ('HOAN_THANH_TOT', 'HOAN_THANH', 'CHUA_HOAN_THANH', 'DAT', 'CHUA_DAT')),
	CONSTRAINT "evaluations_score_chk" CHECK ("evaluations"."score" IS NULL OR "evaluations"."score" BETWEEN 0 AND 10),
	CONSTRAINT "evaluations_complete_chk" CHECK ("evaluations"."requires_redo"
        OR ("evaluations"."scheme" = 'score_10' AND "evaluations"."score" IS NOT NULL)
        OR ("evaluations"."scheme" <> 'score_10' AND "evaluations"."level" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "submission_media" (
	"submission_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "submission_media_submission_id_media_id_pk" PRIMARY KEY("submission_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_assignment_id" uuid NOT NULL,
	"attempt_no" smallint NOT NULL,
	"submitted_by_guardian" uuid,
	"note" text,
	"is_late" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"report_type" text NOT NULL,
	"format" text NOT NULL,
	"class_id" uuid,
	"student_id" uuid,
	"subject_id" smallint,
	"from_date" date,
	"to_date" date,
	"file_media_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "export_jobs_status_chk" CHECK ("export_jobs"."status" IN ('queued', 'running', 'done', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid,
	"recipient_user_id" uuid NOT NULL,
	"student_id" uuid,
	"channel" text NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"send_after" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupeKey_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "notifications_channel_chk" CHECK ("notifications"."channel" IN ('push', 'zalo', 'sms')),
	CONSTRAINT "notifications_status_chk" CHECK ("notifications"."status" IN ('pending', 'sent', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "scan_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"requested_by" uuid,
	"requested_by_student" uuid,
	"source_media_ids" uuid[] NOT NULL,
	"image_hash" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"engine" text,
	"result" jsonb,
	"assignment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "scan_jobs_status_chk" CHECK ("scan_jobs"."status" IN ('queued', 'running', 'done', 'failed')),
	CONSTRAINT "scan_jobs_requester_chk" CHECK ("scan_jobs"."requested_by" IS NOT NULL OR "scan_jobs"."requested_by_student" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"amount_vnd" integer NOT NULL,
	"status" text NOT NULL,
	"paid_at" timestamp with time zone,
	"raw_event" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_status_chk" CHECK ("payments"."status" IN ('pending', 'paid', 'refunded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"buyer" text NOT NULL,
	"period" text NOT NULL,
	"price_vnd" integer NOT NULL,
	"features" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "plans_buyer_chk" CHECK ("plans"."buyer" IN ('family', 'school')),
	CONSTRAINT "plans_period_chk" CHECK ("plans"."period" IN ('month', 'year', 'school_year'))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"channel" text NOT NULL,
	"external_id" text,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"purchased_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_channel_chk" CHECK ("subscriptions"."channel" IN ('apple', 'google', 'web', 'contract')),
	CONSTRAINT "subscriptions_status_chk" CHECK ("subscriptions"."status" IN ('trial', 'active', 'grace', 'canceled', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"school_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"student_id" uuid,
	"metadata" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text NOT NULL,
	"school_id" uuid,
	"enabled" boolean NOT NULL,
	"rollout_percent" smallint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_key_school_uq" UNIQUE NULLS NOT DISTINCT("key","school_id")
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"school_id" uuid,
	"payload" jsonb NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_login_cards" ADD CONSTRAINT "student_login_cards_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_login_cards" ADD CONSTRAINT "student_login_cards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sessions" ADD CONSTRAINT "student_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sessions" ADD CONSTRAINT "student_sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_home_school_id_schools_id_fk" FOREIGN KEY ("home_school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_homeroom_teacher_id_users_id_fk" FOREIGN KEY ("homeroom_teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_members" ADD CONSTRAINT "school_members_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_members" ADD CONSTRAINT "school_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_templates" ADD CONSTRAINT "assignment_templates_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_templates" ADD CONSTRAINT "assignment_templates_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_templates" ADD CONSTRAINT "comment_templates_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_templates" ADD CONSTRAINT "comment_templates_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_subjects" ADD CONSTRAINT "grade_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_batches" ADD CONSTRAINT "assignment_batches_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_batches" ADD CONSTRAINT "assignment_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_items" ADD CONSTRAINT "assignment_items_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_items" ADD CONSTRAINT "assignment_items_prompt_media_id_media_files_id_fk" FOREIGN KEY ("prompt_media_id") REFERENCES "public"."media_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_batch_id_assignment_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."assignment_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_teaching_assignment_id_teaching_assignments_id_fk" FOREIGN KEY ("teaching_assignment_id") REFERENCES "public"."teaching_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_owner_student_id_students_id_fk" FOREIGN KEY ("owner_student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_instructions_audio_id_media_files_id_fk" FOREIGN KEY ("instructions_audio_id") REFERENCES "public"."media_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_assignments" ADD CONSTRAINT "student_assignments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_assignments" ADD CONSTRAINT "student_assignments_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_assignments" ADD CONSTRAINT "student_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_comment_audio_id_media_files_id_fk" FOREIGN KEY ("comment_audio_id") REFERENCES "public"."media_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_media" ADD CONSTRAINT "submission_media_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_media" ADD CONSTRAINT "submission_media_media_id_media_files_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_assignment_id_student_assignments_id_fk" FOREIGN KEY ("student_assignment_id") REFERENCES "public"."student_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitted_by_guardian_users_id_fk" FOREIGN KEY ("submitted_by_guardian") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_file_media_id_media_files_id_fk" FOREIGN KEY ("file_media_id") REFERENCES "public"."media_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_jobs" ADD CONSTRAINT "scan_jobs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_jobs" ADD CONSTRAINT "scan_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_jobs" ADD CONSTRAINT "scan_jobs_requested_by_student_students_id_fk" FOREIGN KEY ("requested_by_student") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_jobs" ADD CONSTRAINT "scan_jobs_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_purchased_by_users_id_fk" FOREIGN KEY ("purchased_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_provider_uq" ON "auth_identities" USING btree ("provider","provider_uid");--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "guardians_user_idx" ON "guardians" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_login_cards_one_active_uq" ON "student_login_cards" USING btree ("student_id") WHERE "student_login_cards"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "student_sessions_student_idx" ON "student_sessions" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_code_uq" ON "students" USING btree ("home_school_id","student_code");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_years_school_name_uq" ON "academic_years" USING btree ("school_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_year_name_uq" ON "classes" USING btree ("academic_year_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_one_active_per_year_uq" ON "enrollments" USING btree ("student_id","academic_year_id") WHERE "enrollments"."status" = 'active';--> statement-breakpoint
CREATE INDEX "enrollments_class_idx" ON "enrollments" USING btree ("class_id","status");--> statement-breakpoint
CREATE INDEX "school_members_user_idx" ON "school_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teaching_assignments_current_uq" ON "teaching_assignments" USING btree ("class_id","subject_id") WHERE "teaching_assignments"."valid_to" IS NULL;--> statement-breakpoint
CREATE INDEX "teaching_assignments_teacher_idx" ON "teaching_assignments" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "comment_templates_owner_idx" ON "comment_templates" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "media_files_retention_idx" ON "media_files" USING btree ("delete_after");--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_items_position_uq" ON "assignment_items" USING btree ("assignment_id","position");--> statement-breakpoint
CREATE INDEX "assignments_ta_idx" ON "assignments" USING btree ("teaching_assignment_id","due_at");--> statement-breakpoint
CREATE INDEX "assignments_publish_idx" ON "assignments" USING btree ("publish_at") WHERE "assignments"."status" = 'scheduled';--> statement-breakpoint
CREATE UNIQUE INDEX "student_assignments_uq" ON "student_assignments" USING btree ("assignment_id","student_id");--> statement-breakpoint
CREATE INDEX "student_assignments_home_idx" ON "student_assignments" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "student_assignments_grading_idx" ON "student_assignments" USING btree ("assignment_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_attempt_uq" ON "submissions" USING btree ("student_assignment_id","attempt_no");--> statement-breakpoint
CREATE INDEX "notifications_due_idx" ON "notifications" USING btree ("send_after") WHERE "notifications"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "notifications_inbox_idx" ON "notifications" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "scan_jobs_cache_idx" ON "scan_jobs" USING btree ("school_id","image_hash") WHERE "scan_jobs"."status" = 'done';--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_ref_uq" ON "payments" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_external_uq" ON "subscriptions" USING btree ("channel","external_id");--> statement-breakpoint
CREATE INDEX "subscriptions_school_idx" ON "subscriptions" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "audit_logs_student_idx" ON "audit_logs" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_school_idx" ON "audit_logs" USING btree ("school_id","created_at");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("id") WHERE "outbox"."published_at" IS NULL;