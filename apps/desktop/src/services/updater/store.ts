import { Channel } from "@tauri-apps/api/core";
import { create } from "zustand";

import { installUpdateAndRelaunch } from "~/shared/relaunch";
import { listenerStore } from "~/store/zustand/listener/instance";
import { commands, type DownloadEvent } from "~/types/tauri.gen";

// Mise à jour intégrée (issue 593) : état de la vérification, du
// téléchargement et de l'installation, au-dessus des commandes Rust
// updater_check / updater_download / updater_install. Le téléchargement et
// l'installation sont séparés : on peut télécharger pendant une réunion et
// n'installer qu'ensuite.

export type AvailableUpdate = {
  version: string;
  notes: string | null;
  date: string | null;
  // `false` : .deb, MSI ou type inconnu, annonce avec lien seulement.
  installable: boolean;
  releaseUrl: string;
};

export type UpdaterPhase =
  | "idle"
  | "unavailable"
  | "checking"
  | "up_to_date"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

type UpdaterState = {
  phase: UpdaterPhase;
  update: AvailableUpdate | null;
  progress: { downloaded: number; total: number | null } | null;
  error: string | null;
  check: (options: { manual: boolean }) => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
};

/** Écoute ou finalisation en cours : aucune installation ni relance. */
export function isListeningNow(): boolean {
  const status = listenerStore.getState().live.status;
  return status === "active" || status === "finalizing";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useUpdater = create<UpdaterState>((set, get) => ({
  phase: "idle",
  update: null,
  progress: null,
  error: null,

  check: async ({ manual }) => {
    const { phase } = get();
    if (
      phase === "checking" ||
      phase === "downloading" ||
      phase === "installing"
    ) {
      return;
    }
    set({ phase: "checking", error: null });
    try {
      const result = await commands.updaterCheck();
      if (result.status === "error") throw new Error(result.error);
      const check = result.data;
      if (check.status === "unavailable") {
        set({ phase: "unavailable", update: null });
      } else if (check.status === "up_to_date") {
        set({ phase: "up_to_date", update: null });
      } else {
        set({
          phase: "available",
          progress: null,
          update: {
            version: check.version,
            notes: check.notes,
            date: check.date,
            installable: check.installable,
            releaseUrl: check.release_url,
          },
        });
      }
    } catch (error) {
      // Hors ligne, proxy, pare-feu : la vérification au démarrage échoue en
      // silence ; la vérification demandée affiche l'erreur.
      if (manual) {
        set({ phase: "error", error: errorMessage(error) });
      } else {
        console.warn("[updater] automatic check failed", error);
        set({ phase: "idle" });
      }
    }
  },

  download: async () => {
    const { phase, update } = get();
    if (phase !== "available" || !update?.installable) return;
    set({ phase: "downloading", progress: { downloaded: 0, total: null } });
    const channel = new Channel<DownloadEvent>();
    channel.onmessage = (event) => {
      if (event.event === "progress") {
        set({
          progress: { downloaded: event.downloaded, total: event.total },
        });
      }
    };
    try {
      const result = await commands.updaterDownload(channel);
      if (result.status === "error") throw new Error(result.error);
      set({ phase: "ready" });
    } catch (error) {
      set({ phase: "error", error: errorMessage(error) });
    }
  },

  install: async () => {
    if (get().phase !== "ready") return;
    if (isListeningNow()) {
      // Jamais pendant une écoute ou une finalisation : l'interface désactive
      // déjà le bouton, ce garde couvre les autres appels.
      return;
    }
    set({ phase: "installing", error: null });
    try {
      await installUpdateAndRelaunch(async () => {
        const result = await commands.updaterInstall();
        if (result.status === "error") throw new Error(result.error);
      });
    } catch (error) {
      set({ phase: "error", error: errorMessage(error) });
    }
  },
}));
