// « Préparer la note » (issue 491) : la note de la prochaine réunion, rangée
// dans le dossier, avec le titre habituel du dossier, ses participants
// habituels et l'ordre du jour dans les notes de préparation. Elle s'ouvre à
// l'étape Préparer (note pas encore écoutée). Aucune date n'est devinée.

import type { JSONContent } from "@syntheo/editor/markdown";

import type { FolderMeeting } from "./meetings";

import { liveQueryClient } from "~/db";
import { addSessionParticipant, createSession } from "~/session/queries";
import { useTabs } from "~/store/zustand/tabs";

// Réunions regardées pour le titre et les participants habituels.
export const USUAL_TITLE_MEETINGS = 8;
export const USUAL_PARTICIPANT_MEETINGS = 5;

function mostRecentFirst(meetings: readonly FolderMeeting[]) {
  return [...meetings].sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

// Titre le plus fréquent des dernières réunions ; à égalité, le plus récent.
export function usualMeetingTitle(meetings: readonly FolderMeeting[]): string {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const meeting of mostRecentFirst(meetings).slice(
    0,
    USUAL_TITLE_MEETINGS,
  )) {
    const title = meeting.title.replace(/\s+/g, " ").trim();
    if (!title) continue;
    if (!counts.has(title)) order.push(title);
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const title of order) {
    const count = counts.get(title)!;
    if (count > bestCount) {
      best = title;
      bestCount = count;
    }
  }
  return best;
}

export type MeetingParticipantRow = { session_id: string; human_id: string };

// Participants habituels : présents dans au moins la moitié des dernières
// réunions qui ont des participants, les plus assidus d'abord (à égalité,
// dans l'ordre de la réunion la plus récente).
export function usualParticipants(
  meetings: readonly FolderMeeting[],
  rows: readonly MeetingParticipantRow[],
): string[] {
  const recent = mostRecentFirst(meetings).slice(0, USUAL_PARTICIPANT_MEETINGS);
  const bySession = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.human_id) continue;
    const list = bySession.get(row.session_id) ?? [];
    if (!list.includes(row.human_id)) list.push(row.human_id);
    bySession.set(row.session_id, list);
  }
  const withParticipants = recent.filter((m) => bySession.has(m.id));
  if (withParticipants.length === 0) return [];
  const threshold = Math.ceil(withParticipants.length / 2);
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const meeting of withParticipants) {
    for (const humanId of bySession.get(meeting.id)!) {
      if (!counts.has(humanId)) order.push(humanId);
      counts.set(humanId, (counts.get(humanId) ?? 0) + 1);
    }
  }
  return order
    .filter((humanId) => counts.get(humanId)! >= threshold)
    .sort((left, right) => counts.get(right)! - counts.get(left)!);
}

export async function loadMeetingParticipants(
  sessionIds: readonly string[],
): Promise<MeetingParticipantRow[]> {
  if (sessionIds.length === 0) return [];
  return liveQueryClient.execute<MeetingParticipantRow>(
    `
      SELECT participant.session_id, participant.human_id
      FROM session_participants AS participant
      JOIN humans AS human
        ON human.id = participant.human_id AND human.deleted_at IS NULL
      WHERE participant.deleted_at IS NULL
        AND participant.human_id <> ''
        AND participant.session_id IN (SELECT value FROM json_each(?))
      ORDER BY participant.created_at, participant.id
    `,
    [JSON.stringify(sessionIds)],
  );
}

function demoteTitles(block: JSONContent): JSONContent {
  return block.type === "heading" && block.attrs?.level === 1
    ? { ...block, attrs: { ...block.attrs, level: 3 } }
    : block;
}

// Notes de préparation : le titre (première ligne de la note), puis une
// section « Ordre du jour » qui reprend l'ordre du jour tel qu'il est, liens
// vers les réunions sources compris.
export function preparationDoc({
  title,
  agenda,
  agendaHeading,
}: {
  title: string;
  agenda: JSONContent | null;
  agendaHeading: string;
}): JSONContent {
  const titleBlock: JSONContent = title
    ? {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: title }],
      }
    : { type: "heading", attrs: { level: 1 } };
  const agendaBlocks = (agenda?.content ?? []).map(demoteTitles);
  return {
    type: "doc",
    content: [
      titleBlock,
      ...(agendaBlocks.length > 0
        ? [
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: agendaHeading }],
            },
            ...agendaBlocks,
          ]
        : []),
      { type: "paragraph" },
    ],
  };
}

export async function prepareNextNote({
  folderPath,
  meetings,
  agenda,
  agendaHeading,
}: {
  folderPath: string;
  meetings: readonly FolderMeeting[];
  agenda: JSONContent | null;
  agendaHeading: string;
}): Promise<string> {
  const title = usualMeetingTitle(meetings);
  const recent = mostRecentFirst(meetings).slice(0, USUAL_PARTICIPANT_MEETINGS);
  const participants = usualParticipants(
    meetings,
    await loadMeetingParticipants(recent.map((meeting) => meeting.id)),
  );
  const sessionId = await createSession(title, undefined, {
    folder_id: folderPath,
    raw_md: JSON.stringify(preparationDoc({ title, agenda, agendaHeading })),
  });
  for (const humanId of participants) {
    await addSessionParticipant(sessionId, humanId);
  }
  useTabs.getState().openNew({ type: "sessions", id: sessionId });
  return sessionId;
}
