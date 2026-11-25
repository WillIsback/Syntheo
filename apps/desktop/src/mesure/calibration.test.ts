import { describe, expect, it } from "vitest";

import type { DifferenceRow } from "@syntheo/plugin-mesure";

import {
  agreementMatrix,
  agreementPercent,
  labeledCount,
  labeledWords,
  matrixToTsv,
  type TrueClass,
  weightedAgreementPercent,
} from "./calibration";

const row = (lexical: boolean, weight = 1): DifferenceRow => ({
  section: 0,
  kind: "replaced",
  lexical,
  weight,
  generated: "Martin",
  sent: "Marten",
});

describe("agreementMatrix", () => {
  it("counts agreement between the automatic and the chosen class", () => {
    const rows = [row(true), row(true), row(false), row(false), row(false)];
    const labels = new Map<number, TrueClass>([
      [0, "lexical"],
      [1, "content"],
      [2, "content"],
      [3, "lexical"],
      // 4 : non classée, ignorée.
    ]);
    const matrix = agreementMatrix(rows, labels, 1);
    expect(matrix).toEqual({
      ruleVersion: 1,
      autoContentTrueContent: 1,
      autoContentTrueLexical: 1,
      autoLexicalTrueContent: 1,
      autoLexicalTrueLexical: 1,
      words: {
        autoContentTrueContent: 1,
        autoContentTrueLexical: 1,
        autoLexicalTrueContent: 1,
        autoLexicalTrueLexical: 1,
      },
      artefacts: 0,
      artefactWords: 0,
    });
    expect(labeledCount(matrix)).toBe(4);
    expect(agreementPercent(matrix)).toBe(50);
  });

  // Issue 735 : un artefact (fausse différence) sort de la matrice et se
  // compte à part ; l'accord pondéré en mots suit le poids de chaque ligne.
  it("leaves artefacts out of the matrix and weighs agreement by words", () => {
    const rows = [row(true, 1), row(false, 9), row(false, 2), row(true, 40)];
    const labels = new Map<number, TrueClass>([
      [0, "lexical"],
      [1, "lexical"],
      [2, "content"],
      [3, "artefact"],
    ]);
    const matrix = agreementMatrix(rows, labels, 2);
    expect(labeledCount(matrix)).toBe(3);
    expect(matrix.autoLexicalTrueLexical).toBe(1);
    expect(matrix.autoLexicalTrueContent).toBe(0);
    expect(matrix.artefacts).toBe(1);
    expect(matrix.artefactWords).toBe(40);
    expect(agreementPercent(matrix)).toBeCloseTo(200 / 3);
    // 1 + 2 mots d'accord sur 12 mots classés.
    expect(labeledWords(matrix)).toBe(12);
    expect(weightedAgreementPercent(matrix)).toBe(25);
    const tsv = matrixToTsv(matrix);
    expect(tsv).toContain("artefacts\t1");
    expect(tsv).toContain("mots_artefacts\t40");
    expect(tsv).toContain("accord_pondere_pourcent\t25.0");
    expect(tsv).toContain("classees\t3");
  });

  it("has no agreement with only artefacts", () => {
    const matrix = agreementMatrix(
      [row(true)],
      new Map([[0, "artefact" as const]]),
      1,
    );
    expect(labeledCount(matrix)).toBe(0);
    expect(agreementPercent(matrix)).toBeNull();
    expect(weightedAgreementPercent(matrix)).toBeNull();
    expect(matrixToTsv(matrix)).toContain("accord_pondere_pourcent\t-");
  });

  it("copies numbers only, never excerpts", () => {
    const matrix = agreementMatrix(
      [row(true)],
      new Map([[0, "lexical" as const]]),
      1,
    );
    const tsv = matrixToTsv(matrix);
    expect(tsv).not.toContain("Martin");
    for (const line of tsv.split("\n")) {
      const [key, value] = line.split("\t");
      expect(key).toMatch(/^[a-z_]+$/);
      expect(value === "-" || Number.isFinite(Number(value))).toBe(true);
    }
    expect(tsv).toContain("accord_pourcent\t100.0");
  });
});
