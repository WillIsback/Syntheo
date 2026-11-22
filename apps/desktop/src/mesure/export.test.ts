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
const OTHER = "summary:other";
const counters = (g: number, a: number, s: number, rf: number, rl: number) => ({
  generated: g,
  added: a,
  deleted: s,
  replaced_content: rf,
  replaced_lexical: rl,
});
const at = (day: number, hour = 9) =>
  new Date(Date.UTC(2026, 10, 22 + day, hour)).toISOString();

type Measurement = ExportRows["measurements"][number];
function measurement(
  id: string,
  documentId: string,
  measuredAt: string,
): Measurement {
  return {
    id,
    documentId,
    measuredAt,
    generatedSource: "original",
    ruleVersion: 1,
    aligned: true,
    headingsGenerated: 3,
    headingsMatched: 3,
    unmatchedSentWords: 0,
    total: counters(28, 3, 2, 4, 1),
  };
}

function sections(measurementId: string): ExportRows["sections"] {
  return [
    {
      measurementId,
      index: 0,
      role: "other",
      matched: true,
      counters: counters(11, 0, 0, 3, 0),
    },
    {
      measurementId,
      index: 1,
      role: "decisions",
      matched: true,
      counters: counters(11, 3, 0, 1, 1),
    },
    {
      measurementId,
      index: 2,
      role: "actions",
      matched: true,
      counters: counters(6, 0, 2, 0, 0),
    },
  ];
}

function rows(): ExportRows {
  return {
    enrollment: {
      pseudonym: "p-3f9a1c0e7b2d4f6a8c1e3b5d7f9a2c4e",
      enrolledAt: at(0, 8),
    },
    measurements: [
      measurement("m-first", DOC, at(2)),
      // Remesure de la même génération : seule la première compte.
      measurement("m-again", DOC, at(3)),
    ],
    sections: [...sections("m-first"), ...sections("m-again")],
    generations: [
      {
        documentId: DOC,
        generatedAt: at(1, 10),
        exportedAt: null,
        sharedAt: at(1, 11),
        closedAt: null,
      },
      {
        documentId: OTHER,
        generatedAt: at(4, 10),
        exportedAt: null,
        sharedAt: null,
        closedAt: null,
      },
    ],
    terms: [
      {
        hash: HASH_A,
        index: 4821,
        inDictionaryFirst: false,
        addedSeenAt: null,
      },
      // Déjà au dictionnaire à sa première correction : hors de l'étude.
      { hash: HASH_B, index: 77, inDictionaryFirst: true, addedSeenAt: null },
    ],
    termErrors: [
      { measurementId: "m-first", termHash: HASH_A, count: 1 },
      { measurementId: "m-first", termHash: HASH_B, count: 1 },
    ],
  };
}

const NOW = new Date(at(21, 8));

describe("buildExport", () => {
  it("builds a valid, coherent export-v1 file", async () => {
    const data = buildExport(rows(), "0.8.0", NOW);
    expect(await checkExport(data)).toEqual({ export: data });
    expect(data.enrolled_days).toBe(21);
    expect(data.meetings).toHaveLength(1);
    expect(data.meetings[0]).toMatchObject({
      meeting: "m1",
      summary: "s1",
      day: 2,
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
      {
        term: "t4821",
        added_after: null,
        errors: [{ meeting: "m1", count: 1 }],
      },
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
      "m-first",
    ]) {
      expect(json).not.toContain(leak);
    }
  });

  // Revue 0.8.0, constats 1 et 3 : générer, mesurer, régénérer, mesurer,
  // exporter ; puis une régénération sans nouvelle mesure. L'agrégation
  // accepte le fichier.
  it("a summary regenerated after its measurement still gives a coherent file", async () => {
    const input: ExportRows = {
      ...rows(),
      measurements: [
        measurement("a1", DOC, at(1)),
        measurement("b1", OTHER, at(2)),
        measurement("a2", DOC, at(4)),
      ],
      sections: [],
      generations: [
        {
          documentId: DOC,
          generatedAt: at(0, 10),
          exportedAt: null,
          sharedAt: null,
          closedAt: null,
        },
        {
          documentId: OTHER,
          generatedAt: at(2, 8),
          exportedAt: null,
          sharedAt: null,
          closedAt: null,
        },
        {
          documentId: DOC,
          generatedAt: at(3),
          exportedAt: null,
          sharedAt: null,
          closedAt: null,
        },
        // Régénérée encore, sans mesure.
        {
          documentId: DOC,
          generatedAt: at(10),
          exportedAt: null,
          sharedAt: null,
          closedAt: null,
        },
      ],
      termErrors: [],
    };
    const data = buildExport(input, "0.8.0", NOW);
    expect(await checkExport(data)).toEqual({ export: data });
    expect(data.meetings.map((m) => [m.meeting, m.summary, m.day])).toEqual([
      ["m1", "s1", 1],
      ["m2", "s2", 2],
      ["m3", "s3", 4],
    ]);
    expect(data.summaries.map((s) => [s.generated_day, s.measured])).toEqual([
      [0, 1],
      [2, 2],
      [3, 4],
      [10, null],
    ]);
  });

  // Revue 0.8.0, constat 10 : la copie d'une génération ne passe pas sur la
  // régénération suivante.
  it("keeps each event on its own generation", async () => {
    const input: ExportRows = {
      ...rows(),
      measurements: [],
      sections: [],
      generations: [
        {
          documentId: DOC,
          generatedAt: at(0, 10),
          exportedAt: null,
          sharedAt: at(0, 11),
          closedAt: null,
        },
        {
          documentId: DOC,
          generatedAt: at(10),
          exportedAt: null,
          sharedAt: null,
          closedAt: null,
        },
      ],
      termErrors: [],
    };
    const data = buildExport(input, "0.8.0", NOW);
    expect(await checkExport(data)).toEqual({ export: data });
    expect(data.summaries.map((s) => s.shared)).toEqual([0, null]);
  });

  // Revue 0.8.0, constats 2 et 4 : une mesure dont la génération n'a pas été
  // notée (mesure désactivée à la génération) n'est pas exportée.
  it("leaves out a measurement whose generation was not recorded", async () => {
    const input = rows();
    input.measurements.push(measurement("m-off", "summary:off", at(5)));
    input.termErrors.push({
      measurementId: "m-off",
      termHash: HASH_A,
      count: 1,
    });
    const data = buildExport(input, "0.8.0", NOW);
    expect(await checkExport(data)).toEqual({ export: data });
    expect(data.meetings).toHaveLength(1);
    expect(data.terms[0].errors).toEqual([{ meeting: "m1", count: 1 }]);
  });

  // Vérification 0.8.0, point 3 : la mesure est désactivée (génération
  // close), la synthèse régénérée ou restaurée pendant ce temps, puis la
  // mesure réactivée. Ni la mesure ni le partage d'après ne passent sur la
  // génération close, et une mesure sur une synthèse retouchée ne compte pas.
  it("nothing attaches to a generation closed when measurement stopped", async () => {
    const input: ExportRows = {
      ...rows(),
      measurements: [
        measurement("after-reactivation", DOC, at(6)),
        {
          ...measurement("retouched", OTHER, at(7)),
          generatedSource: "current",
        },
      ],
      sections: [],
      generations: [
        {
          documentId: DOC,
          generatedAt: at(1),
          exportedAt: null,
          sharedAt: at(6),
          closedAt: at(3),
        },
        {
          documentId: OTHER,
          generatedAt: at(2),
          exportedAt: null,
          sharedAt: null,
          closedAt: null,
        },
      ],
      termErrors: [],
    };
    const data = buildExport(input, "0.8.0", NOW);
    expect(await checkExport(data)).toEqual({ export: data });
    expect(data.meetings).toEqual([]);
    // La génération close au jour 3, inutilisée avant, n'est pas exportée
    // (fenêtre de 7 jours non observée) ; celle mesurée sur une synthèse
    // retouchée reste, non mesurée.
    expect(data.summaries).toEqual([
      {
        summary: "s1",
        generated_day: 2,
        measured: null,
        exported: null,
        shared: null,
      },
    ]);
  });

  // Vérification 0.8.0 (second tour), point 5 : une génération close avant
  // la fin de sa fenêtre de 7 jours et inutilisée avant la clôture n'est pas
  // exportée ; utilisée avant, ou close après ses 7 jours, elle l'est.
  it("leaves out a generation closed before its window was observed", async () => {
    const input: ExportRows = {
      ...rows(),
      measurements: [],
      sections: [],
      generations: [
        {
          documentId: "summary:unused",
          generatedAt: at(1),
          exportedAt: null,
          sharedAt: null,
          closedAt: at(3),
        },
        {
          documentId: "summary:shared",
          generatedAt: at(1),
          exportedAt: null,
          sharedAt: at(2),
          closedAt: at(3),
        },
        {
          documentId: "summary:late",
          generatedAt: at(1),
          exportedAt: null,
          sharedAt: null,
          closedAt: at(9),
        },
        {
          documentId: "summary:shared-after",
          generatedAt: at(1, 12),
          exportedAt: null,
          sharedAt: at(4),
          closedAt: at(3),
        },
      ],
      termErrors: [],
    };
    const data = buildExport(input, "0.8.0", NOW);
    expect(await checkExport(data)).toEqual({ export: data });
    // Ordre : date de génération, puis identifiant (« late » avant « shared »).
    expect(data.summaries).toEqual([
      {
        summary: "s1",
        generated_day: 1,
        measured: null,
        exported: null,
        shared: null,
      },
      {
        summary: "s2",
        generated_day: 1,
        measured: null,
        exported: null,
        shared: 2,
      },
    ]);
  });

  // Vérification 0.8.0 (second tour), point 6 : G1 mesurée puis close ; G2
  // générée et mesurée après la réactivation : deux réunions, fichier accepté.
  it("a generation measured after reactivation sits beside the closed one", async () => {
    const input: ExportRows = {
      ...rows(),
      measurements: [
        measurement("g1", DOC, at(2)),
        measurement("g2", DOC, at(6)),
      ],
      sections: [],
      generations: [
        {
          documentId: DOC,
          generatedAt: at(1),
          exportedAt: null,
          sharedAt: null,
          closedAt: at(3),
        },
        {
          documentId: DOC,
          generatedAt: at(5),
          exportedAt: null,
          sharedAt: null,
          closedAt: null,
        },
      ],
      termErrors: [],
    };
    const data = buildExport(input, "0.8.0", NOW);
    expect(await checkExport(data)).toEqual({ export: data });
    expect(data.meetings.map((m) => [m.meeting, m.summary, m.day])).toEqual([
      ["m1", "s1", 2],
      ["m2", "s2", 6],
    ]);
  });

  // Revue 0.8.0, constat 11 : A mesurée (entrée du terme), ajout au
  // dictionnaire constaté à la mesure de B, A remesurée ensuite. Le terme
  // reste, ajouté après m1 (A).
  it("dates the dictionary addition in the chronological order of measurements", async () => {
    const input: ExportRows = {
      ...rows(),
      measurements: [
        measurement("a1", DOC, at(2)),
        measurement("b1", OTHER, at(5)),
        measurement("a-again", DOC, at(6)),
      ],
      sections: [],
      generations: [
        {
          documentId: DOC,
          generatedAt: at(1),
          exportedAt: null,
          sharedAt: null,
          closedAt: null,
        },
        {
          documentId: OTHER,
          generatedAt: at(4),
          exportedAt: null,
          sharedAt: null,
          closedAt: null,
        },
      ],
      terms: [
        {
          hash: HASH_A,
          index: 12,
          inDictionaryFirst: false,
          addedSeenAt: at(5),
        },
      ],
      termErrors: [
        { measurementId: "a1", termHash: HASH_A, count: 1 },
        { measurementId: "b1", termHash: HASH_A, count: 1 },
      ],
    };
    const data = buildExport(input, "0.8.0", NOW);
    expect(await checkExport(data)).toEqual({ export: data });
    expect(data.terms).toEqual([
      {
        term: "t12",
        added_after: "m1",
        errors: [
          { meeting: "m1", count: 1 },
          { meeting: "m2", count: 1 },
        ],
      },
    ]);
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
