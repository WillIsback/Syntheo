import { createHuman } from "~/contacts/queries";
import { liveQueryClient } from "~/db";
import { addSessionParticipant } from "~/session/queries";
import {
  normalizeSubtitleSpeakerName,
  type SubtitleSpeaker,
} from "~/stt/subtitle-import";

type HumanCandidateRow = {
  id: string;
  name: string;
  is_participant: number | boolean;
};

/**
 * Le contact de chaque voix d'un fichier de sous-titres (issue 785), choisi
 * comme dans « Nommer les intervenants » : un participant de la note du même
 * nom, sinon un contact du même nom, sinon un contact créé. Le contact
 * rejoint les participants de la note. Une voix qui échoue reste un
 * locuteur anonyme distinct.
 */
export async function resolveSubtitleSpeakerHumans({
  sessionId,
  ownerUserId,
  speakers,
}: {
  sessionId: string;
  ownerUserId: string;
  speakers: SubtitleSpeaker[];
}): Promise<Map<string, string>> {
  const humanIdByName = new Map<string, string>();
  if (speakers.length === 0) {
    return humanIdByName;
  }

  const rows = await liveQueryClient.execute<HumanCandidateRow>(
    `
      SELECT
        human.id,
        human.name,
        EXISTS (
          SELECT 1
          FROM session_participants AS participant
          WHERE participant.session_id = ?
            AND participant.human_id = human.id
            AND participant.source <> 'excluded'
            AND participant.deleted_at IS NULL
        ) AS is_participant
      FROM humans AS human
      WHERE human.deleted_at IS NULL
        AND human.name <> ''
      ORDER BY is_participant DESC, human.created_at, human.id
    `,
    [sessionId],
  );

  const candidateByName = new Map<
    string,
    { id: string; isParticipant: boolean }
  >();
  for (const row of rows) {
    const key = normalizeSubtitleSpeakerName(row.name);
    if (!candidateByName.has(key)) {
      candidateByName.set(key, {
        id: row.id,
        isParticipant: Boolean(row.is_participant),
      });
    }
  }

  for (const speaker of speakers) {
    const key = normalizeSubtitleSpeakerName(speaker.name);
    try {
      const candidate = candidateByName.get(key);
      const humanId =
        candidate?.id ??
        (await createHuman({
          ownerUserId: ownerUserId || undefined,
          name: speaker.name,
          entryPoint: "speaker_assignment",
        }));
      if (!candidate?.isParticipant) {
        await addSessionParticipant(sessionId, humanId);
      }
      humanIdByName.set(key, humanId);
    } catch (error) {
      console.error("[upload] subtitle speaker not linked:", error);
    }
  }

  return humanIdByName;
}
