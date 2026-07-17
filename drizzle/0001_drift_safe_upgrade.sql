CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE app_role AS ENUM ('admin', 'user');
  END IF;
END
$$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS app_user (
  uid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  firstname TEXT NOT NULL,
  lastname TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'app_user' AND column_name = 'id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'app_user' AND column_name = 'uid'
  ) THEN
    ALTER TABLE app_user RENAME COLUMN id TO uid;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'app_user' AND column_name = 'display_name'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'app_user' AND column_name = 'firstname'
  ) THEN
    ALTER TABLE app_user RENAME COLUMN display_name TO firstname;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'app_user' AND column_name = 'lastname'
  ) THEN
    ALTER TABLE app_user ADD COLUMN lastname TEXT;
  END IF;
END
$$;--> statement-breakpoint

UPDATE app_user
SET lastname = ''
WHERE lastname IS NULL;--> statement-breakpoint

ALTER TABLE app_user
  ALTER COLUMN firstname SET NOT NULL,
  ALTER COLUMN lastname SET NOT NULL,
  ALTER COLUMN role SET DEFAULT 'user';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS external_identity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uid UUID NOT NULL REFERENCES app_user(uid) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  email TEXT,
  claims_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, subject_id)
);--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'external_identity' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'external_identity' AND column_name = 'user_uid'
  ) THEN
    ALTER TABLE external_identity RENAME COLUMN user_id TO user_uid;
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
    ALTER TABLE external_identity
      ADD CONSTRAINT external_identity_user_uid_app_user_uid_fk
      FOREIGN KEY (user_uid)
      REFERENCES app_user(uid)
      ON DELETE CASCADE;
  END IF;
END
$$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS external_identity_user_id_idx
  ON external_identity(user_uid);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS app_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uid UUID NOT NULL REFERENCES app_user(uid) ON DELETE CASCADE,
  job_id UUID NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  transcript_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  exports_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);--> statement-breakpoint

ALTER TABLE app_session
  ALTER COLUMN transcript_payload SET DEFAULT '{}'::jsonb,
  ALTER COLUMN status SET DEFAULT 'pending';--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_session_status_check'
  ) THEN
    ALTER TABLE app_session
      ADD CONSTRAINT app_session_status_check
      CHECK (status IN ('pending', 'processing', 'completed', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_session_user_uid_app_user_uid_fk'
  ) THEN
    ALTER TABLE app_session
      ADD CONSTRAINT app_session_user_uid_app_user_uid_fk
      FOREIGN KEY (user_uid)
      REFERENCES app_user(uid)
      ON DELETE CASCADE;
  END IF;
END
$$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS app_session_user_uid_idx
  ON app_session(user_uid);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS app_session_created_at_idx
  ON app_session(created_at DESC);--> statement-breakpoint

ALTER TABLE app_session ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app_session FORCE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS app_session_select_own ON app_session;--> statement-breakpoint
CREATE POLICY app_session_select_own
  ON app_session
  FOR SELECT
  USING (user_uid = current_setting('app.user_uid', true)::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS app_session_insert_own ON app_session;--> statement-breakpoint
CREATE POLICY app_session_insert_own
  ON app_session
  FOR INSERT
  WITH CHECK (user_uid = current_setting('app.user_uid', true)::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS app_session_update_own ON app_session;--> statement-breakpoint
CREATE POLICY app_session_update_own
  ON app_session
  FOR UPDATE
  USING (user_uid = current_setting('app.user_uid', true)::uuid)
  WITH CHECK (user_uid = current_setting('app.user_uid', true)::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS app_session_delete_own ON app_session;--> statement-breakpoint
CREATE POLICY app_session_delete_own
  ON app_session
  FOR DELETE
  USING (user_uid = current_setting('app.user_uid', true)::uuid);
