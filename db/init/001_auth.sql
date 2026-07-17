CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE app_role AS ENUM ('admin', 'user');
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION current_app_user_uid() RETURNS UUID AS $$
  SELECT current_setting('app.user_uid', true)::uuid
$$ LANGUAGE sql STABLE;

CREATE TABLE IF NOT EXISTS app_user (
  uid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  firstname TEXT NOT NULL,
  lastname TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uid UUID NOT NULL REFERENCES app_user(uid) ON DELETE CASCADE,
  job_id UUID NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  transcript_payload JSONB NOT NULL,
  exports_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_session_user_uid_idx
  ON app_session(user_uid);

CREATE INDEX IF NOT EXISTS app_session_created_at_idx
  ON app_session(created_at DESC);

CREATE TABLE IF NOT EXISTS external_identity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uid UUID NOT NULL REFERENCES app_user(uid) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  email TEXT,
  claims_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, subject_id)
);

CREATE INDEX IF NOT EXISTS external_identity_user_id_idx
  ON external_identity(user_uid);

ALTER TABLE app_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_session FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_session_select_own ON app_session;
CREATE POLICY app_session_select_own
  ON app_session
  FOR SELECT
  USING (user_uid = current_app_user_uid());

DROP POLICY IF EXISTS app_session_insert_own ON app_session;
CREATE POLICY app_session_insert_own
  ON app_session
  FOR INSERT
  WITH CHECK (user_uid = current_app_user_uid());

DROP POLICY IF EXISTS app_session_update_own ON app_session;
CREATE POLICY app_session_update_own
  ON app_session
  FOR UPDATE
  USING (user_uid = current_app_user_uid())
  WITH CHECK (user_uid = current_app_user_uid());

DROP POLICY IF EXISTS app_session_delete_own ON app_session;
CREATE POLICY app_session_delete_own
  ON app_session
  FOR DELETE
  USING (user_uid = current_app_user_uid());
