import {
  type MeasureStatus,
  RULE_VERSION,
  type StatusReason,
} from "@syntheo/plugin-mesure";

import { liveQueryClient } from "~/db";

// Bêta, issue 672 : export pseudonymisé au schéma fermé
// `crates/mesure/schema/export-v2.json` (issue 733 : statut et contrôles). Des compteurs, des index locaux (mN,
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
    /** Garde-fous (issue 733) ; `null` pour une mesure d'avant la 0.8.1. */
    guardVersion: number | null;
    status: MeasureStatus | null;
    statusReasons: StatusReason[];
    controls: Controls | null;
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

type Controls = {
  generated_kept_words: number;
  sections_matched_exact: number;
  sections_matched_near: number;
  deleted_section_words: number;
  residual_entities: number;
};

type BetaExport = {
  schema_version: 2;
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
    guard_version: number;
    status: "ok" | "doubtful";
    status_reasons: StatusReason[];
    controls: Controls;
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
/** Fenêtre du taux d'abandon (spec §4) : 7 jours après la génération. */
const ABANDON_WINDOW_MS = 7 * DAY_MS;

/**
 * Construit l'export à partir des lignes de la base.
 *
 * - Chaque génération notée (pendant que la mesure était active) est une
 *   synthèse `sN` ; une régénération en est une nouvelle.
 * - Une mesure se rattache à la génération de sa synthèse en cours à sa date,
 *   si elle est encore ouverte ; une mesure sans génération notée, ou faite
 *   sur une synthèse retouchée (`current`), n'est pas exportée.
 * - Une génération mesurée donne une réunion `mN` : sa première mesure à la
 *   règle courante (`RULE_VERSION` du crate `mesure`, exposé par le plugin)
 *   et non refusée ; une mesure faite sous une règle antérieure n'est jamais
 *   exportée, même si c'est la seule (issue 734), ni une mesure refusée par
 *   les garde-fous (issue 733). Une mesure douteuse est exportée avec son
 *   statut et ses raisons. Pour l'abandon, toute mesure de la synthèse
 *   d'origine compte comme un usage, quels que soient sa règle et son
 *   statut. Les réunions suivent l'ordre
 *   chronologique de ces mesures, qui sert aussi à dater l'ajout d'un terme
 *   au dictionnaire.
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

  // Génération ouverte de la synthèse mesurée, à la date de la mesure.
  type Measurement = ExportRows["measurements"][number];
  type Generation = (typeof generations)[number];
  const generationOf = (measurement: Measurement): Generation | undefined => {
    let generation: Generation | undefined;
    for (const candidate of byDocument.get(measurement.documentId) ?? []) {
      if (candidate.generatedAt <= measurement.measuredAt)
        generation = candidate;
    }
    const open =
      generation &&
      (generation.closedAt === null ||
        measurement.measuredAt < generation.closedAt);
    return open ? generation : undefined;
  };
  const chronological = rows.measurements
    .filter((m) => m.generatedSource === "original")
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  // Usage (abandon) : première mesure de chaque génération, toute règle et
  // tout statut confondus.
  const firstUse = new Map<Generation, Measurement>();
  // Export : première mesure à la règle courante et non refusée, dans
  // l'ordre des mesures ; jamais la plus favorable.
  const firstMeasurement = new Map<Generation, Measurement>();
  for (const measurement of chronological) {
    const generation = generationOf(measurement);
    if (!generation) continue;
    if (!firstUse.has(generation)) firstUse.set(generation, measurement);
    const exportable =
      measurement.ruleVersion === RULE_VERSION &&
      measurement.controls !== null &&
      measurement.guardVersion !== null &&
      (measurement.status === "ok" || measurement.status === "doubtful");
    if (exportable && !firstMeasurement.has(generation)) {
      firstMeasurement.set(generation, measurement);
    }
  }

  // Fenêtre d'abandon (7 jours) non observée : une génération close avant
  // la fin de sa fenêtre sans avoir servi avant la clôture n'est pas
  // exportée ; elle compterait à tort comme abandonnée.
  const usedBefore = (at: string | null, g: (typeof generations)[number]) =>
    at !== null &&
    at >= g.generatedAt &&
    (g.closedAt === null || at < g.closedAt);
  const observed = generations.filter(
    (g) =>
      g.closedAt === null ||
      Date.parse(g.closedAt) - Date.parse(g.generatedAt) >= ABANDON_WINDOW_MS ||
      firstUse.has(g) ||
      usedBefore(g.exportedAt, g) ||
      usedBefore(g.sharedAt, g),
  );
  const summaryIndex = new Map(observed.map((g, i) => [g, `s${i + 1}`]));
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
    guard_version: m.guardVersion as number,
    status: m.status as "ok" | "doubtful",
    status_reasons: m.statusReasons,
    controls: m.controls as Controls,
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

  const summaries = observed.map((g) => {
    // Un événement antérieur à la génération appartient à une autre.
    const after = (at: string | null) =>
      at !== null &&
      at >= g.generatedAt &&
      (g.closedAt === null || at < g.closedAt)
        ? day(at)
        : null;
    const measurement = firstUse.get(g);
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
    schema_version: 2,
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
      guard_version: number | null;
      status: MeasureStatus | null;
      reason_entity_left: number | null;
      reason_too_few_words_kept: number | null;
      reason_global_alignment: number | null;
      reason_unmatched_sections: number | null;
      generated_kept_words: number | null;
      sections_matched_exact: number | null;
      sections_matched_near: number | null;
      deleted_section_words: number | null;
      residual_entities: number | null;
    }
  >(
    `SELECT id, document_id, measured_at, rule_version, aligned,
            headings_generated, headings_matched, unmatched_sent_words,
            generated_words, added_words, deleted_words, replaced_content,
            replaced_lexical, generated_source, guard_version, status,
            reason_entity_left, reason_too_few_words_kept,
            reason_global_alignment, reason_unmatched_sections,
            generated_kept_words, sections_matched_exact,
            sections_matched_near, deleted_section_words, residual_entities
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
      guardVersion: m.guard_version,
      status: m.status,
      statusReasons: (
        [
          ["entity_left", m.reason_entity_left],
          ["too_few_words_kept", m.reason_too_few_words_kept],
          ["global_alignment", m.reason_global_alignment],
          ["unmatched_sections", m.reason_unmatched_sections],
        ] as const
      )
        .filter(([, flag]) => flag === 1)
        .map(([code]) => code),
      controls:
        m.generated_kept_words === null ||
        m.sections_matched_exact === null ||
        m.sections_matched_near === null ||
        m.deleted_section_words === null ||
        m.residual_entities === null
          ? null
          : {
              generated_kept_words: m.generated_kept_words,
              sections_matched_exact: m.sections_matched_exact,
              sections_matched_near: m.sections_matched_near,
              deleted_section_words: m.deleted_section_words,
              residual_entities: m.residual_entities,
            },
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
