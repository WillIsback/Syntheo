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
  summaries: {
    documentId: string;
    generatedAt: string;
    exportedAt: string | null;
    sharedAt: string | null;
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
 * Construit l'export à partir des lignes de la base. Une seule mesure par
 * synthèse (la plus récente), dans l'ordre des mesures.
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
  const optionalDay = (at: string | null) => (at === null ? null : day(at));

  // Dernière mesure de chaque synthèse, dans l'ordre des mesures.
  const latest = new Map<string, ExportRows["measurements"][number]>();
  for (const measurement of [...rows.measurements].sort((a, b) =>
    a.measuredAt.localeCompare(b.measuredAt),
  )) {
    latest.set(measurement.documentId, measurement);
  }
  const measured = [...latest.values()].sort((a, b) =>
    a.measuredAt.localeCompare(b.measuredAt),
  );
  const firstMeasured = new Map<string, string>();
  for (const measurement of rows.measurements) {
    const previous = firstMeasured.get(measurement.documentId);
    if (!previous || measurement.measuredAt < previous) {
      firstMeasured.set(measurement.documentId, measurement.measuredAt);
    }
  }

  // Synthèses générées depuis l'inscription, et toute synthèse mesurée.
  const summaryRows = new Map(rows.summaries.map((s) => [s.documentId, s]));
  for (const measurement of measured) {
    if (!summaryRows.has(measurement.documentId)) {
      summaryRows.set(measurement.documentId, {
        documentId: measurement.documentId,
        generatedAt: rows.enrollment.enrolledAt,
        exportedAt: null,
        sharedAt: null,
      });
    }
  }
  const summaries = [...summaryRows.values()].sort(
    (a, b) =>
      a.generatedAt.localeCompare(b.generatedAt) ||
      a.documentId.localeCompare(b.documentId),
  );
  const summaryIndex = new Map(
    summaries.map((s, i) => [s.documentId, `s${i + 1}`]),
  );

  const meetingIndex = new Map(measured.map((m, i) => [m.id, `m${i + 1}`]));
  const meetings = measured.map((m) => {
    const generatedDay = day(
      summaryRows.get(m.documentId)?.generatedAt ?? m.measuredAt,
    );
    return {
      meeting: meetingIndex.get(m.id) as string,
      summary: summaryIndex.get(m.documentId) as string,
      // Une mesure n'est jamais datée avant la génération de sa synthèse.
      day: Math.max(day(m.measuredAt), generatedDay),
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
    };
  });

  const exportedSummaries = summaries.map((s) => {
    const generatedDay = day(s.generatedAt);
    const after = (at: string | null) => {
      const value = optionalDay(at);
      return value === null ? null : Math.max(value, generatedDay);
    };
    return {
      summary: summaryIndex.get(s.documentId) as string,
      generated_day: generatedDay,
      measured: after(firstMeasured.get(s.documentId) ?? null),
      exported: after(s.exportedAt),
      shared: after(s.sharedAt),
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
        // Constaté au dictionnaire à une mesure : ajouté après la mesure
        // précédente. Ajouté avant toute mesure exportée : hors de l'étude.
        const before = measured.filter(
          (m) => m.measuredAt < (term.addedSeenAt as string),
        );
        const previous = before[before.length - 1];
        if (!previous) return [];
        addedAfter = meetingIndex.get(previous.id) as string;
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
    summaries: exportedSummaries,
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
      summaries: [],
      terms: [],
      termErrors: [],
    };
  }
  const measurements = await liveQueryClient.execute<
    CounterRow & {
      id: string;
      document_id: string;
      measured_at: string;
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
            replaced_lexical
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
  const summaries = await liveQueryClient.execute<{
    document_id: string;
    generated_at: string;
    exported_at: string | null;
    shared_at: string | null;
  }>(
    `SELECT generated.document_id, generated.generated_at,
            event.exported_at, event.shared_at
     FROM summary_generated_bodies AS generated
     LEFT JOIN beta_summary_events AS event
       ON event.document_id = generated.document_id
     WHERE generated.generated_at >= ?`,
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
    summaries: summaries.map((s) => ({
      documentId: s.document_id,
      generatedAt: s.generated_at,
      exportedAt: s.exported_at,
      sharedAt: s.shared_at,
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
