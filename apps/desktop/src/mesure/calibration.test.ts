import { describe, expect, it } from "vitest";

import type { DifferenceRow } from "@syntheo/plugin-mesure";

import {
  agreementMatrix,
  agreementPercent,
  labeledCount,
  matrixToTsv,
  type TrueClass,
} from "./calibration";

const row = (lexical: boolean): DifferenceRow => ({
  section: 0,
  kind: "replaced",
  lexical,
  weight: 1,
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
    });
    expect(labeledCount(matrix)).toBe(4);
    expect(agreementPercent(matrix)).toBe(50);
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
