import * as z from "zod";

import { JobStatusSchema } from "@/schemas/whisperx.server.schema";

export const AppRoleSchema = z.enum(["admin", "user"]);

const JsonValueSchema: z.ZodType<
  string | number | boolean | null | Record<string, unknown> | unknown[]
> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const UserInsertSchema = z.object({
  email: z.email(),
  firstname: z.string().trim().min(1),
  lastname: z.string().trim().min(1),
  password_hash: z.string().min(1),
  role: AppRoleSchema.default("user"),
});

export const UserSelectSchema = z.object({
  uid: z.uuid(),
  email: z.email(),
  firstname: z.string(),
  lastname: z.string(),
  password_hash: z.string(),
  role: AppRoleSchema,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export const SessionInputMetadataSchema = z.object({
  filename: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  size: z.number().nonnegative(),
  durationS: z.number().nonnegative().optional(),
  language: z.string().trim().min(1).optional(),
});

export const SessionErrorPayloadSchema = z.object({
  message: z.string().trim().min(1),
  at: z.iso.datetime(),
});

export const SessionTranscriptPayloadSchema = z.object({
  input: SessionInputMetadataSchema,
  job: JobStatusSchema.nullable(),
  error: SessionErrorPayloadSchema.nullable(),
});

export const SessionExportsPayloadSchema = z
  .object({
    txt: z.string().optional(),
    error: z.string().optional(),
  })
  .nullable();

export const SessionInsertSchema = z.object({
  user_uid: z.uuid(),
  job_id: z.uuid(),
  name: z.string().trim().min(1),
  status: z
    .enum(["pending", "processing", "completed", "failed"])
    .default("pending"),
  transcript_payload: SessionTranscriptPayloadSchema,
  exports_payload: SessionExportsPayloadSchema.optional(),
});

export const SessionSelectSchema = z.object({
  id: z.uuid(),
  user_uid: z.uuid(),
  job_id: z.uuid(),
  name: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  transcript_payload: SessionTranscriptPayloadSchema,
  exports_payload: SessionExportsPayloadSchema,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export const SessionWithUserSelectSchema = z.object({
  session: SessionSelectSchema,
  user: UserSelectSchema,
});

export type AppRole = z.infer<typeof AppRoleSchema>;
export type UserInsert = z.infer<typeof UserInsertSchema>;
export type UserSelect = z.infer<typeof UserSelectSchema>;
export type SessionInputMetadata = z.infer<typeof SessionInputMetadataSchema>;
export type SessionErrorPayload = z.infer<typeof SessionErrorPayloadSchema>;
export type SessionTranscriptPayload = z.infer<
  typeof SessionTranscriptPayloadSchema
>;
export type SessionExportsPayload = z.infer<typeof SessionExportsPayloadSchema>;
export type SessionInsert = z.infer<typeof SessionInsertSchema>;
export type SessionSelect = z.infer<typeof SessionSelectSchema>;
export type SessionWithUserSelect = z.infer<typeof SessionWithUserSelectSchema>;

export const APP_USER_DDL_SQL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
		CREATE TYPE app_role AS ENUM ('admin', 'user');
	END IF;
END
$$;

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
`;

export const TemplateInsertSchema = z.object({
  user_uid: z.uuid(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  icon: z.string().trim().min(1).max(10).default("📝"),
  content: z.string().trim().min(1).max(20000),
});

export const TemplateSelectSchema = z.object({
  id: z.uuid(),
  user_uid: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  icon: z.string(),
  content: z.string(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export type TemplateInsert = z.infer<typeof TemplateInsertSchema>;
export type TemplateSelect = z.infer<typeof TemplateSelectSchema>;

export const ReportSectionSchema = z.object({
  title: z.string(),
  body: z.string(),
});

export const ReportSelectSchema = z.object({
  id: z.uuid(),
  session_id: z.uuid(),
  user_uid: z.uuid(),
  template_id: z.string(),
  template_name: z.string(),
  model_tag: z.string(),
  speaker_names: z.record(z.string(), z.string()),
  sections: z.array(ReportSectionSchema),
  created_at: z.iso.datetime({ offset: true }),
});

export type ReportSection = z.infer<typeof ReportSectionSchema>;
export type ReportSelect = z.infer<typeof ReportSelectSchema>;

export const APP_SESSION_DDL_SQL = `
CREATE TABLE IF NOT EXISTS app_session (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_uid UUID NOT NULL REFERENCES app_user(uid) ON DELETE CASCADE,
	job_id UUID NOT NULL UNIQUE,
	name TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  transcript_payload JSONB NOT NULL,
	exports_payload JSONB,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_session_user_uid_idx ON app_session(user_uid);
CREATE INDEX IF NOT EXISTS app_session_created_at_idx ON app_session(created_at DESC);
`;

export const APP_SESSION_RLS_SQL = `
ALTER TABLE app_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_session FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_session_select_own ON app_session;
CREATE POLICY app_session_select_own
	ON app_session
	FOR SELECT
	USING (user_uid = current_setting('app.user_uid', true)::uuid);

DROP POLICY IF EXISTS app_session_insert_own ON app_session;
CREATE POLICY app_session_insert_own
	ON app_session
	FOR INSERT
	WITH CHECK (user_uid = current_setting('app.user_uid', true)::uuid);

DROP POLICY IF EXISTS app_session_update_own ON app_session;
CREATE POLICY app_session_update_own
	ON app_session
	FOR UPDATE
	USING (user_uid = current_setting('app.user_uid', true)::uuid)
	WITH CHECK (user_uid = current_setting('app.user_uid', true)::uuid);

DROP POLICY IF EXISTS app_session_delete_own ON app_session;
CREATE POLICY app_session_delete_own
	ON app_session
	FOR DELETE
	USING (user_uid = current_setting('app.user_uid', true)::uuid);
`;

export const SET_RLS_USER_CONTEXT_SQL = "SET LOCAL app.user_uid = $1";
