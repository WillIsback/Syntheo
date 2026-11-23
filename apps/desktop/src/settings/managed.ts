import { liveQueryClient, useLiveQuery } from "~/db";
import { useConfigValues } from "~/shared/config";

// Réglages fixés par l'administration du poste (managed_settings.json). La
// politique est recopiée dans app_settings, mais la copie y reste quand
// l'administrateur retire une clé : seul managed_app_settings dit ce qui est
// géré aujourd'hui (issue 707).
const MANAGED_SQL = `SELECT id FROM managed_app_settings`;

/** Identifiants des réglages gérés en ce moment. */
export function useManagedSettingIds(): Set<string> {
  const { data = EMPTY } = useLiveQuery<{ id: string }, Set<string>>({
    sql: MANAGED_SQL,
    mapRows: (rows) => new Set(rows.map((row) => row.id)),
  });
  return data;
}

const EMPTY = new Set<string>();

/** Le réglage est fixé par l'administration du poste. */
export function useIsManagedSetting(id: string): boolean {
  return useManagedSettingIds().has(id);
}

/**
 * Synthèse coupée par l'administration (intelligence_disabled).
 *
 * `managed` : la politique l'impose aujourd'hui ; c'est elle qui décide du
 * message « Réglé par votre administrateur. » et de la désactivation des
 * écrans. `blocked` : aucune requête vers le serveur LLM ne part, ni quand la
 * politique l'impose, ni quand la copie d'app_settings vaut encore vrai.
 */
export function useIntelligenceDisabled(): {
  managed: boolean;
  blocked: boolean;
} {
  const managed = useIsManagedSetting("intelligence_disabled");
  const { intelligence_disabled } = useConfigValues([
    "intelligence_disabled",
  ] as const);
  return { managed, blocked: managed || !!intelligence_disabled };
}

// Même règle que `blocked` ci-dessus, hors d'un composant : la clé est gérée,
// ou sa copie dans app_settings vaut vrai (la clé n'est pas synchronisée).
const INTELLIGENCE_BLOCKED_SQL = `SELECT
  EXISTS (SELECT 1 FROM managed_app_settings
    WHERE id = 'intelligence_disabled')
  OR EXISTS (SELECT 1 FROM app_settings
    WHERE id = 'intelligence_disabled' AND value_json = 'true') AS blocked`;

/** Synthèse coupée (`useIntelligenceDisabled().blocked`), lue à la demande. */
export async function loadIntelligenceBlocked(): Promise<boolean> {
  const [row] = await liveQueryClient.execute<{ blocked: number }>(
    INTELLIGENCE_BLOCKED_SQL,
  );
  return !!row?.blocked;
}
