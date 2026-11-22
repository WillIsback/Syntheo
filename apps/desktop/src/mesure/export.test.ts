import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { buildExport, ExportError, type ExportRows } from "./export";

// Contrôle de l'outil d'agrégation (issue 673) : schéma export-v1 et
// cohérence. Lancé dans Node : sous jsdom, le script ne trouve pas son schéma.
// Vitest tourne depuis apps/desktop : la racine est deux niveaux au-dessus.
async function checkExport(
  data: unknown,
): Promise<{ refus?: string; detail?: string; export?: unknown }> {
  const script = pathToFileURL(
    join(process.cwd(), "..", "..", "scripts/beta/agregation.mjs"),
  ).href;
  const out = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { checkExport } from ${JSON.stringify(script)};
       let s = ""; process.stdin.on("data", (c) => (s += c));
       process.stdin.on("end", () => process.stdout.write(JSON.stringify(checkExport(JSON.parse(s)))));`,
    ],
    { input: JSON.stringify(data), encoding: "utf8" },
  );
  return JSON.parse(out) as {
    refus?: string;
    detail?: string;
    export?: unknown;
  };
}

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const SESSION = "5f0c2a7e-1b3d-4c6e-9a8b-7d6e5f4a3b2c";
const DOC = `summary:${SESSION}`;
const counters = (g: number, a: number, s: number, rf: number, rl: number) => ({
  generated: g,
  added: a,
  deleted: s,
  replaced_content: rf,
  replaced_lexical: rl,
});

function rows(): ExportRows {
  return {
    enrollment: {
      pseudonym: "p-3f9a1c0e7b2d4f6a8c1e3b5d7f9a2c4e",
      enrolledAt: "2026-11-22T08:00:00.000Z",
    },
    measurements: [
      // Mesure plus ancienne de la même synthèse : remplacée par la suivante.
      {
        id: "m-old",
        documentId: DOC,
        measuredAt: "2026-11-24T09:00:00.000Z",
        ruleVersion: 1,
        aligned: true,
        headingsGenerated: 3,
        headingsMatched: 3,
        unmatchedSentWords: 0,
        total: counters(28, 1, 0, 0, 0),
      },
      {
        id: "m-new",
        documentId: DOC,
        measuredAt: "2026-11-25T09:00:00.000Z",
        ruleVersion: 1,
        aligned: true,
        headingsGenerated: 3,
        headingsMatched: 3,
        unmatchedSentWords: 0,
        total: counters(28, 3, 2, 4, 1),
      },
    ],
    sections: [
      {
        measurementId: "m-new",
        index: 0,
        role: "other",
        matched: true,
        counters: counters(11, 0, 0, 3, 0),
      },
      {
        measurementId: "m-new",
        index: 1,
        role: "decisions",
        matched: true,
        counters: counters(11, 3, 0, 1, 1),
      },
      {
        measurementId: "m-new",
        index: 2,
        role: "actions",
        matched: true,
        counters: counters(6, 0, 2, 0, 0),
      },
      {
        measurementId: "m-old",
        index: 0,
        role: "other",
        matched: true,
        counters: counters(28, 1, 0, 0, 0),
      },
    ],
    summaries: [
      {
        documentId: DOC,
        generatedAt: "2026-11-23T10:00:00.000Z",
        exportedAt: null,
        sharedAt: "2026-11-23T11:00:00.000Z",
      },
      {
        documentId: "summary:other",
        generatedAt: "2026-11-26T10:00:00.000Z",
        exportedAt: null,
        sharedAt: null,
      },
    ],
    terms: [
      { hash: HASH_A, index: 1, inDictionaryFirst: false, addedSeenAt: null },
      // Déjà au dictionnaire à sa première correction : hors de l'étude.
      { hash: HASH_B, index: 2, inDictionaryFirst: true, addedSeenAt: null },
    ],
    termErrors: [
      { measurementId: "m-new", termHash: HASH_A, count: 1 },
      { measurementId: "m-new", termHash: HASH_B, count: 1 },
    ],
  };
}

const NOW = new Date("2026-12-13T08:00:00.000Z");

describe("buildExport", () => {
  it("builds a valid, coherent export-v1 file", async () => {
    const data = buildExport(rows(), "0.8.0", NOW);
    expect(await checkExport(data)).toEqual({ export: data });
    expect(data.enrolled_days).toBe(21);
    expect(data.meetings).toHaveLength(1);
    expect(data.meetings[0]).toMatchObject({
      meeting: "m1",
      summary: "s1",
      day: 3,
    });
    expect(data.meetings[0].sections.map((s) => s.role)).toEqual([
      "other",
      "decisions",
      "actions",
    ]);
    expect(data.summaries).toEqual([
      {
        summary: "s1",
        generated_day: 1,
        measured: 2,
        exported: null,
        shared: 1,
      },
      {
        summary: "s2",
        generated_day: 4,
        measured: null,
        exported: null,
        shared: null,
      },
    ]);
    expect(data.terms).toEqual([
      { term: "t1", added_after: null, errors: [{ meeting: "m1", count: 1 }] },
    ]);
  });

  it("never exports identifiers, hashes or real dates", () => {
    const json = JSON.stringify(buildExport(rows(), "0.8.0", NOW));
    for (const leak of [
      SESSION,
      "summary:",
      HASH_A,
      HASH_B,
      "2026-",
      "m-new",
    ]) {
      expect(json).not.toContain(leak);
    }
  });

  it("dates the dictionary addition after the previous meeting", () => {
    const input = rows();
    input.measurements.push({
      ...input.measurements[1],
      id: "m-3",
      documentId: "summary:other",
      measuredAt: "2026-11-27T09:00:00.000Z",
    });
    input.termErrors.push({ measurementId: "m-3", termHash: HASH_A, count: 2 });
    input.terms[0].addedSeenAt = "2026-11-27T09:00:00.000Z";
    const data = buildExport(input, "0.8.0", NOW);
    expect(data.terms[0]).toEqual({
      term: "t1",
      added_after: "m1",
      errors: [
        { meeting: "m1", count: 1 },
        { meeting: "m2", count: 2 },
      ],
    });
  });

  it("refuses to build without enrollment or with an odd app version", () => {
    expect(() =>
      buildExport({ ...rows(), enrollment: null }, "0.8.0", NOW),
    ).toThrow(ExportError);
    expect(() => buildExport(rows(), "0.8.0-nightly", NOW)).toThrow(
      ExportError,
    );
  });

  // Un champ libre fait échouer la validation (critère d'acceptation).
  it("a free field or free text fails the schema", async () => {
    const data = buildExport(rows(), "0.8.0", NOW) as unknown as Record<
      string,
      unknown
    >;
    expect((await checkExport({ ...data, title: "Comité Atlas" })).refus).toBe(
      "hors_schema",
    );
    expect(
      (await checkExport({ ...data, pseudonym: "Alice Martin" })).refus,
    ).toBe("hors_schema");
  });
});
