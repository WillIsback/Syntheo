-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Consent + session log
CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consent_hash    TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  ip_address      TEXT NOT NULL
);
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_isolation ON sessions;
CREATE POLICY user_isolation ON sessions
  USING (user_id = current_setting('app.current_user_id', true)::UUID)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::UUID);

-- Encrypted transcriptions
CREATE TABLE IF NOT EXISTS transcriptions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id          UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  content_encrypted   BYTEA NOT NULL,
  speakers            JSONB NOT NULL DEFAULT '[]',
  whisper_run_id      TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcriptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_isolation ON transcriptions;
CREATE POLICY user_isolation ON transcriptions
  USING (
    session_id IN (
      SELECT id FROM sessions
      WHERE user_id = current_setting('app.current_user_id', true)::UUID
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM sessions
      WHERE user_id = current_setting('app.current_user_id', true)::UUID
    )
  );

-- Encrypted reports
CREATE TABLE IF NOT EXISTS reports (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id          UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  content_encrypted   BYTEA NOT NULL,
  vllm_run_id         TEXT NOT NULL,
  model_version       TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_isolation ON reports;
CREATE POLICY user_isolation ON reports
  USING (
    session_id IN (
      SELECT id FROM sessions
      WHERE user_id = current_setting('app.current_user_id', true)::UUID
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM sessions
      WHERE user_id = current_setting('app.current_user_id', true)::UUID
    )
  );
