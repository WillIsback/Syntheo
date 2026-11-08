import { Node as PMNode } from "prosemirror-model";
import { describe, expect, it } from "vitest";

import { md2json } from "@syntheo/editor/markdown";
import { schema } from "@syntheo/editor/note";

import {
  extractNoteLines,
  findNoteSentenceRanges,
  matchSentenceToNote,
  NOTE_MATCH_THRESHOLD,
  prepareNotes,
} from "./note-attribution";

function match(sentence: string, notes: string[]) {
  return matchSentenceToNote(sentence, prepareNotes(notes));
}

function greenTexts(markdown: string, notes: string[]) {
  const doc = PMNode.fromJSON(schema, md2json(markdown));
  return findNoteSentenceRanges(doc, prepareNotes(notes)).map(({ from, to }) =>
    doc.textBetween(from, to),
  );
}

describe("matchSentenceToNote", () => {
  it("keeps the threshold strict", () => {
    expect(NOTE_MATCH_THRESHOLD).toBeGreaterThanOrEqual(0.6);
  });

  it("colors a rewritten note", () => {
    const notes = ["budget valide par direction", "Marc relance fournisseur"];

    expect(match("Le budget a été validé par la direction.", notes)).toBe(0);
    expect(match("Marc relancera le fournisseur.", notes)).toBe(1);
  });

  it("understands shorthand from the notes", () => {
    expect(
      match("Problème de performance de l'API à voir avec Marc.", [
        "pb perf api voir avec Marc",
      ]),
    ).toBe(0);
  });

  it("keeps a transcript addition that shares a few words with a note black", () => {
    const notes = ["budget valide par direction"];

    expect(
      match(
        "La direction souhaite revoir le budget au prochain trimestre.",
        notes,
      ),
    ).toBeNull();
  });

  it("keeps a sentence black when a number differs", () => {
    expect(
      match("Le budget de 60 000 € est validé.", ["budget 50 000 € validé"]),
    ).toBeNull();
    expect(
      match("Livraison prévue le 15 mars.", ["livraison prevue 12 mars"]),
    ).toBeNull();
  });

  it("keeps a sentence black when it adds a number missing from the note", () => {
    expect(
      match("Le budget de 50 000 € est validé par la direction.", [
        "budget validé par direction",
      ]),
    ).toBeNull();
  });

  it("colors a sentence that keeps the numbers and dates of the note", () => {
    expect(
      match("Le budget de 50 000 € est validé.", ["budget 50 000 € validé"]),
    ).toBe(0);
    expect(
      match("La livraison est prévue le 12/03.", ["livraison prevue 12/03"]),
    ).toBe(0);
  });

  it("keeps a sentence black when a name differs", () => {
    expect(
      match("Julie relancera le fournisseur.", ["Marc relance fournisseur"]),
    ).toBeNull();
    expect(
      match("Marc relancera le fournisseur avec Julie.", [
        "Marc relance fournisseur",
      ]),
    ).toBeNull();
  });

  it("keeps a sentence black when two notes are candidates", () => {
    expect(
      match("Le budget est validé.", ["budget validé", "budget validé !"]),
    ).toBeNull();
  });

  it("keeps everything black without notes", () => {
    expect(match("Le budget est validé.", [])).toBeNull();
    expect(match("Le budget est validé.", ["", "   "])).toBeNull();
  });
});

describe("extractNoteLines", () => {
  it("reads one note per line of the raw notes, headings and nested lists included", () => {
    const rawMd = JSON.stringify(
      md2json(
        "# Budget\n\nbudget valide\n\n- relance Marc\n  - devis fournisseur",
      ),
    );

    expect(extractNoteLines(rawMd)).toEqual([
      "Budget",
      "budget valide",
      "relance Marc",
      "devis fournisseur",
    ]);
  });

  it("splits hard line breaks and ignores empty or invalid notes", () => {
    const rawMd = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "point budget" },
            { type: "hardBreak" },
            { type: "text", text: "  " },
            { type: "hardBreak" },
            { type: "text", text: "relance Marc" },
          ],
        },
        { type: "paragraph" },
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "envoyer CR" }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(extractNoteLines(rawMd)).toEqual([
      "point budget",
      "relance Marc",
      "envoyer CR",
    ]);
    expect(extractNoteLines("")).toEqual([]);
    expect(extractNoteLines("not json")).toEqual([]);
  });
});

describe("findNoteSentenceRanges", () => {
  const notes = ["budget valide par direction", "Marc relance fournisseur"];

  it("colors only the sentences that come from a note", () => {
    expect(
      greenTexts(
        "Le budget a été validé par la direction. La direction souhaite revoir le budget au prochain trimestre.",
        notes,
      ),
    ).toEqual(["Le budget a été validé par la direction."]);
  });

  it("works in headings and nested lists, but never on the title", () => {
    expect(
      greenTexts(
        "# Budget\n\n## Budget\n\n- Marc relancera le fournisseur.\n  - Le budget a été validé par la direction.\n  - Le fournisseur livre en avril.",
        ["Budget", ...notes],
      ),
    ).toEqual([
      "Budget",
      "Marc relancera le fournisseur.",
      "Le budget a été validé par la direction.",
    ]);
  });

  it("does not split decimals or abbreviations", () => {
    expect(
      greenTexts("Le taux de 3.5 % est validé par M. Dupont.", [
        "taux 3.5 % valide Dupont",
      ]),
    ).toEqual(["Le taux de 3.5 % est validé par M. Dupont."]);
  });

  it("colors nothing without notes", () => {
    expect(greenTexts("Le budget a été validé par la direction.", [])).toEqual(
      [],
    );
  });
});
