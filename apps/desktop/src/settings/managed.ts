import { useLiveQuery } from "~/db";
import { useConfigValue } from "~/shared/config";

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
  const stored = useConfigValue("intelligence_disabled");
  return { managed, blocked: managed || !!stored };
}
