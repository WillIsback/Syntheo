// Mesure de la règle de suggestion (issue 499) : on rejoue la règle sur les
// notes déjà rangées. Chaque note est virtuellement retirée de son dossier,
// puis on regarde si la règle propose ce dossier à partir des autres notes.
// Ne produit que des compteurs : aucun titre ni participant n'en sort.

import {
  type FolderSuggestionReason,
  type SuggestionNote,
  suggestFolderAfterMeeting,
} from "./rule.ts";

// Seuil d'activation de la bannière : précision minimale mesurée.
export const FOLDER_SUGGESTION_MIN_PRECISION = 0.9;

export function isFolderSuggestionReliable(precision: number | null): boolean {
  return precision !== null && precision >= FOLDER_SUGGESTION_MIN_PRECISION;
}

type ReasonCount = { made: number; correct: number };

type FolderSuggestionMeasure = {
  filedNotes: number;
  folders: number;
  suggestions: number;
  correct: number;
  // Suggestions justes / suggestions faites (null sans suggestion).
  precision: number | null;
  // Notes avec une suggestion juste / notes rangées (null sans note).
  recall: number | null;
  withoutSuggestion: number;
  reasons: Record<FolderSuggestionReason, ReasonCount>;
  failures: {
    wrongFolder: number;
    // Parmi les mauvais dossiers : le bon dossier était aussi candidat.
    wrongFolderTrueWasCandidate: number;
    noSuggestion: number;
    // Parmi les notes sans suggestion : seule note de son dossier.
    noSuggestionAloneInFolder: number;
    // Parmi les notes sans suggestion : aucun participant hors propriétaire.
    noSuggestionWithoutParticipants: number;
  };
};

export function measureFolderSuggestion({
  notes,
  folderTemplates,
}: {
  notes: readonly SuggestionNote[];
  folderTemplates: ReadonlyMap<string, string>;
}): FolderSuggestionMeasure {
  const filed = notes.filter((note) => note.folderPath);
  const folderSizes = new Map<string, number>();
  for (const note of filed) {
    folderSizes.set(
      note.folderPath,
      (folderSizes.get(note.folderPath) ?? 0) + 1,
    );
  }

  const reasons: Record<FolderSuggestionReason, ReasonCount> = {
    title: { made: 0, correct: 0 },
    participants: { made: 0, correct: 0 },
    template: { made: 0, correct: 0 },
  };
  const failures = {
    wrongFolder: 0,
    wrongFolderTrueWasCandidate: 0,
    noSuggestion: 0,
    noSuggestionAloneInFolder: 0,
    noSuggestionWithoutParticipants: 0,
  };
  let suggestions = 0;
  let correct = 0;

  for (const note of filed) {
    const suggestion = suggestFolderAfterMeeting({
      note,
      filedNotes: notes,
      folderTemplates,
    });
    if (!suggestion) {
      failures.noSuggestion += 1;
      if (folderSizes.get(note.folderPath) === 1) {
        failures.noSuggestionAloneInFolder += 1;
      }
      if (note.participantIds.length === 0) {
        failures.noSuggestionWithoutParticipants += 1;
      }
      continue;
    }
    suggestions += 1;
    const isCorrect = suggestion.folderPath === note.folderPath;
    if (isCorrect) {
      correct += 1;
    } else {
      failures.wrongFolder += 1;
      // Le bon dossier aurait-il été proposé seul ? On rejoue sans le
      // dossier choisi à tort.
      const fallback = suggestFolderAfterMeeting({
        note,
        filedNotes: notes.filter(
          (other) => other.folderPath !== suggestion.folderPath,
        ),
        folderTemplates,
      });
      if (fallback?.folderPath === note.folderPath) {
        failures.wrongFolderTrueWasCandidate += 1;
      }
    }
    for (const reason of suggestion.reasons) {
      reasons[reason].made += 1;
      if (isCorrect) reasons[reason].correct += 1;
    }
  }

  return {
    filedNotes: filed.length,
    folders: folderSizes.size,
    suggestions,
    correct,
    precision: suggestions > 0 ? correct / suggestions : null,
    recall: filed.length > 0 ? correct / filed.length : null,
    withoutSuggestion: failures.noSuggestion,
    reasons,
    failures,
  };
}
