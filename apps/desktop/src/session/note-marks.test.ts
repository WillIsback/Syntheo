import { describe, expect, it } from "vitest";

import {
  extractNoteMarks,
  NOTE_MARK_CLOSE,
  NOTE_MARK_OPEN,
  stripNoteMarks,
} from "./note-marks";

const hasMark = (text: string) =>
  text.includes(NOTE_MARK_OPEN) || text.includes(NOTE_MARK_CLOSE);

describe("extractNoteMarks", () => {
  it("returns the text without marks and the marked passages", () => {
    const result = extractNoteMarks(
      "# Budget\n\n- ⟦Le budget de 50 000 €⟧ est validé par ⟦Mme Kowalczyk⟧.\n- Le fournisseur démarre en mai.",
    );

    expect(result.text).toBe(
      "# Budget\n\n- Le budget de 50 000 € est validé par Mme Kowalczyk.\n- Le fournisseur démarre en mai.",
    );
    expect(result.passages).toEqual(["Le budget de 50 000 €", "Mme Kowalczyk"]);
  });

  it("returns null passages when the model marked nothing", () => {
    const result = extractNoteMarks("# Résumé\n\n- Rien de balisé.");

    expect(result.passages).toBeNull();
    expect(result.text).toBe("# Résumé\n\n- Rien de balisé.");
  });

  it("gives the plain text of a passage that wraps Markdown", () => {
    const result = extractNoteMarks(
      "- ⟦**Budget** validé⟧ et ⟦_Jean Dupond_⟧ relance.",
    );

    expect(result.text).toBe("- **Budget** validé et _Jean Dupond_ relance.");
    expect(result.passages).toEqual(["Budget validé", "Jean Dupond"]);
  });

  it("drops an unclosed mark without a trace", () => {
    const result = extractNoteMarks(
      "- ⟦Mme Kowalczyk valide\n- Le fournisseur ⟦démarre⟧ en mai.",
    );

    expect(result.text).toBe(
      "- Mme Kowalczyk valide\n- Le fournisseur démarre en mai.",
    );
    expect(result.passages).toEqual(["démarre"]);
  });

  it("keeps only the innermost passage of nested marks", () => {
    const result = extractNoteMarks("- ⟦Le budget ⟦Kowalczyk⟧ validé⟧.");

    expect(hasMark(result.text)).toBe(false);
    expect(result.text).toBe("- Le budget Kowalczyk validé.");
    expect(result.passages).toEqual(["Kowalczyk"]);
  });

  it("drops a stray closing mark and the spaces the model put inside marks", () => {
    const result = extractNoteMarks(
      "- Le budget⟧ est validé par ⟦ Mme Kowalczyk ⟧.",
    );

    expect(result.text).toBe("- Le budget est validé par Mme Kowalczyk.");
    expect(result.passages).toEqual(["Mme Kowalczyk"]);
  });

  it("keeps passages that hold no text out of the list", () => {
    const result = extractNoteMarks("- Point ⟦⟧ et ⟦**⟧.");

    expect(hasMark(result.text)).toBe(false);
    expect(result.passages).toEqual([]);
  });
});

describe("stripNoteMarks", () => {
  it("removes every mark, even while the text is still streaming", () => {
    expect(stripNoteMarks("- ⟦Mme Kowalczyk⟧ valide le ⟦budg")).toBe(
      "- Mme Kowalczyk valide le budg",
    );
    expect(stripNoteMarks("Sans balise.")).toBe("Sans balise.");
  });
});
