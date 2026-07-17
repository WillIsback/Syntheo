DROP TABLE IF EXISTS app_template;

CREATE TABLE app_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uid UUID NOT NULL REFERENCES app_user(uid) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT '📝',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_template_user_uid_idx ON app_template(user_uid);

ALTER TABLE app_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_template FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_template_select_own ON app_template;
CREATE POLICY app_template_select_own
  ON app_template FOR SELECT
  USING (user_uid = current_app_user_uid());

DROP POLICY IF EXISTS app_template_insert_own ON app_template;
CREATE POLICY app_template_insert_own
  ON app_template FOR INSERT
  WITH CHECK (user_uid = current_app_user_uid());

DROP POLICY IF EXISTS app_template_update_own ON app_template;
CREATE POLICY app_template_update_own
  ON app_template FOR UPDATE
  USING (user_uid = current_app_user_uid())
  WITH CHECK (user_uid = current_app_user_uid());

DROP POLICY IF EXISTS app_template_delete_own ON app_template;
CREATE POLICY app_template_delete_own
  ON app_template FOR DELETE
  USING (user_uid = current_app_user_uid());
