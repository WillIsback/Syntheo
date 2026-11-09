import { isFolderSuggestionReliable } from "./measure.ts";

// Précision mesurée par `scripts/mesure-suggestion-dossier.mjs` sur la base
// de William (issue 499). Mesure du 2026-11-09 : 7 notes, dont 1 seule rangée,
// seule dans son dossier et sans participant ; aucune suggestion possible,
// précision non mesurable. La bannière reste donc désactivée. Relancer la
// mesure quand la base contient assez de notes rangées, puis reporter ici la
// précision obtenue (par exemple 0.93).
export const MEASURED_FOLDER_SUGGESTION_PRECISION: number | null = null;

export const FOLDER_SUGGESTION_BANNER_ENABLED = isFolderSuggestionReliable(
  MEASURED_FOLDER_SUGGESTION_PRECISION,
);
