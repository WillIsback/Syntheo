import { describe, expect, it } from "vitest";

import {
  type FiledNote,
  normalizeMeetingTitle,
  suggestFolderBySameTitle,
} from "./folder-suggestion";

function note(
  id: string,
  title: string,
  folder: string,
  createdAt = "2026-11-01T10:00:00Z",
): FiledNote {
  return { id, title, folder_path: folder, created_at: createdAt };
}

describe("normalizeMeetingTitle", () => {
  it("ignores case, accents, punctuation and spaces", () => {
    expect(normalizeMeetingTitle("  Point   HÉBDO — Atlas ! ")).toBe(
      "point hebdo atlas",
    );
  });

  it("removes dates and numbers", () => {
    const expected = "point hebdo atlas";
    for (const title of [
      "Point hebdo Atlas 2 nov.",
      "Point hebdo Atlas — 1er mars 2026",
      "Point hebdo Atlas 26/10/2026",
      "2026-11-09 Point hebdo Atlas",
      "Point hebdo Atlas (nov 2026)",
      "Point hebdo Atlas #12",
    ]) {
      expect(normalizeMeetingTitle(title)).toBe(expected);
    }
    expect(normalizeMeetingTitle("Atelier 3e")).toBe("atelier");
    expect(normalizeMeetingTitle("Sprint review 3rd")).toBe("sprint review");
  });

  it("keeps a month name that is not part of a date", () => {
    expect(normalizeMeetingTitle("Point mars")).toBe("point mars");
    expect(normalizeMeetingTitle("Décisions 2 décembre")).toBe("decisions");
  });

  it("is empty for a title made of a date only", () => {
    expect(normalizeMeetingTitle("09/11/2026")).toBe("");
    expect(normalizeMeetingTitle("")).toBe("");
  });
});

describe("suggestFolderBySameTitle", () => {
  const base = {
    sessionId: "current",
    title: "Point hebdo Atlas 9 nov.",
    currentFolder: "",
  };

  it("suggests the folder of a note with the same normalized title", () => {
    expect(
      suggestFolderBySameTitle({
        ...base,
        notes: [
          note("a", "point hebdo atlas — 2 nov.", "Réunion produit Atlas"),
          note("b", "Point hebdo Boréal", "Clients/Boréal"),
        ],
      }),
    ).toBe("Réunion produit Atlas");
  });

  it("prefers the folder with the most notes of that title, then the latest", () => {
    const notes = [
      note("a", "Point hebdo Atlas", "Atlas", "2026-10-01T10:00:00Z"),
      note("b", "Point hebdo Atlas", "Atlas", "2026-10-08T10:00:00Z"),
      note("c", "Point hebdo Atlas", "Archive", "2026-11-02T10:00:00Z"),
    ];
    expect(suggestFolderBySameTitle({ ...base, notes })).toBe("Atlas");
    expect(suggestFolderBySameTitle({ ...base, notes: notes.slice(1) })).toBe(
      "Archive",
    );
  });

  it("suggests nothing for another title, an empty title or the note itself", () => {
    const notes = [note("current", "Point hebdo Atlas", "Atlas")];
    expect(suggestFolderBySameTitle({ ...base, notes })).toBeNull();
    expect(
      suggestFolderBySameTitle({
        ...base,
        notes: [note("a", "Point hebdo Boréal", "Boréal")],
      }),
    ).toBeNull();
    expect(
      suggestFolderBySameTitle({
        ...base,
        title: "12/11",
        notes: [note("a", "", "Atlas"), note("b", "05/11", "Atlas")],
      }),
    ).toBeNull();
  });

  it("suggests nothing when the note is already in that folder", () => {
    expect(
      suggestFolderBySameTitle({
        ...base,
        currentFolder: "Atlas/",
        notes: [note("a", "Point hebdo Atlas", "Atlas")],
      }),
    ).toBeNull();
  });
});
