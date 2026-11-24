import { executeTransaction, liveQueryClient, useLiveQuery } from "~/db";
import { isNoSpeechDetectedError } from "~/stt/no-speech-error";

// Issue 559 : l'échec de la transcription d'un audio importé est gardé dans la
// note (`sessions.metadata_json.transcription_failure`). L'état du listener
// est en mémoire : sans cette trace, la note redevenait vierge à la relance.
type TranscriptionFailure = {
  // « no_speech » se traduit à l'affichage ; les autres échecs gardent le
  // message reçu.
  code: string | null;
  message: string;
};

const RECORD_SQL = `
  UPDATE sessions
  SET metadata_json = json_set(
        CASE WHEN json_valid(metadata_json) THEN metadata_json ELSE '{}' END,
        '$.transcription_failure',
        json(?)
      ),
      updated_at = ?
  WHERE id = ? AND deleted_at IS NULL
`;

const CLEAR_SQL = `
  UPDATE sessions
  SET metadata_json = json_remove(metadata_json, '$.transcription_failure'),
      updated_at = ?
  WHERE id = ?
    AND deleted_at IS NULL
    AND json_valid(metadata_json)
    AND json_type(metadata_json, '$.transcription_failure') IS NOT NULL
`;

const SELECT_SQL = `
  SELECT CAST(json_extract(metadata_json, '$.transcription_failure') AS TEXT)
    AS failure
  FROM sessions
  WHERE id = ? AND deleted_at IS NULL AND json_valid(metadata_json)
  LIMIT 1
`;

/** Code d'un import interrompu par la fermeture de Syntheo (issue 714). */
export const INTERRUPTED_IMPORT_CODE = "interrupted";

function toTranscriptionFailure(
  error: unknown,
  code?: string,
): TranscriptionFailure {
  return {
    code: code ?? (isNoSpeechDetectedError(error) ? "no_speech" : null),
    message: error instanceof Error ? error.message : String(error),
  };
}

export async function recordTranscriptionFailure(
  sessionId: string,
  error: unknown,
  code?: string,
): Promise<void> {
  await executeTransaction([
    {
      sql: RECORD_SQL,
      params: [
        JSON.stringify(toTranscriptionFailure(error, code)),
        new Date().toISOString(),
        sessionId,
      ],
    },
  ]);
}

// Issue 714 : un import en cours n'existe qu'en mémoire. Un marqueur dans la
// note (`metadata_json.transcription_pending`) survit à une fermeture de
// Syntheo ; au lancement suivant, une note marquée que le natif ne reprend
// pas est passée en échec « interrompu », avec un avis unique.
const MARK_PENDING_SQL = `
  UPDATE sessions
  SET metadata_json = json_set(
        CASE WHEN json_valid(metadata_json) THEN metadata_json ELSE '{}' END,
        '$.transcription_pending',
        json(?)
      )
  WHERE id = ? AND deleted_at IS NULL
`;

const CLEAR_PENDING_SQL = `
  UPDATE sessions
  SET metadata_json = json_remove(metadata_json, '$.transcription_pending')
  WHERE id = ?
    AND json_valid(metadata_json)
    AND json_type(metadata_json, '$.transcription_pending') IS NOT NULL
`;

const LIST_PENDING_SQL = `
  SELECT id,
    CAST(json_extract(metadata_json, '$.transcription_pending.file_name') AS TEXT)
      AS file_name
  FROM sessions
  WHERE deleted_at IS NULL
    AND json_valid(metadata_json)
    AND json_type(metadata_json, '$.transcription_pending') IS NOT NULL
`;

export async function markImportPending(
  sessionId: string,
  fileName: string | null,
): Promise<void> {
  await executeTransaction([
    {
      sql: MARK_PENDING_SQL,
      params: [
        JSON.stringify({
          file_name: fileName,
          started_at: new Date().toISOString(),
        }),
        sessionId,
      ],
    },
  ]);
}

export async function clearImportPending(sessionId: string): Promise<void> {
  await executeTransaction([{ sql: CLEAR_PENDING_SQL, params: [sessionId] }]);
}

export async function listPendingImports(): Promise<
  { sessionId: string; fileName: string | null }[]
> {
  const rows = await liveQueryClient.execute<{
    id: string;
    file_name: string | null;
  }>(LIST_PENDING_SQL);
  return rows.map((row) => ({ sessionId: row.id, fileName: row.file_name }));
}

export async function clearTranscriptionFailure(
  sessionId: string,
): Promise<void> {
  await executeTransaction([
    { sql: CLEAR_SQL, params: [new Date().toISOString(), sessionId] },
  ]);
}

function parseFailure(value: unknown): TranscriptionFailure | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Partial<TranscriptionFailure>;
    return typeof parsed.message === "string"
      ? {
          code: typeof parsed.code === "string" ? parsed.code : null,
          message: parsed.message,
        }
      : null;
  } catch {
    return null;
  }
}

export function useTranscriptionFailure(
  sessionId: string,
): TranscriptionFailure | null {
  const { data } = useLiveQuery<
    { failure: string | null },
    TranscriptionFailure | null
  >({
    sql: SELECT_SQL,
    params: [sessionId],
    enabled: Boolean(sessionId),
    mapRows: (rows) => parseFailure(rows[0]?.failure),
  });
  return data ?? null;
}
