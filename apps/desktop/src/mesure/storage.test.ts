import { describe, expect, it } from "vitest";

import type { MeasureResult } from "@syntheo/plugin-mesure";

import {
  enrollmentStatement,
  eraseStatements,
  randomPseudonym,
  randomTermIndexes,
  randomTermKey,
  summaryEventStatement,
  termStatements,
} from "./beta";
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
      role: "decisions",
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
  correctedTerms: [{ hash: "a".repeat(64), count: 1 }],
  dictionaryHashes: ["a".repeat(64), "b".repeat(64)],
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
          expect([ID, "session-1", "doc-1", "original", "decisions"]).toContain(
            value,
          );
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
    // Réenregistrer remplace la même ligne (revue du lot 0.8.0, constat 22).
    expect(
      calibrationStatement(ID, {
        ruleVersion: 1,
        autoContentTrueContent: 1,
        autoContentTrueLexical: 0,
        autoLexicalTrueContent: 0,
        autoLexicalTrueLexical: 0,
      }).sql,
    ).toContain("ON CONFLICT(id) DO UPDATE");
  });
});

// Issue 672 : termes par empreinte, jamais en clair ; index tN tirés au
// hasard ; constat d'ajout au dictionnaire.
describe("beta term tracking", () => {
  it("records corrected terms by hash only, with a random index", () => {
    const now = "2026-11-25T09:00:00.000Z";
    const statements = termStatements(
      ID,
      result.correctedTerms,
      result.dictionaryHashes,
      now,
    );
    expect(statements).toHaveLength(3);
    expect(statements[0].sql).toContain("json_each");
    expect(statements[0].sql).not.toContain("MAX(term_index)");
    const [hash, candidates, seenAt, first] = statements[0].params as [
      string,
      string,
      string,
      number,
    ];
    expect([hash, seenAt, first]).toEqual(["a".repeat(64), now, 1]);
    const indexes = JSON.parse(candidates) as number[];
    expect(indexes).toHaveLength(8);
    for (const index of indexes) {
      expect(Number.isInteger(index) && index >= 1 && index <= 99_999).toBe(
        true,
      );
    }
    expect(statements[1].params).toEqual([ID, "a".repeat(64), 1]);
    expect(statements[2].params).toEqual([
      now,
      JSON.stringify(["a".repeat(64), "b".repeat(64)]),
    ]);
  });

  it("draws term indexes over the whole range", () => {
    const drawn = new Set(randomTermIndexes(2000));
    expect(drawn.size).toBeGreaterThan(1900);
    expect([...drawn].some((index) => index > 50_000)).toBe(true);
  });

  it("records a share on the current generation, only when the beta is on", () => {
    const { sql, params } = summaryEventStatement(
      "shared",
      "doc-1",
      "2026-11-25T09:00:00.000Z",
    );
    expect(sql).toContain("measurement_enabled");
    expect(sql).toContain("EXISTS (SELECT 1 FROM beta_enrollment)");
    expect(sql).toContain("ORDER BY generated_at DESC");
    expect(sql).toContain("COALESCE(shared_at");
    expect(params).toEqual(["2026-11-25T09:00:00.000Z", "doc-1"]);
  });

  // Revue 0.8.0, constats 5 et 8 : l'effacement vide aussi les générations et
  // la copie des synthèses générées, et arrête la mesure et le Calibrage.
  it("erases every beta table and turns measurement off", () => {
    const statements = eraseStatements("2026-11-25T09:00:00.000Z");
    const tables = statements
      .filter(({ sql }) => sql.startsWith("DELETE FROM "))
      .map(({ sql }) => sql.replace("DELETE FROM ", ""));
    expect(tables.sort()).toEqual([
      "beta_enrollment",
      "beta_generations",
      "beta_term_errors",
      "beta_terms",
      "calibration_results",
      "summary_generated_bodies",
      "summary_measurement_sections",
      "summary_measurements",
    ]);
    const settings = statements.filter(({ sql }) =>
      sql.includes("app_settings"),
    );
    expect(settings.map(({ params }) => params[0])).toEqual([
      "measurement_enabled",
      "calibration_enabled",
    ]);
    for (const { sql } of settings) expect(sql).toContain("'false'");
  });

  it("enrolls with a random pseudonym and a random 32-byte term key", () => {
    const a = randomPseudonym();
    expect(a).toMatch(/^p-[0-9a-f]{32}$/);
    expect(randomPseudonym()).not.toBe(a);
    const key = randomTermKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(randomTermKey()).not.toBe(key);
    const { params } = enrollmentStatement("2026-11-25T09:00:00.000Z");
    expect(params[2]).toMatch(/^[0-9a-f]{64}$/);
  });
});
