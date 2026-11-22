import { describe, expect, it } from "vitest";

import type { MeasureResult } from "@syntheo/plugin-mesure";

import { calibrationStatement, measurementStatements } from "./storage";

const result: MeasureResult = {
  ruleVersion: 1,
  aligned: true,
  headingsGenerated: 3,
  headingsMatched: 3,
  total: {
    generated: 28,
    added: 3,
    deleted: 2,
    replacedContent: 4,
    replacedLexical: 1,
  },
  sections: [
    {
      index: 0,
      matched: true,
      counters: {
        generated: 11,
        added: 0,
        deleted: 0,
        replacedContent: 3,
        replacedLexical: 0,
      },
    },
  ],
  unmatchedSentWords: 0,
  contentPerMille: 321.4,
  lexicalPerMille: 35.7,
};

const ID = "0b9f2c1e-4d3a-4b5c-8d7e-1f2a3b4c5d6e";

// Aucune chaîne libre n'est enregistrée : seulement des nombres et les
// identifiants de la mesure, de la synthèse et de la réunion.
describe("measurement storage", () => {
  it("writes counters and identifiers only", () => {
    const statements = measurementStatements(
      ID,
      {
        sessionId: "session-1",
        documentId: "doc-1",
        generatedSource: "original",
      },
      result,
    );
    expect(statements).toHaveLength(2);
    for (const { params } of statements) {
      for (const value of params) {
        if (typeof value === "string") {
          expect([ID, "session-1", "doc-1", "original"]).toContain(value);
        } else {
          expect(Number.isInteger(value)).toBe(true);
        }
      }
    }
  });

  it("writes the calibration matrix as counts only", () => {
    const { params } = calibrationStatement(ID, {
      ruleVersion: 1,
      autoContentTrueContent: 150,
      autoContentTrueLexical: 12,
      autoLexicalTrueContent: 9,
      autoLexicalTrueLexical: 40,
    });
    expect(params).toEqual([ID, 1, 150, 12, 9, 40]);
  });
});
