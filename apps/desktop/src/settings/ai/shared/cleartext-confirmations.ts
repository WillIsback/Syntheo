import { t } from "@lingui/core/macro";

import { isCleartextRemoteUrl } from "@syntheo/provider-validation";
import { toast } from "@syntheo/ui/components/ui/toast";

import { liveQueryClient } from "~/db";
import {
  type AppSettingRow,
  parseAiProviders,
} from "~/settings/providers-storage";
import { getStoredSettingValues, setSettingValues } from "~/settings/queries";
import { useTabs } from "~/store/zustand/tabs";

// HTTP clair hors de ce poste (issues 646 et 665) : chaque adresse est
// confirmée une seule fois. Une adresse enregistrée par une version
// antérieure, jamais confirmée, est signalée au premier lancement après la
// mise à jour ; la confirmation est gardée dans `cleartext_http_confirmed`.

/** Clé de comparaison d'une adresse : espaces retirés. */
export function cleartextKey(url: string): string {
  return url.trim();
}

export function parseConfirmedCleartextUrls(
  value: string | undefined,
): Set<string> {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

export async function loadConfirmedCleartextUrls(): Promise<Set<string>> {
  const { values } = await getStoredSettingValues();
  return parseConfirmedCleartextUrls(values.cleartext_http_confirmed);
}

/** Garde la confirmation d'une adresse HTTP clair. */
export async function confirmCleartextUrl(url: string): Promise<void> {
  const confirmed = await loadConfirmedCleartextUrls();
  const key = cleartextKey(url);
  if (confirmed.has(key)) return;
  confirmed.add(key);
  await setSettingValues({
    cleartext_http_confirmed: JSON.stringify([...confirmed].sort()),
  });
}

/** Adresses de serveurs (transcription, modèle de langue) en HTTP clair hors
 * de ce poste et jamais confirmées. */
export function unconfirmedCleartextUrls(
  rows: AppSettingRow[],
  confirmed: Set<string>,
): string[] {
  const urls = new Set<string>();
  for (const kind of ["stt", "llm"] as const) {
    for (const provider of Object.values(parseAiProviders(rows, kind))) {
      const url = cleartextKey(String(provider.base_url ?? ""));
      if (url && isCleartextRemoteUrl(url) && !confirmed.has(url)) {
        urls.add(url);
      }
    }
  }
  return [...urls].sort();
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Au démarrage de la fenêtre principale : une demande de confirmation par
 * adresse héritée. « Garder HTTP » l'enregistre et la demande ne revient
 * plus ; fermer sans choisir la fait revenir au prochain lancement.
 */
export async function promptLegacyCleartextUrls(): Promise<void> {
  const rows = await liveQueryClient.execute<AppSettingRow>(
    "SELECT id, value_json FROM app_settings ORDER BY id",
  );
  const urls = unconfirmedCleartextUrls(
    rows,
    await loadConfirmedCleartextUrls(),
  );
  for (const url of urls) {
    const host = hostOf(url);
    toast.warning(
      t`Unencrypted connection to ${host}: the audio, your notes and the API key travel in clear text on the network. Keep this address, or switch the server to HTTPS.`,
      {
        id: `cleartext-legacy:${url}`,
        duration: Infinity,
        action: {
          label: t`Keep unencrypted HTTP`,
          onClick: () => {
            void confirmCleartextUrl(url).catch((error) =>
              console.error("[server] failed to save the confirmation", error),
            );
          },
        },
        secondaryAction: {
          label: t`Open settings`,
          onClick: () =>
            useTabs
              .getState()
              .openNew({ type: "settings", state: { tab: "intelligence" } }),
        },
      },
    );
  }
}
