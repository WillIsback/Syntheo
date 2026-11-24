import { RULE_VERSION } from "@syntheo/plugin-mesure";

import { useLiveQuery } from "~/db";

// Issue 734 : une synthèse mesurée seulement sous une règle antérieure
// affiche « mesure à refaire (règle mise à jour) ». La version enregistrée
// n'est pas conservée (spec, §5) : on ne peut pas recalculer, il faut
// remesurer.

type OutdatedRow = { measured: number; current: number };

export const MEASUREMENT_OUTDATED_SQL = `
  SELECT
    EXISTS(SELECT 1 FROM summary_measurements WHERE document_id = ?1) AS measured,
    EXISTS(
      SELECT 1 FROM summary_measurements
      WHERE document_id = ?1 AND rule_version = ?2
    ) AS current
`;

export function isMeasurementOutdated(row: OutdatedRow | undefined): boolean {
  return Boolean(
    row && Number(row.measured) === 1 && Number(row.current) === 0,
  );
}

/** `true` si la synthèse n'a que des mesures d'une règle antérieure. */
export function useMeasurementOutdated(
  documentId: string,
  enabled: boolean,
): boolean {
  const { data = false } = useLiveQuery<OutdatedRow, boolean>({
    sql: MEASUREMENT_OUTDATED_SQL,
    params: [documentId, RULE_VERSION],
    enabled: enabled && documentId.length > 0,
    mapRows: (rows) => isMeasurementOutdated(rows[0]),
  });
  return enabled && data;
}
