import { describe, expect, it } from "vitest";

import { FOLDER_SUGGESTION_BANNER_ENABLED } from "./activation";
import {
  FOLDER_SUGGESTION_MIN_PRECISION,
  isFolderSuggestionReliable,
  measureFolderSuggestion,
} from "./measure";
import type { SuggestionNote } from "./rule";

function filed(
  id: string,
  folderPath: string,
  title: string,
  participants: string[] = [],
): SuggestionNote {
  return {
    id,
    title,
    folderPath,
    createdAt: `2026-11-0${id.length}T10:00:00Z`,
    participantIds: participants,
    templateId: "",
  };
}

describe("activation threshold", () => {
  it("requires a measured precision of at least 90 %", () => {
    expect(FOLDER_SUGGESTION_MIN_PRECISION).toBe(0.9);
    expect(isFolderSuggestionReliable(0.9)).toBe(true);
    expect(isFolderSuggestionReliable(0.95)).toBe(true);
    expect(isFolderSuggestionReliable(0.899)).toBe(false);
    expect(isFolderSuggestionReliable(null)).toBe(false);
  });

  it("keeps the banner off until a reliable measure is recorded", () => {
    expect(FOLDER_SUGGESTION_BANNER_ENABLED).toBe(false);
  });
});

describe("measureFolderSuggestion", () => {
  it("replays the rule on each filed note, as if it were not filed", () => {
    const result = measureFolderSuggestion({
      notes: [
        filed("a", "Atlas", "Revue Atlas"),
        filed("bb", "Atlas", "Revue Atlas"),
        // Mêmes participants que Atlas, mais rangée ailleurs : mauvais dossier.
        filed("ccc", "Borée", "Atelier", ["ana"]),
        filed("dddd", "Atlas", "Point", ["ana"]),
        // Seule dans son dossier, sans participant : aucune suggestion.
        filed("eeeee", "Seule", "Unique"),
        // Non rangée : hors mesure.
        filed("ffffff", "", "Revue Atlas"),
      ],
      folderTemplates: new Map(),
    });

    expect(result).toMatchObject({
      filedNotes: 5,
      folders: 3,
      suggestions: 4,
      correct: 2,
      precision: 0.5,
      recall: 0.4,
      withoutSuggestion: 1,
      reasons: {
        title: { made: 2, correct: 2 },
        participants: { made: 2, correct: 0 },
        template: { made: 0, correct: 0 },
      },
      failures: {
        wrongFolder: 2,
        wrongFolderTrueWasCandidate: 0,
        noSuggestion: 1,
        noSuggestionAloneInFolder: 1,
        noSuggestionWithoutParticipants: 1,
      },
    });
  });

  it("reports no precision when no suggestion is made", () => {
    const result = measureFolderSuggestion({
      notes: [filed("a", "Atlas", "Revue")],
      folderTemplates: new Map(),
    });
    expect(result.precision).toBeNull();
    expect(result.recall).toBe(0);
    expect(isFolderSuggestionReliable(result.precision)).toBe(false);
  });
});
