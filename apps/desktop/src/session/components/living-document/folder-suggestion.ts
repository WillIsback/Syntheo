// Suggestion de dossier à l'étape Préparer (issue 498) : le dossier qui
// contient déjà une note de même titre. Déterministe, sans modèle : les
// titres sont comparés après normalisation (casse, accents, ponctuation,
// espaces, dates et numéros retirés). Rien n'est rangé tant que l'utilisateur ne
// clique pas sur la suggestion.

import { useLiveQuery } from "~/db";
import { normalizeFolderPath } from "~/session/folders";

const MONTHS = [
  "janvier",
  "janv",
  "fevrier",
  "fevr",
  "fev",
  "mars",
  "avril",
  "avr",
  "mai",
  "juin",
  "juillet",
  "juil",
  "aout",
  "septembre",
  "sept",
  "octobre",
  "novembre",
  "decembre",
  "january",
  "jan",
  "february",
  "feb",
  "march",
  "mar",
  "april",
  "apr",
  "may",
  "june",
  "jun",
  "july",
  "jul",
  "august",
  "aug",
  "september",
  "sep",
  "october",
  "oct",
  "november",
  "nov",
  "december",
  "dec",
].join("|");

// Un mois n'est retiré que collé à un nombre (« 2 nov. », « 1er mars »,
// « nov 2026 ») : « Point mars » garde son mot.
const DATE_WITH_MONTH = new RegExp(
  `\\d+(?:er)?\\s*(?:${MONTHS})\\b|\\b(?:${MONTHS})\\s*\\d+`,
  "g",
);
// Nombres (dates, numéros de séance), ordinal compris (« 2e », « 3rd »).
const NUMBER = /\d+(?:er|re|eme|e|st|nd|rd|th)?\b|\d+/g;

export function normalizeMeetingTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("fr")
    .replace(DATE_WITH_MONTH, " ")
    .replace(NUMBER, " ")
    .replace(/[^\p{L}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type FiledNote = {
  id: string;
  title: string;
  folder_path: string;
  created_at: string;
};

// Le dossier qui a le plus de notes de même titre (à égalité, celui de la
// note la plus récente). Aucun dossier si le titre est vide une fois
// normalisé, ou si la note est déjà dans ce dossier.
export function suggestFolderBySameTitle({
  sessionId,
  title,
  currentFolder,
  notes,
}: {
  sessionId: string;
  title: string;
  currentFolder: string;
  notes: readonly FiledNote[];
}): string | null {
  const wanted = normalizeMeetingTitle(title);
  if (!wanted) return null;

  const byFolder = new Map<string, { count: number; latest: string }>();
  for (const note of notes) {
    if (note.id === sessionId) continue;
    const folder = normalizeFolderPath(note.folder_path);
    if (!folder) continue;
    if (normalizeMeetingTitle(note.title) !== wanted) continue;
    const entry = byFolder.get(folder) ?? { count: 0, latest: "" };
    entry.count += 1;
    if (note.created_at > entry.latest) entry.latest = note.created_at;
    byFolder.set(folder, entry);
  }

  let best: string | null = null;
  let bestEntry = { count: 0, latest: "" };
  for (const [folder, entry] of byFolder) {
    if (
      entry.count > bestEntry.count ||
      (entry.count === bestEntry.count && entry.latest > bestEntry.latest)
    ) {
      best = folder;
      bestEntry = entry;
    }
  }
  const current = normalizeFolderPath(currentFolder) ?? "";
  return best && best !== current ? best : null;
}

const EMPTY_NOTES: FiledNote[] = [];

// Lu seulement quand le sélecteur est ouvert (le composant qui l'appelle
// n'est monté qu'à ce moment-là).
export function useSameTitleFolderSuggestion({
  sessionId,
  title,
  currentFolder,
}: {
  sessionId: string;
  title: string;
  currentFolder: string;
}): string | null {
  const { data = EMPTY_NOTES } = useLiveQuery<FiledNote, FiledNote[]>({
    sql: `
      SELECT id, title, folder_path, created_at
      FROM sessions
      WHERE deleted_at IS NULL
        AND folder_path != ''
        AND title != ''
    `,
    enabled: Boolean(sessionId),
  });
  return suggestFolderBySameTitle({
    sessionId,
    title,
    currentFolder,
    notes: data,
  });
}
