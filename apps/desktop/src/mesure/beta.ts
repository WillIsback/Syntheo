import { executeTransaction, liveQueryClient } from "~/db";
import { enqueueDatabaseWrite } from "~/db/write-queue";

// Bêta, issue 672 : inscription (pseudonyme aléatoire et date de référence),
// événements de partage et d'export des synthèses (taux d'abandon), et
// effacement. Rien n'est enregistré tant que la mesure n'est pas activée, et
// aucun texte : des identifiants, des dates et des empreintes.

type Statement = { sql: string; params: unknown[] };

const ENABLED = `EXISTS (
  SELECT 1 FROM app_settings
  WHERE id = 'measurement_enabled' AND value_json = 'true'
)`;

/** Pseudonyme aléatoire : `p-` suivi de 32 chiffres hexadécimaux. */
export function randomPseudonym(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `p-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Inscription, créée à la première activation (ou à la première mesure). */
export function enrollmentStatement(now: string): Statement {
  return {
    sql: `
      INSERT INTO beta_enrollment (id, pseudonym, enrolled_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `,
    params: [randomPseudonym(), now],
  };
}

export function ensureEnrollment(): Promise<void> {
  return enqueueDatabaseWrite("beta-enrollment", async () => {
    await executeTransaction([enrollmentStatement(new Date().toISOString())]);
  });
}

export type SummaryEvent = "exported" | "shared";

/**
 * Premier export de fichier ou premier partage (copie dans le presse-papiers,
 * envoi par webhook) des synthèses d'une réunion, ou d'une seule synthèse.
 * Seulement si la mesure est activée et la personne inscrite.
 */
export function summaryEventStatement(
  event: SummaryEvent,
  sessionId: string,
  documentId: string | null,
  now: string,
): Statement {
  const column = event === "exported" ? "exported_at" : "shared_at";
  return {
    sql: `
      INSERT INTO beta_summary_events (document_id, session_id, ${column})
      SELECT document.id, document.session_id, ?
      FROM session_documents AS document
      WHERE document.session_id = ?
        AND (? IS NULL OR document.id = ?)
        AND document.kind IN ('summary', 'template_output')
        AND document.deleted_at IS NULL
        AND ${ENABLED}
        AND EXISTS (SELECT 1 FROM beta_enrollment)
      ON CONFLICT(document_id) DO UPDATE SET
        ${column} = COALESCE(beta_summary_events.${column}, excluded.${column})
    `,
    params: [now, sessionId, documentId, documentId],
  };
}

export function recordSummaryEvent(
  event: SummaryEvent,
  sessionId: string,
  documentId: string | null = null,
): Promise<void> {
  return enqueueDatabaseWrite("beta-summary-events", async () => {
    await executeTransaction([
      summaryEventStatement(
        event,
        sessionId,
        documentId,
        new Date().toISOString(),
      ),
    ]).catch((cause) => {
      console.error("[mesure] failed to record a summary event", cause);
    });
  });
}

/**
 * Termes corrigés d'une mesure (empreintes), et constat d'ajout au
 * dictionnaire : un terme suivi qui apparaît dans le dictionnaire y a été
 * ajouté depuis la mesure précédente.
 */
export function termStatements(
  measurementId: string,
  correctedTerms: readonly { hash: string; count: number }[],
  dictionaryHashes: readonly string[],
  now: string,
): Statement[] {
  const inDictionary = new Set(dictionaryHashes);
  const statements: Statement[] = correctedTerms.flatMap((term) => [
    {
      sql: `
        INSERT INTO beta_terms (
          hash, term_index, first_seen_at, in_dictionary_first, added_seen_at
        )
        VALUES (
          ?, (SELECT COALESCE(MAX(term_index), 0) + 1 FROM beta_terms), ?, ?,
          NULL
        )
        ON CONFLICT(hash) DO NOTHING
      `,
      params: [term.hash, now, inDictionary.has(term.hash) ? 1 : 0],
    },
    {
      sql: `
        INSERT INTO beta_term_errors (measurement_id, term_hash, count)
        VALUES (?, ?, ?)
      `,
      params: [measurementId, term.hash, term.count],
    },
  ]);
  statements.push({
    sql: `
      UPDATE beta_terms SET added_seen_at = ?
      WHERE added_seen_at IS NULL
        AND in_dictionary_first = 0
        AND hash IN (SELECT value FROM json_each(?))
    `,
    params: [now, JSON.stringify([...inDictionary])],
  });
  return statements;
}

/** « Effacer mes mesures » : compteurs, calibrage, termes, événements, pseudonyme. */
export const ERASE_STATEMENTS: Statement[] = [
  { sql: "DELETE FROM beta_term_errors", params: [] },
  { sql: "DELETE FROM summary_measurement_sections", params: [] },
  { sql: "DELETE FROM summary_measurements", params: [] },
  { sql: "DELETE FROM calibration_results", params: [] },
  { sql: "DELETE FROM beta_terms", params: [] },
  { sql: "DELETE FROM beta_summary_events", params: [] },
  { sql: "DELETE FROM beta_enrollment", params: [] },
];

export function eraseBetaData(): Promise<void> {
  return enqueueDatabaseWrite("summary-measurements", async () => {
    await executeTransaction(ERASE_STATEMENTS);
  });
}

export async function hasBetaData(): Promise<boolean> {
  const [row] = await liveQueryClient.execute<{ n: number }>(
    `SELECT (SELECT count(*) FROM summary_measurements)
          + (SELECT count(*) FROM beta_enrollment) AS n`,
  );
  return (row?.n ?? 0) > 0;
}
