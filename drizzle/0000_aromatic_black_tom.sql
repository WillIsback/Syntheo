DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE "public"."app_role" AS ENUM('admin', 'user');
  END IF;
END
$$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_uid" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"transcript_payload" jsonb NOT NULL,
	"exports_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_session_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_user" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"firstname" text NOT NULL,
	"lastname" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "app_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "external_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_uid" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject_id" text NOT NULL,
	"email" text,
	"claims_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_identity_provider_subject_id_unique" UNIQUE("provider","subject_id")
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'app_session_user_uid_app_user_uid_fk'
	) THEN
		ALTER TABLE "app_session"
			ADD CONSTRAINT "app_session_user_uid_app_user_uid_fk"
			FOREIGN KEY ("user_uid") REFERENCES "public"."app_user"("uid") ON DELETE cascade ON UPDATE no action;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'external_identity_user_uid_app_user_uid_fk'
	) THEN
		ALTER TABLE "external_identity"
			ADD CONSTRAINT "external_identity_user_uid_app_user_uid_fk"
			FOREIGN KEY ("user_uid") REFERENCES "public"."app_user"("uid") ON DELETE cascade ON UPDATE no action;
	END IF;
END
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_session_user_uid_idx" ON "app_session" USING btree ("user_uid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_session_created_at_idx" ON "app_session" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_identity_user_id_idx" ON "external_identity" USING btree ("user_uid");