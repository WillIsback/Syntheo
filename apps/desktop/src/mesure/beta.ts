import { executeTransaction, liveQueryClient } from "~/db";
import { enqueueDatabaseWrite } from "~/db/write-queue";

// Bêta, issue 672 : inscription (pseudonyme aléatoire, date de référence et
// clé des empreintes de termes), événements d'export et de partage de chaque
// génération de synthèse (taux d'abandon), suivi des termes et effacement.
// Rien n'est enregistré tant que la mesure n'est pas activée, et aucun texte :
// des identifiants, des dates et des empreintes à clé locale.

type Statement = { sql: string; params: unknown[] };

const ENABLED = `EXISTS (
  SELECT 1 FROM app_settings
  WHERE id = 'measurement_enabled' AND value_json = 'true'
)`;

function randomHex(bytes: number): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(values, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Pseudonyme aléatoire : `p-` suivi de 32 chiffres hexadécimaux. */
export function randomPseudonym(): string {
  return `p-${randomHex(16)}`;
}

/** Clé HMAC des empreintes de termes : 32 octets aléatoires. */
export function randomTermKey(): string {
  return randomHex(32);
}

/**
 * Inscription, créée à l'activation (ou à la première mesure), seulement si
 * la mesure est active : aucune réinscription après un effacement, même
 * depuis une écriture déjà en file.
 */
export function enrollmentStatement(now: string): Statement {
  return {
    sql: `
      INSERT INTO beta_enrollment (id, pseudonym, enrolled_at, term_key)
      SELECT 1, ?, ?, ?
      WHERE ${ENABLED}
      ON CONFLICT(id) DO NOTHING
    `,
    params: [randomPseudonym(), now, randomTermKey()],
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
 * envoi par webhook) de la génération courante d'une synthèse. Seulement si
 * la mesure est activée, la personne inscrite et cette génération notée et
 * ouverte : une régénération démarre une nouvelle ligne, et les événements de
 * l'ancienne n'y passent pas ; une génération close à la désactivation n'en
 * reçoit plus.
 */
export function summaryEventStatement(
  event: SummaryEvent,
  documentId: string,
  now: string,
): Statement {
  const column = event === "exported" ? "exported_at" : "shared_at";
  return {
    sql: `
      UPDATE beta_generations SET ${column} = COALESCE(${column}, ?)
      WHERE id = (
        SELECT id FROM beta_generations
        WHERE document_id = ?
        ORDER BY generated_at DESC, id DESC
        LIMIT 1
      )
        AND closed_at IS NULL
        AND ${ENABLED}
        AND EXISTS (SELECT 1 FROM beta_enrollment)
    `,
    params: [now, documentId],
  };
}

export function recordSummaryEvent(
  event: SummaryEvent,
  documentId: string,
): Promise<void> {
  return enqueueDatabaseWrite("beta-summary-events", async () => {
    await executeTransaction([
      summaryEventStatement(event, documentId, new Date().toISOString()),
    ]).catch((cause) => {
      console.error("[mesure] failed to record a summary event", cause);
    });
  });
}

/** Index de terme tiré au hasard dans [1, 99999] (schéma `tN`). */
export function randomTermIndexes(count: number): number[] {
  const values = crypto.getRandomValues(new Uint32Array(count));
  return Array.from(values, (v) => (v % 99_999) + 1);
}

/**
 * Termes corrigés d'une mesure (empreintes à clé), et constat d'ajout au
 * dictionnaire : un terme suivi qui apparaît dans le dictionnaire y a été
 * ajouté depuis la mesure précédente. L'index d'un nouveau terme est le
 * premier des candidats tirés au hasard qui n'est pas déjà pris ; si tous le
 * sont, la transaction échoue et l'enregistrement est retenté.
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
        SELECT
          ?,
          (
            SELECT candidate.value FROM json_each(?) AS candidate
            WHERE candidate.value NOT IN (SELECT term_index FROM beta_terms)
            LIMIT 1
          ),
          ?, ?, NULL
        WHERE EXISTS (SELECT 1 FROM summary_measurements WHERE id = ?)
        ON CONFLICT(hash) DO NOTHING
      `,
      params: [
        term.hash,
        JSON.stringify(randomTermIndexes(8)),
        now,
        inDictionary.has(term.hash) ? 1 : 0,
        measurementId,
      ],
    },
    {
      sql: `
        INSERT INTO beta_term_errors (measurement_id, term_hash, count)
        SELECT ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM summary_measurements WHERE id = ?)
      `,
      params: [measurementId, term.hash, term.count, measurementId],
    },
  ]);
  statements.push({
    sql: `
      UPDATE beta_terms SET added_seen_at = ?
      WHERE added_seen_at IS NULL
        AND in_dictionary_first = 0
        AND hash IN (SELECT value FROM json_each(?))
        AND EXISTS (SELECT 1 FROM summary_measurements WHERE id = ?)
    `,
    params: [now, JSON.stringify([...inDictionary]), measurementId],
  });
  return statements;
}

/** Effacement sûr : les pages libérées sont réécrites à zéro. */
export const SECURE_DELETE: Statement = {
  sql: "PRAGMA secure_delete = ON",
  params: [],
};

/** Copie des synthèses telles que générées : vidée quand la mesure s'arrête. */
export const CLEAR_GENERATED_BODIES: Statement = {
  sql: "DELETE FROM summary_generated_bodies",
  params: [],
};

/** Arrêt de la mesure : les générations ouvertes sont closes. */
export function closeGenerationsStatement(now: string): Statement {
  return {
    sql: "UPDATE beta_generations SET closed_at = ? WHERE closed_at IS NULL",
    params: [now],
  };
}

/** Ce que fait l'arrêt de la mesure, dans la transaction du réglage. */
export function stopMeasurementStatements(now: string): Statement[] {
  return [
    SECURE_DELETE,
    CLEAR_GENERATED_BODIES,
    closeGenerationsStatement(now),
  ];
}

/**
 * Après un effacement : réduit le journal WAL pour que les pages effacées n'y
 * restent pas. Au mieux, sans bloquer ni faire échouer l'effacement.
 */
export function checkpointAfterErase(): void {
  void liveQueryClient
    .execute("PRAGMA wal_checkpoint(TRUNCATE)")
    .catch((cause) => console.error("[mesure] wal checkpoint skipped", cause));
}

/**
 * « Effacer mes mesures » : compteurs, calibrage, termes, générations, copie
 * des synthèses générées, inscription (pseudonyme et clé), et arrêt de la
 * mesure et du Calibrage. Réactiver crée une nouvelle inscription.
 */
export function eraseStatements(now: string): Statement[] {
  return [
    SECURE_DELETE,
    { sql: "DELETE FROM beta_term_errors", params: [] },
    { sql: "DELETE FROM summary_measurement_sections", params: [] },
    { sql: "DELETE FROM summary_measurements", params: [] },
    { sql: "DELETE FROM calibration_results", params: [] },
    { sql: "DELETE FROM beta_terms", params: [] },
    { sql: "DELETE FROM beta_generations", params: [] },
    CLEAR_GENERATED_BODIES,
    { sql: "DELETE FROM beta_enrollment", params: [] },
    ...["measurement_enabled", "calibration_enabled"].map((id) => ({
      sql: `
        INSERT INTO app_settings (id, value_json, updated_at)
        VALUES (?, 'false', ?)
        ON CONFLICT(id) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at
      `,
      params: [id, now],
    })),
  ];
}

export function eraseBetaData(): Promise<void> {
  return enqueueDatabaseWrite("summary-measurements", async () => {
    await executeTransaction(eraseStatements(new Date().toISOString()));
    checkpointAfterErase();
  });
}
