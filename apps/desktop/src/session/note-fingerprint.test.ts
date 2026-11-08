import { describe, expect, it } from "vitest";

import { noteFingerprint, noteChangedSinceSummary } from "./note-fingerprint";

const doc = (...paragraphs: string[]) =>
  JSON.stringify({
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: text ? [{ type: "text", text }] : [],
    })),
  });

describe("noteFingerprint", () => {
  it("is stable for the same text", () => {
    expect(noteFingerprint(doc("Budget validé", "Relancer Paul"))).toBe(
      noteFingerprint(doc("Budget validé", "Relancer Paul")),
    );
  });

  it("changes when the text of the note changes", () => {
    expect(noteFingerprint(doc("Budget validé"))).not.toBe(
      noteFingerprint(doc("Budget refusé")),
    );
  });

  it("ignores formatting and empty lines", () => {
    const bold = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Budget ", marks: [{ type: "bold" }] },
            { type: "text", text: "validé" },
          ],
        },
        { type: "paragraph" },
      ],
    });
    expect(noteFingerprint(bold)).toBe(noteFingerprint(doc("Budget validé")));
  });

  it("reads a Markdown note like its ProseMirror form", () => {
    expect(noteFingerprint("Budget validé", "markdown")).toBe(
      noteFingerprint(doc("Budget validé")),
    );
  });

  it("treats an empty body as an empty note", () => {
    expect(noteFingerprint("")).toBe(noteFingerprint(doc("")));
  });
});

describe("noteChangedSinceSummary", () => {
  it("is false when the summary has no recorded fingerprint", () => {
    expect(noteChangedSinceSummary(doc("Budget validé"), null)).toBe(false);
  });

  it("compares the current note with the one used for the summary", () => {
    const used = noteFingerprint(doc("Budget validé"));
    expect(noteChangedSinceSummary(doc("Budget validé"), used)).toBe(false);
    expect(
      noteChangedSinceSummary(doc("Budget validé", "Relancer Paul"), used),
    ).toBe(true);
  });
});
