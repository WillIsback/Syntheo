import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

import { useUpdater } from "./store";

import { useSettingsReady } from "~/settings/queries";
import { requestSettingFocus } from "~/settings/setting-focus";
import { useConfigValues } from "~/shared/config";
import { useTabs } from "~/store/zustand/tabs";

/** Délai avant la vérification au démarrage : l'application d'abord. */
export const STARTUP_CHECK_DELAY_MS = 15_000;

let startupCheckDone = false;

/** Tests : autorise une nouvelle vérification au démarrage. */
export function resetStartupUpdateCheck() {
  startupCheckDone = false;
}

// Vérification au démarrage (issue 593), activée par défaut. Désactivée par
// l'interrupteur des Paramètres ou par l'administration du poste
// (managed_settings : automatic_updates à false). Une seule fois par
// lancement, en silence si le réseau manque.
export function useStartupUpdateCheck() {
  const ready = useSettingsReady();
  const { automatic_updates } = useConfigValues(["automatic_updates"] as const);

  useEffect(() => {
    if (!ready || !automatic_updates || startupCheckDone) return;
    const timer = setTimeout(() => {
      startupCheckDone = true;
      void useUpdater.getState().check({ manual: false });
    }, STARTUP_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, automatic_updates]);
}

/** Paramètres › Profil, section « Mises à jour ». */
export function openUpdateSettings() {
  const { currentTab, openNew, updateSettingsTabState } = useTabs.getState();
  if (currentTab?.type === "settings") {
    updateSettingsTabState(currentTab, { tab: "app" });
  } else {
    openNew({ type: "settings", state: { tab: "app" } });
  }
  requestSettingFocus("check-for-updates");
}

/** Émis par l'entrée « Rechercher des mises à jour… » de la zone de notification. */
export const CHECK_UPDATES_EVENT = "syntheo://check-for-updates";

/** Zone de notification : ouvre la section et lance une vérification. */
export function useTrayUpdateCheck() {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen(CHECK_UPDATES_EVENT, () => {
      openUpdateSettings();
      void useUpdater.getState().check({ manual: true });
    })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch((error) => {
        console.error("[updater] failed to listen to the tray", error);
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
