import type {
  CaptureConfigUpdate,
  IdentityAssignment,
} from "@syntheo/plugin-transcription";

import { getTranscriptionLanguages } from "~/stt/capabilities";
import { buildRenderTranscriptRequestFromRows } from "~/stt/render-transcript";
import { parseSpeakerContext } from "~/stt/speaker-context";

export type CaptureIdentitySqlRow = {
  session_id: string;
  owner_user_id: string;
  human_id: string | null;
};

export type LiveTranscriptIdentitySqlRow = {
  id: string;
  started_at_ms: number | string;
  words_json: string;
  speaker_hints_json: string;
  speaker_context: string | null;
};

export const CAPTURE_IDENTITY_SQL = `
  SELECT
    session.id AS session_id,
    session.owner_user_id,
    participant.human_id
  FROM sessions AS session
  LEFT JOIN session_participants AS participant
    ON participant.session_id = session.id
    AND participant.human_id <> ''
    AND participant.source <> 'excluded'
    AND participant.deleted_at IS NULL
    AND participant.human_id <> session.owner_user_id
    AND NOT EXISTS (
      SELECT 1
      FROM humans AS self_human
      LEFT JOIN humans AS participant_human
        ON participant_human.id = participant.human_id
        AND participant_human.deleted_at IS NULL
      LEFT JOIN session_participants AS owner_participant
        ON owner_participant.session_id = session.id
        AND owner_participant.human_id = session.owner_user_id
        AND owner_participant.deleted_at IS NULL
      WHERE self_human.id = session.owner_user_id
        AND self_human.deleted_at IS NULL
        AND (
          (
            NULLIF(lower(COALESCE(
              NULLIF(participant_human.email, ''),
              participant.email
            )), '') IS NOT NULL
            AND (
              (
                NULLIF(lower(self_human.email), '') IS NOT NULL
                AND lower(self_human.email) = lower(COALESCE(
                  NULLIF(participant_human.email, ''),
                  participant.email
                ))
              )
              OR EXISTS (
                SELECT 1
                FROM json_each(CASE
                  WHEN json_valid(self_human.metadata_json)
                    AND json_type(self_human.metadata_json, '$.additionalEmails') = 'array'
                  THEN json_extract(self_human.metadata_json, '$.additionalEmails')
                  ELSE '[]'
                END) AS self_additional_email
                WHERE lower(self_additional_email.value) = lower(COALESCE(
                  NULLIF(participant_human.email, ''),
                  participant.email
                ))
              )
            )
          )
          OR (
            NULLIF(lower(owner_participant.email), '') IS NOT NULL
            AND lower(owner_participant.email) = lower(COALESCE(
              NULLIF(participant_human.email, ''),
              participant.email
            ))
          )
        )
    )
  WHERE session.deleted_at IS NULL
  ORDER BY session.id, participant.human_id
`;

// The capture writes into the session's newest transcript. Speaker hints for
// live words are only materialized into speaker_hints_json by transcript
// mutations (assignments, flushes), so this does not need the delta journal.
export const LIVE_TRANSCRIPT_IDENTITY_SQL = `
  SELECT
    transcript.id,
    transcript.started_at_ms,
    transcript.words_json,
    transcript.speaker_hints_json,
    (
      SELECT json_extract(session.metadata_json, '$.speaker_context')
      FROM sessions AS session
      WHERE session.id = transcript.session_id AND session.deleted_at IS NULL
    ) AS speaker_context
  FROM transcripts AS transcript
  WHERE transcript.session_id = ? AND transcript.deleted_at IS NULL
  ORDER BY transcript.started_at_ms DESC, transcript.created_at DESC
  LIMIT 1
`;

export const LIVE_CAPTURE_CONFIG_DEBOUNCE_MS = 750;

export function getSessionParticipantHumanIds(
  rows: CaptureIdentitySqlRow[],
  sessionId: string,
) {
  const seen = new Set<string>();
  const participantHumanIds: string[] = [];

  for (const row of rows) {
    const humanId = row.human_id;
    if (row.session_id !== sessionId || !humanId || seen.has(humanId)) {
      continue;
    }

    seen.add(humanId);
    participantHumanIds.push(humanId);
  }

  return participantHumanIds;
}

export function getLiveSpeakerAssignments(
  rows: LiveTranscriptIdentitySqlRow[],
  participantHumanIds: string[],
  selfHumanId: string | null,
): IdentityAssignment[] {
  const row = rows[0];
  if (!row) {
    return [];
  }

  const request = buildRenderTranscriptRequestFromRows([
    {
      started_at: Number(row.started_at_ms),
      words: parseJsonArray(row.words_json),
      speaker_hints: parseJsonArray(row.speaker_hints_json),
    },
  ]);
  const assignments = request?.transcripts[0]?.assignments ?? [];

  // render_transcript_segments extends assignments with the participant channel
  // defaults only while no speaker context describes the capture; the live
  // engine has to mirror that or its segments stay anonymous until they settle.
  if (parseSpeakerContext(row.speaker_context).intervals.length > 0) {
    return assignments;
  }
  // Channel-scope assignments are last-write-wins in both renderers, so only
  // synthesize a default for channels without an explicit channel assignment.
  const claimedChannels = new Set(
    assignments
      .map((assignment) =>
        assignment.scope.kind === "channel" ? assignment.scope.channel : null,
      )
      .filter((channel) => channel !== null),
  );
  return [
    ...assignments,
    ...channelAssignmentsForParticipants(
      participantHumanIds,
      selfHumanId,
    ).filter(
      (assignment) =>
        assignment.scope.kind !== "channel" ||
        !claimedChannels.has(assignment.scope.channel),
    ),
  ];
}

// Mirrors `channel_assignments_for_participants` in crates/transcript.
function channelAssignmentsForParticipants(
  participantHumanIds: string[],
  selfHumanId: string | null,
): IdentityAssignment[] {
  if (!selfHumanId) {
    return [];
  }

  const assignments: IdentityAssignment[] = [
    {
      human_id: selfHumanId,
      scope: { kind: "channel", channel: "DirectMic" },
    },
  ];

  const others = [
    ...new Set(
      participantHumanIds.filter(
        (humanId) => humanId && humanId !== selfHumanId,
      ),
    ),
  ];
  if (others.length === 1) {
    assignments.push({
      human_id: others[0]!,
      scope: { kind: "channel", channel: "RemoteParty" },
    });
  }

  return assignments;
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function createCaptureConfigSignature(config: CaptureConfigUpdate) {
  return JSON.stringify(config);
}

function parseStringArray(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value !== "string") {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : fallback;
  } catch {
    return fallback;
  }
}

export function getLiveConfigLanguages(
  aiLanguage: string,
  spokenLanguages: string[],
) {
  return getTranscriptionLanguages(
    aiLanguage || undefined,
    parseStringArray(spokenLanguages, []),
  );
}
