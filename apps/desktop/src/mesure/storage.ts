import type { MeasureResult } from "@syntheo/plugin-mesure";

import type { AgreementMatrix } from "./calibration";

import { executeTransaction } from "~/db";
import { enqueueDatabaseWrite } from "~/db/write-queue";

// Bêta, issue 671 : seuls des compteurs sont enregistrés, rattachés à la
// synthèse et à la version du calcul. Aucun texte : ni la version envoyée, ni
// les extraits, ni les étiquettes du calibrage (contraintes CHECK des tables).

type Statement = { sql: string; params: unknown[] };

export type MeasurementIds = {
  sessionId: string;
  documentId: string;
  /** Version comparée : corps produit par Syntheo, ou synthèse actuelle. */
  generatedSource: "original" | "current";
};

export function measurementStatements(
  id: string,
  ids: MeasurementIds,
  result: MeasureResult,
): Statement[] {
  const t = result.total;
  return [
    {
      sql: `
        INSERT INTO summary_measurements (
          id, document_id, session_id, rule_version, aligned,
          headings_generated, headings_matched, generated_words, added_words,
          deleted_words, replaced_content, replaced_lexical,
          unmatched_sent_words, generated_source
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        id,
        ids.documentId,
        ids.sessionId,
        result.ruleVersion,
        result.aligned ? 1 : 0,
        result.headingsGenerated,
        result.headingsMatched,
        t.generated,
        t.added,
        t.deleted,
        t.replacedContent,
        t.replacedLexical,
        result.unmatchedSentWords,
        ids.generatedSource,
      ],
    },
    ...result.sections.map((section) => ({
      sql: `
        INSERT INTO summary_measurement_sections (
          measurement_id, section_index, matched, generated_words,
          added_words, deleted_words, replaced_content, replaced_lexical
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        id,
        section.index,
        section.matched ? 1 : 0,
        section.counters.generated,
        section.counters.added,
        section.counters.deleted,
        section.counters.replacedContent,
        section.counters.replacedLexical,
      ],
    })),
  ];
}

export function calibrationStatement(
  id: string,
  matrix: AgreementMatrix,
): Statement {
  return {
    sql: `
      INSERT INTO calibration_results (
        id, rule_version, auto_content_true_content,
        auto_content_true_lexical, auto_lexical_true_content,
        auto_lexical_true_lexical
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    params: [
      id,
      matrix.ruleVersion,
      matrix.autoContentTrueContent,
      matrix.autoContentTrueLexical,
      matrix.autoLexicalTrueContent,
      matrix.autoLexicalTrueLexical,
    ],
  };
}

export function saveMeasurement(
  ids: MeasurementIds,
  result: MeasureResult,
): Promise<void> {
  return enqueueDatabaseWrite("summary-measurements", async () => {
    await executeTransaction(
      measurementStatements(crypto.randomUUID(), ids, result),
    );
  });
}

export function saveCalibration(matrix: AgreementMatrix): Promise<void> {
  return enqueueDatabaseWrite("calibration-results", async () => {
    await executeTransaction([
      calibrationStatement(crypto.randomUUID(), matrix),
    ]);
  });
}
