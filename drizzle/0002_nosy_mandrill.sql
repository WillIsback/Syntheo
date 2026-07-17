ALTER TABLE "app_session" ADD COLUMN "name" text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE "app_session"
  SET "name" = "transcript_payload"->'input'->>'filename'
  WHERE "name" = '';--> statement-breakpoint
ALTER TABLE "app_session" ALTER COLUMN "name" DROP DEFAULT;
