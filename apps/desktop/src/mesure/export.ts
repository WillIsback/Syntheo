import { liveQueryClient } from "~/db";

// Bêta, issue 672 : export pseudonymisé au schéma fermé
// `crates/mesure/schema/export-v1.json`. Des compteurs, des index locaux (mN,
// sN, tN), des rôles de section et des jours comptés depuis l'inscription ;
// aucune date réelle, aucun texte, aucun identifiant interne.

export type ExportRows = {
  enrollment: { pseudonym: string; enrolledAt: string } | null;
  measurements: {
    id: string;
    documentId: string;
    measuredAt: string;
    /** `original` : comparée à la synthèse telle que générée. */
    generatedSource: "original" | "current";
    ruleVersion: number;
    aligned: boolean;
    headingsGenerated: number;
    headingsMatched: number;
    unmatchedSentWords: number;
    total: Counters;
  }[];
  sections: {
    measurementId: string;
    index: number;
    role: "decisions" | "actions" | "other";
    matched: boolean;
    counters: Counters;
  }[];
  /** Générations notées pendant que la mesure était active. */
  generations: {
    documentId: string;
    generatedAt: string;
    exportedAt: string | null;
    sharedAt: string | null;
    /** Close à l'arrêt de la mesure : plus rien ne s'y rattache ensuite. */
    closedAt: string | null;
  }[];
  terms: {
    hash: string;
    index: number;
    inDictionaryFirst: boolean;
    addedSeenAt: string | null;
  }[];
  termErrors: { measurementId: string; termHash: string; count: number }[];
};

type Counters = {
  generated: number;
  added: number;
  deleted: number;
  replaced_content: number;
  replaced_lexical: number;
};

export type BetaExport = {
  schema_version: 1;
  app_version: string;
  rule_version: number;
  rubric_version: 0;
  pseudonym: string;
  enrolled_days: number;
  meetings: {
    meeting: string;
    summary: string;
    day: number;
    mode: "paste";
    aligned: boolean;
    headings_generated: number;
    headings_matched: number;
    unmatched_sent_words: number;
    total: Counters;
    sections: {
      index: number;
      role: "decisions" | "actions" | "other";
      matched: boolean;
      counters: Counters;
    }[];
  }[];
  summaries: {
    summary: string;
    generated_day: number;
    measured: number | null;
    exported: number | null;
    shared: number | null;
  }[];
  terms: {
    term: string;
    added_after: string | null;
    errors: { meeting: string; count: number }[];
  }[];
};

export class ExportError extends Error {}

const APP_VERSION = /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}(-[0-9]{1,4})?$/;
const DAY_MS = 86_400_000;

/** Règle de calcul de la reprise (crate `mesure`, `RULE_VERSION`). */
const RULE_VERSION = 1;

/**
 * Construit l'export à partir des lignes de la base.
 *
 * - Chaque génération notée (pendant que la mesure était active) est une
 *   synthèse `sN` ; une régénération en est une nouvelle.
 * - Une mesure se rattache à la génération de sa synthèse en cours à sa date,
 *   si elle est encore ouverte ; une mesure sans génération notée, ou faite
 *   sur une synthèse retouchée (`current`), n'est pas exportée.
 * - Une génération mesurée donne une réunion `mN` : sa première mesure. Les
 *   réunions suivent l'ordre chronologique de ces mesures, qui sert aussi à
 *   dater l'ajout d'un terme au dictionnaire.
 */
export function buildExport(
  rows: ExportRows,
  appVersion: string,
  now: Date,
): BetaExport {
  if (!rows.enrollment) {
    throw new ExportError("not enrolled");
  }
  if (!APP_VERSION.test(appVersion)) {
    throw new ExportError("unsupported app version");
  }
  const enrolled = Date.parse(rows.enrollment.enrolledAt);
  const day = (at: string) =>
    Math.max(0, Math.floor((Date.parse(at) - enrolled) / DAY_MS));

  const generations = [...rows.generations].sort(
    (a, b) =>
      a.generatedAt.localeCompare(b.generatedAt) ||
      a.documentId.localeCompare(b.documentId),
  );
  const byDocument = new Map<string, typeof generations>();
  for (const generation of generations) {
    const list = byDocument.get(generation.documentId) ?? [];
    list.push(generation);
    byDocument.set(generation.documentId, list);
  }

  // Première mesure de chaque génération, dans l'ordre des mesures.
  type Measurement = ExportRows["measurements"][number];
  const firstMeasurement = new Map<(typeof generations)[number], Measurement>();
  for (const measurement of rows.measurements
    .filter((m) => m.generatedSource === "original")
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))) {
    const candidates = byDocument.get(measurement.documentId) ?? [];
    let generation: (typeof generations)[number] | undefined;
    for (const candidate of candidates) {
      if (candidate.generatedAt <= measurement.measuredAt)
        generation = candidate;
    }
    const open =
      generation &&
      (generation.closedAt === null ||
        measurement.measuredAt < generation.closedAt);
    if (generation && open && !firstMeasurement.has(generation)) {
      firstMeasurement.set(generation, measurement);
    }
  }

  const summaryIndex = new Map(generations.map((g, i) => [g, `s${i + 1}`]));
  const measured = [...firstMeasurement.entries()].sort(([, a], [, b]) =>
    a.measuredAt.localeCompare(b.measuredAt),
  );
  const meetingIndex = new Map(measured.map(([, m], i) => [m.id, `m${i + 1}`]));

  const meetings = measured.map(([generation, m]) => ({
    meeting: meetingIndex.get(m.id) as string,
    summary: summaryIndex.get(generation) as string,
    day: day(m.measuredAt),
    mode: "paste" as const,
    aligned: m.aligned,
    headings_generated: m.headingsGenerated,
    headings_matched: m.headingsMatched,
    unmatched_sent_words: m.unmatchedSentWords,
    total: m.total,
    sections: rows.sections
      .filter((s) => s.measurementId === m.id)
      .sort((a, b) => a.index - b.index)
      .map((s) => ({
        index: s.index,
        role: s.role,
        matched: s.matched,
        counters: s.counters,
      })),
  }));

  const summaries = generations.map((g) => {
    // Un événement antérieur à la génération appartient à une autre.
    const after = (at: string | null) =>
      at !== null &&
      at >= g.generatedAt &&
      (g.closedAt === null || at < g.closedAt)
        ? day(at)
        : null;
    const measurement = firstMeasurement.get(g);
    return {
      summary: summaryIndex.get(g) as string,
      generated_day: day(g.generatedAt),
      measured: measurement ? day(measurement.measuredAt) : null,
      exported: after(g.exportedAt),
      shared: after(g.sharedAt),
    };
  });

  const terms = rows.terms
    .filter((term) => !term.inDictionaryFirst)
    .sort((a, b) => a.index - b.index)
    .flatMap((term) => {
      const errors = rows.termErrors
        .filter(
          (e) => e.termHash === term.hash && meetingIndex.has(e.measurementId),
        )
        .map((e) => ({
          meeting: meetingIndex.get(e.measurementId) as string,
          count: e.count,
        }))
        .sort(
          (a, b) => Number(a.meeting.slice(1)) - Number(b.meeting.slice(1)),
        );
      if (errors.length === 0) return [];
      let addedAfter: string | null = null;
      if (term.addedSeenAt) {
        // Constaté au dictionnaire à une mesure : ajouté après la réunion
        // exportée qui la précède. Avant toute réunion exportée : hors étude.
        const seen = term.addedSeenAt;
        const before = measured.filter(([, m]) => m.measuredAt < seen);
        const previous = before[before.length - 1];
        if (!previous) return [];
        addedAfter = meetingIndex.get(previous[1].id) as string;
      }
      return [{ term: `t${term.index}`, added_after: addedAfter, errors }];
    });

  return {
    schema_version: 1,
    app_version: appVersion,
    rule_version: RULE_VERSION,
    rubric_version: 0,
    pseudonym: rows.enrollment.pseudonym,
    enrolled_days: day(now.toISOString()),
    meetings,
    summaries,
    terms,
  };
}

type CounterRow = {
  generated_words: number;
  added_words: number;
  deleted_words: number;
  replaced_content: number;
  replaced_lexical: number;
};

function counters(row: CounterRow): Counters {
  return {
    generated: row.generated_words,
    added: row.added_words,
    deleted: row.deleted_words,
    replaced_content: row.replaced_content,
    replaced_lexical: row.replaced_lexical,
  };
}

/** Lignes de la base nécessaires à l'export, depuis l'inscription. */
export async function loadExportRows(): Promise<ExportRows> {
  const [enrollment] = await liveQueryClient.execute<{
    pseudonym: string;
    enrolled_at: string;
  }>("SELECT pseudonym, enrolled_at FROM beta_enrollment WHERE id = 1");
  if (!enrollment) {
    return {
      enrollment: null,
      measurements: [],
      sections: [],
      generations: [],
      terms: [],
      termErrors: [],
    };
  }
  const measurements = await liveQueryClient.execute<
    CounterRow & {
      id: string;
      document_id: string;
      measured_at: string;
      generated_source: "original" | "current";
      rule_version: number;
      aligned: number;
      headings_generated: number;
      headings_matched: number;
      unmatched_sent_words: number;
    }
  >(
    `SELECT id, document_id, measured_at, rule_version, aligned,
            headings_generated, headings_matched, unmatched_sent_words,
            generated_words, added_words, deleted_words, replaced_content,
            replaced_lexical, generated_source
     FROM summary_measurements
     WHERE measured_at >= ?`,
    [enrollment.enrolled_at],
  );
  const sections = await liveQueryClient.execute<
    CounterRow & {
      measurement_id: string;
      section_index: number;
      role: "decisions" | "actions" | "other";
      matched: number;
    }
  >(
    `SELECT measurement_id, section_index, role, matched, generated_words,
            added_words, deleted_words, replaced_content, replaced_lexical
     FROM summary_measurement_sections`,
  );
  const generations = await liveQueryClient.execute<{
    document_id: string;
    generated_at: string;
    exported_at: string | null;
    shared_at: string | null;
    closed_at: string | null;
  }>(
    `SELECT document_id, generated_at, exported_at, shared_at, closed_at
     FROM beta_generations
     WHERE generated_at >= ?`,
    [enrollment.enrolled_at],
  );
  const terms = await liveQueryClient.execute<{
    hash: string;
    term_index: number;
    in_dictionary_first: number;
    added_seen_at: string | null;
  }>(
    "SELECT hash, term_index, in_dictionary_first, added_seen_at FROM beta_terms",
  );
  const termErrors = await liveQueryClient.execute<{
    measurement_id: string;
    term_hash: string;
    count: number;
  }>("SELECT measurement_id, term_hash, count FROM beta_term_errors");
  return {
    enrollment: {
      pseudonym: enrollment.pseudonym,
      enrolledAt: enrollment.enrolled_at,
    },
    measurements: measurements.map((m) => ({
      id: m.id,
      documentId: m.document_id,
      measuredAt: m.measured_at,
      generatedSource: m.generated_source,
      ruleVersion: m.rule_version,
      aligned: m.aligned === 1,
      headingsGenerated: m.headings_generated,
      headingsMatched: m.headings_matched,
      unmatchedSentWords: m.unmatched_sent_words,
      total: counters(m),
    })),
    sections: sections.map((s) => ({
      measurementId: s.measurement_id,
      index: s.section_index,
      role: s.role,
      matched: s.matched === 1,
      counters: counters(s),
    })),
    generations: generations.map((g) => ({
      documentId: g.document_id,
      generatedAt: g.generated_at,
      exportedAt: g.exported_at,
      sharedAt: g.shared_at,
      closedAt: g.closed_at,
    })),
    terms: terms.map((t) => ({
      hash: t.hash,
      index: t.term_index,
      inDictionaryFirst: t.in_dictionary_first === 1,
      addedSeenAt: t.added_seen_at,
    })),
    termErrors: termErrors.map((e) => ({
      measurementId: e.measurement_id,
      termHash: e.term_hash,
      count: e.count,
    })),
  };
}
