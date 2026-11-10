import { executeTransaction, useLiveQuery } from "~/db";
import { isNoSpeechDetectedError } from "~/stt/no-speech-error";

// Issue 559 : l'échec de la transcription d'un audio importé est gardé dans la
// note (`sessions.metadata_json.transcription_failure`). L'état du listener
// est en mémoire : sans cette trace, la note redevenait vierge à la relance.
export type TranscriptionFailure = {
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

export function toTranscriptionFailure(error: unknown): TranscriptionFailure {
  return {
    code: isNoSpeechDetectedError(error) ? "no_speech" : null,
    message: error instanceof Error ? error.message : String(error),
  };
}

export async function recordTranscriptionFailure(
  sessionId: string,
  error: unknown,
): Promise<void> {
  await executeTransaction([
    {
      sql: RECORD_SQL,
      params: [
        JSON.stringify(toTranscriptionFailure(error)),
        new Date().toISOString(),
        sessionId,
      ],
    },
  ]);
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
