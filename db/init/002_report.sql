CREATE TABLE IF NOT EXISTS app_report (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	session_id UUID NOT NULL UNIQUE REFERENCES app_session(id) ON DELETE CASCADE,
	user_uid UUID NOT NULL REFERENCES app_user(uid) ON DELETE CASCADE,
	template_id TEXT NOT NULL,
	template_name TEXT NOT NULL,
	model_tag TEXT NOT NULL,
	speaker_names JSONB NOT NULL DEFAULT '{}',
	sections JSONB NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_report_session_id_idx ON app_report(session_id);
CREATE INDEX IF NOT EXISTS app_report_user_uid_idx ON app_report(user_uid);

ALTER TABLE app_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_report FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_report_select_own ON app_report;
CREATE POLICY app_report_select_own
	ON app_report
	FOR SELECT
	USING (user_uid = current_app_user_uid());

DROP POLICY IF EXISTS app_report_insert_own ON app_report;
CREATE POLICY app_report_insert_own
	ON app_report
	FOR INSERT
	WITH CHECK (user_uid = current_app_user_uid());

DROP POLICY IF EXISTS app_report_delete_own ON app_report;
CREATE POLICY app_report_delete_own
	ON app_report
	FOR DELETE
	USING (user_uid = current_app_user_uid());
