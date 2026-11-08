import { Node as PMNode } from "prosemirror-model";
import { describe, expect, it } from "vitest";

import { md2json } from "@syntheo/editor/markdown";
import { schema } from "@syntheo/editor/note";

import { findNoteInkRanges, prepareNoteInk } from "./note-ink";

function greenTexts(
  markdown: string,
  notes: string[],
  passages: string[] | null = null,
) {
  const doc = PMNode.fromJSON(schema, md2json(markdown));
  return findNoteInkRanges(doc, prepareNoteInk(notes, passages)).map(
    ({ from, to }) => doc.textBetween(from, to),
  );
}

describe("findNoteInkRanges with passages marked by the model", () => {
  // Exemple réel de William : la note donne la bonne orthographe, la
  // transcription non ; la synthèse reprend celle de la note.
  it("colors a name corrected by the notes in the middle of a black sentence", () => {
    expect(
      greenTexts(
        "# Réunion\n\n- Le fournisseur démarre en mai, Mme Kowalczyk enverra le contrat.",
        ["rdv Mme Kowalczyk", "budget 50k ok"],
        ["Mme Kowalczyk"],
      ),
    ).toEqual(["Mme Kowalczyk"]);
  });

  it("finds each passage where the model put it, in order", () => {
    expect(
      greenTexts(
        "- Le budget est validé.\n- Le budget du fournisseur reste ouvert ; le budget de 50k est validé.",
        ["budget 50k ok"],
        ["budget", "le budget de 50k"],
      ),
    ).toEqual(["budget", "le budget de 50k"]);
  });

  it("drops a passage the notes do not back: it stays black", () => {
    expect(
      greenTexts(
        "- Mme Kovalchik enverra le contrat.",
        ["rdv Mme Kowalczyk"],
        ["Mme Kovalchik"],
      ),
    ).toEqual([]);
  });

  it("skips a passage that is no longer in the summary", () => {
    expect(
      greenTexts(
        "- Mme Kowalczyk enverra le contrat.",
        ["rdv Mme Kowalczyk", "budget 50k ok"],
        ["le budget de 50k", "Mme Kowalczyk"],
      ),
    ).toEqual(["Mme Kowalczyk"]);
  });

  it("still colors the fragments from the notes when the model marked passages", () => {
    expect(
      greenTexts(
        "- Le contrat de Mme Kowalczyk est signé, budget de 50k.",
        ["rdv Mme Kowalczyk", "budget 50k ok"],
        [],
      ),
    ).toEqual(["Kowalczyk", "50k"]);
  });

  // Conception validée : un nom de la note passe en vert dans tous les cas,
  // même pris dans une balise rejetée ; le reste du passage reste noir.
  it("keeps a name from the notes green inside a rejected passage", () => {
    expect(
      greenTexts(
        "- Jean Dupuis a validé le planning de livraison du fournisseur.",
        ["appeler Jean Dupuis"],
        ["Jean Dupuis a validé le planning de livraison du fournisseur"],
      ),
    ).toEqual(["Jean Dupuis"]);
  });

  it("still colors a whole sentence that comes from a note", () => {
    expect(
      greenTexts(
        "- Le budget a été validé par la direction. Mme Kowalczyk signe.",
        ["budget valide par direction", "Kowalczyk"],
        ["Kowalczyk"],
      ),
    ).toEqual(["Le budget a été validé par la direction.", "Kowalczyk"]);
  });

  it("never colors the title", () => {
    expect(
      greenTexts("# Kowalczyk\n\n- Rien.", ["Kowalczyk"], ["Kowalczyk"]),
    ).toEqual([]);
  });
});

describe("findNoteInkRanges fallback on fragments (no marks)", () => {
  it("colors names and numbers from the notes inside a black sentence", () => {
    expect(
      greenTexts(
        "- Le fournisseur démarre en mai et Mme Kowalczyk confirme le budget de 50 000 € avec Jean Dupond.",
        ["rdv kowalczyk", "Jean Dupond", "budget 50 000 €"],
      ),
    ).toEqual(["Kowalczyk", "50 000 €", "Jean Dupond"]);
  });

  it("colors several words in a row taken from a note", () => {
    expect(
      greenTexts(
        "- Après discussion, la refonte du portail client sera livrée plus tard que prévu.",
        ["refonte portail client"],
      ),
    ).toEqual(["refonte du portail client"]);
  });

  it("keeps common single words, short numbers and transcript names black", () => {
    expect(
      greenTexts("- Le budget sera revu en 2 étapes avec Julie.", [
        "budget 2 étapes",
        "Marc",
      ]),
    ).toEqual([]);
  });

  it("keeps a capitalized word at the start of a sentence black unless the notes write it as a name", () => {
    expect(
      greenTexts("- Budget à revoir au prochain trimestre.", [
        "budget trimestre",
      ]),
    ).toEqual([]);
    expect(
      greenTexts("- Kowalczyk enverra le contrat.", ["rdv avec Kowalczyk"]),
    ).toEqual(["Kowalczyk"]);
  });

  it("is at least as good as the sentence attribution", () => {
    expect(
      greenTexts(
        "- Le budget a été validé par la direction. La direction souhaite revoir le budget.",
        ["budget valide par direction"],
      ),
    ).toEqual(["Le budget a été validé par la direction."]);
  });

  it("colors nothing without notes", () => {
    expect(greenTexts("- Mme Kowalczyk signe pour 50 000 €.", [])).toEqual([]);
    expect(greenTexts("- Mme Kowalczyk signe.", [], ["Mme Kowalczyk"])).toEqual(
      [],
    );
  });
});
