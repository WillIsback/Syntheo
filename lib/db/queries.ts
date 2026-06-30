import type { PoolClient } from "pg";

export interface Session {
	id: string;
	createdAt: Date;
	consentVersion: string;
}

export interface Segment {
	start: number;
	end: number;
	speaker: string;
	text: string;
}

export interface SessionDetail {
	session: Session;
	transcription: {
		id: string;
		segments: Segment[];
		whisperRunId: string;
		createdAt: Date;
	} | null;
	report: {
		id: string;
		content: string;
		vllmRunId: string;
		modelVersion: string;
		createdAt: Date;
	} | null;
}

export interface UserExport {
	sessions: Array<{ id: string; createdAt: Date; consentVersion: string }>;
	transcriptions: Array<{
		id: string;
		sessionId: string;
		segments: Segment[];
		whisperRunId: string;
	}>;
	reports: Array<{
		id: string;
		sessionId: string;
		content: string;
		vllmRunId: string;
		modelVersion: string;
	}>;
}

export async function createSession(
	client: PoolClient,
	args: {
		userId: string;
		consentHash: string;
		consentVersion: string;
		ipAddress: string;
	},
): Promise<{ id: string }> {
	const { rows } = await client.query({
		text: `INSERT INTO sessions (user_id, consent_hash, consent_version, ip_address)
           VALUES ($1, $2, $3, $4) RETURNING id`,
		values: [
			args.userId,
			args.consentHash,
			args.consentVersion,
			args.ipAddress,
		],
	});
	return { id: rows[0].id };
}

export async function createTranscription(
	client: PoolClient,
	args: {
		sessionId: string;
		contentPlain: string;
		whisperRunId: string;
		speakers?: Segment[];
	},
): Promise<{ id: string }> {
	const { rows } = await client.query({
		text: `INSERT INTO transcriptions (session_id, content_encrypted, speakers, whisper_run_id)
           VALUES ($1, pgp_sym_encrypt($2, current_setting('app.enc_key')), $3, $4)
           RETURNING id`,
		values: [
			args.sessionId,
			args.contentPlain,
			JSON.stringify(args.speakers ?? []),
			args.whisperRunId,
		],
	});
	return { id: rows[0].id };
}

export async function createReport(
	client: PoolClient,
	args: {
		sessionId: string;
		contentPlain: string;
		vllmRunId: string;
		modelVersion: string;
	},
): Promise<{ id: string }> {
	const { rows } = await client.query({
		text: `INSERT INTO reports (session_id, content_encrypted, vllm_run_id, model_version)
           VALUES ($1, pgp_sym_encrypt($2, current_setting('app.enc_key')), $3, $4)
           RETURNING id`,
		values: [
			args.sessionId,
			args.contentPlain,
			args.vllmRunId,
			args.modelVersion,
		],
	});
	return { id: rows[0].id };
}

export async function getSessionsForUser(
	client: PoolClient,
): Promise<Session[]> {
	const { rows } = await client.query(
		`SELECT id, created_at AS "createdAt", consent_version AS "consentVersion"
     FROM sessions ORDER BY created_at DESC`,
	);
	return rows;
}

export async function getSessionDetail(
	client: PoolClient,
	sessionId: string,
): Promise<SessionDetail | null> {
	const { rows: sessionRows } = await client.query({
		text: `SELECT id, created_at AS "createdAt", consent_version AS "consentVersion"
           FROM sessions WHERE id = $1`,
		values: [sessionId],
	});
	if (!sessionRows.length) return null;

	const { rows: txRows } = await client.query({
		text: `SELECT id, speakers, whisper_run_id AS "whisperRunId", created_at AS "createdAt",
                  pgp_sym_decrypt(content_encrypted, current_setting('app.enc_key')) AS content
           FROM transcriptions WHERE session_id = $1`,
		values: [sessionId],
	});

	const { rows: rptRows } = await client.query({
		text: `SELECT id, vllm_run_id AS "vllmRunId", model_version AS "modelVersion",
                  created_at AS "createdAt",
                  pgp_sym_decrypt(content_encrypted, current_setting('app.enc_key')) AS content
           FROM reports WHERE session_id = $1`,
		values: [sessionId],
	});

	return {
		session: sessionRows[0],
		transcription: txRows[0]
			? { ...txRows[0], segments: txRows[0].speakers as Segment[] }
			: null,
		report: rptRows[0] ?? null,
	};
}

export async function updateTranscriptionSpeakers(
	client: PoolClient,
	transcriptionId: string,
	segments: Segment[],
): Promise<void> {
	await client.query({
		text: `UPDATE transcriptions SET speakers = $2 WHERE id = $1`,
		values: [transcriptionId, JSON.stringify(segments)],
	});
}

export async function exportUserData(
	client: PoolClient,
	_userId: string,
): Promise<UserExport> {
	const { rows: sessions } = await client.query(
		`SELECT id, created_at AS "createdAt", consent_version AS "consentVersion"
     FROM sessions`,
	);
	const { rows: transcriptions } = await client.query(
		`SELECT t.id, t.session_id AS "sessionId", t.speakers AS segments,
            t.whisper_run_id AS "whisperRunId"
     FROM transcriptions t JOIN sessions s ON s.id = t.session_id`,
	);
	const { rows: reports } = await client.query(
		`SELECT r.id, r.session_id AS "sessionId", r.vllm_run_id AS "vllmRunId",
            r.model_version AS "modelVersion",
            pgp_sym_decrypt(r.content_encrypted, current_setting('app.enc_key')) AS content
     FROM reports r JOIN sessions s ON s.id = r.session_id`,
	);
	return { sessions, transcriptions, reports };
}

export async function deleteUserCascade(
	client: PoolClient,
	userId: string,
): Promise<void> {
	await client.query("BEGIN");
	await client.query({
		text: `DELETE FROM sessions WHERE user_id = $1`,
		values: [userId],
	});
	await client.query("COMMIT");
}
