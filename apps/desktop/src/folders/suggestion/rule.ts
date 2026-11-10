// Suggestion de dossier après la réunion (issue 499). Règle déterministe,
// sans IA, calculée à l'arrêt de l'écoute pour une note non rangée :
// - un dossier est candidat si l'une de ses notes a le même titre normalisé,
//   ou si au moins la moitié des participants de la note figurent parmi ceux
//   des notes du dossier ;
// - le modèle de compte rendu de la note renforce le score d'un candidat s'il
//   est le modèle par défaut de ce seul dossier.
// Fonction pure : l'application et `scripts/mesure-suggestion-dossier.mjs`
// l'appellent telle quelle. Les imports restent relatifs et sans dépendance
// pour que Node la charge sans Vite.

import { normalizeMeetingTitle } from "../../session/components/living-document/meeting-title.ts";

export type FolderSuggestionReason = "title" | "participants" | "template";

export type SuggestionNote = {
  id: string;
  title: string;
  // Dossier exact de la note, vide si elle n'est pas rangée.
  folderPath: string;
  createdAt: string;
  // Participants hors propriétaire de la note (identifiants de contact).
  participantIds: readonly string[];
  // Modèle choisi sur la note, vide sinon.
  templateId: string;
};

export type FolderSuggestion = {
  folderPath: string;
  reasons: FolderSuggestionReason[];
  score: number;
};

// Part minimale des participants de la note déjà vus dans le dossier.
const MIN_PARTICIPANT_OVERLAP = 0.5;

const TITLE_SCORE = 2;
const TEMPLATE_SCORE = 0.5;

type Candidate = {
  folderPath: string;
  sameTitleNotes: number;
  participants: Set<string>;
  latest: string;
};

export function suggestFolderAfterMeeting({
  note,
  filedNotes,
  folderTemplates,
}: {
  note: Pick<SuggestionNote, "id" | "title" | "participantIds" | "templateId">;
  filedNotes: readonly SuggestionNote[];
  // Chemin du dossier → modèle par défaut propre au dossier (non vide).
  folderTemplates: ReadonlyMap<string, string>;
}): FolderSuggestion | null {
  const wantedTitle = normalizeMeetingTitle(note.title);
  const wantedParticipants = new Set(note.participantIds.filter(Boolean));

  const folders = new Map<string, Candidate>();
  for (const filed of filedNotes) {
    if (filed.id === note.id || !filed.folderPath) continue;
    let folder = folders.get(filed.folderPath);
    if (!folder) {
      folder = {
        folderPath: filed.folderPath,
        sameTitleNotes: 0,
        participants: new Set(),
        latest: "",
      };
      folders.set(filed.folderPath, folder);
    }
    if (wantedTitle && normalizeMeetingTitle(filed.title) === wantedTitle) {
      folder.sameTitleNotes += 1;
    }
    for (const id of filed.participantIds) folder.participants.add(id);
    if (filed.createdAt > folder.latest) folder.latest = filed.createdAt;
  }

  const templateFolder = soleFolderWithTemplate(
    note.templateId,
    folderTemplates,
  );

  let best: (FolderSuggestion & { candidate: Candidate }) | null = null;
  for (const candidate of folders.values()) {
    const reasons: FolderSuggestionReason[] = [];
    let score = 0;
    if (candidate.sameTitleNotes > 0) {
      reasons.push("title");
      score += TITLE_SCORE;
    }
    const overlap = participantOverlap(
      wantedParticipants,
      candidate.participants,
    );
    if (overlap >= MIN_PARTICIPANT_OVERLAP) {
      reasons.push("participants");
      score += overlap;
    }
    if (reasons.length === 0) continue;
    if (templateFolder === candidate.folderPath) {
      reasons.push("template");
      score += TEMPLATE_SCORE;
    }
    if (!best || isBetter({ score, candidate }, best)) {
      best = { folderPath: candidate.folderPath, reasons, score, candidate };
    }
  }

  if (!best) return null;
  return {
    folderPath: best.folderPath,
    reasons: best.reasons,
    score: best.score,
  };
}

function participantOverlap(
  wanted: ReadonlySet<string>,
  seen: ReadonlySet<string>,
): number {
  if (wanted.size === 0) return 0;
  let shared = 0;
  for (const id of wanted) if (seen.has(id)) shared += 1;
  return shared / wanted.size;
}

function soleFolderWithTemplate(
  templateId: string,
  folderTemplates: ReadonlyMap<string, string>,
): string | null {
  if (!templateId) return null;
  let found: string | null = null;
  for (const [folderPath, folderTemplateId] of folderTemplates) {
    if (folderTemplateId !== templateId) continue;
    if (found) return null;
    found = folderPath;
  }
  return found;
}

// À score égal : le dossier avec le plus de notes de même titre, puis celui
// de la note la plus récente, puis l'ordre alphabétique (stable).
function isBetter(
  next: { score: number; candidate: Candidate },
  current: { score: number; candidate: Candidate },
): boolean {
  if (next.score !== current.score) return next.score > current.score;
  const a = next.candidate;
  const b = current.candidate;
  if (a.sameTitleNotes !== b.sameTitleNotes) {
    return a.sameTitleNotes > b.sameTitleNotes;
  }
  if (a.latest !== b.latest) return a.latest > b.latest;
  return a.folderPath < b.folderPath;
}
