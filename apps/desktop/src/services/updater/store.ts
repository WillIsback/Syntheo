import { Channel } from "@tauri-apps/api/core";
import { create } from "zustand";

import { installUpdateAndRelaunch } from "~/shared/relaunch";
import { listenerStore } from "~/store/zustand/listener/instance";
import {
  commands,
  type DownloadEvent,
  type UpdaterError,
} from "~/types/tauri.gen";

// Mise à jour intégrée (issue 593) : état de la vérification, du
// téléchargement et de l'installation, au-dessus des commandes Rust
// updater_check / updater_download / updater_install. Le téléchargement et
// l'installation sont séparés : on peut télécharger pendant une réunion et
// n'installer qu'ensuite.

type AvailableUpdate = {
  version: string;
  notes: string | null;
  date: string | null;
  // `false` : .deb, MSI ou type inconnu, annonce avec lien seulement.
  installable: boolean;
  releaseUrl: string;
};

type UpdaterPhase =
  | "idle"
  | "unavailable"
  | "checking"
  | "up_to_date"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

/** Code d'erreur stable (Rust) ; « other » pour une erreur côté interface. */
export type UpdaterErrorCode = UpdaterError;

type UpdaterState = {
  phase: UpdaterPhase;
  update: AvailableUpdate | null;
  progress: { downloaded: number; total: number | null } | null;
  error: UpdaterErrorCode | null;
  // `false` : build `devtools` (alpha), sans mise à jour intégrée. `null` tant
  // que la commande n'a pas répondu.
  supported: boolean | null;
  loadSupport: () => Promise<void>;
  check: (options: { manual: boolean }) => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
};

/** Écoute ou finalisation en cours : aucune installation ni relance. */
function isListeningNow(): boolean {
  const status = listenerStore.getState().live.status;
  return status === "active" || status === "finalizing";
}

// Erreur d'une commande Rust, avec son code (issue 601).
class UpdaterCommandError extends Error {
  constructor(readonly code: UpdaterErrorCode) {
    super(`updater: ${code}`);
  }
}

function errorCode(error: unknown): UpdaterErrorCode {
  return error instanceof UpdaterCommandError ? error.code : "other";
}

export const useUpdater = create<UpdaterState>((set, get) => ({
  phase: "idle",
  update: null,
  progress: null,
  error: null,
  supported: null,

  loadSupport: async () => {
    if (get().supported !== null) return;
    let supported = true;
    try {
      supported = await commands.updaterSupported();
    } catch (error) {
      console.warn("[updater] failed to read support", error);
    }
    set((state) => ({
      supported,
      // Alpha `devtools` : indisponible dès l'ouverture, sans attendre la
      // vérification différée (issue 601).
      phase: !supported && state.phase === "idle" ? "unavailable" : state.phase,
    }));
  },

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
      if (result.status === "error") {
        throw new UpdaterCommandError(result.error);
      }
      const check = result.data;
      if (check.status === "unavailable") {
        set({ phase: "unavailable", update: null });
      } else if (check.status === "up_to_date") {
        set({ phase: "up_to_date", update: null });
      } else {
        set({
          // La version trouvée est déjà téléchargée : elle reste prête à être
          // installée (issue 601).
          phase: check.downloaded ? "ready" : "available",
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
      const code = errorCode(error);
      if (code === "unavailable") {
        set({ phase: "unavailable", update: null });
      } else if (manual) {
        console.warn("[updater] check failed", error);
        set({ phase: "error", error: code });
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
      if (result.status === "error") {
        throw new UpdaterCommandError(result.error);
      }
      set({ phase: "ready" });
    } catch (error) {
      console.warn("[updater] download failed", error);
      set({ phase: "error", error: errorCode(error) });
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
        if (result.status === "error") {
          throw new UpdaterCommandError(result.error);
        }
      });
    } catch (error) {
      console.warn("[updater] install failed", error);
      set({ phase: "error", error: errorCode(error) });
    }
  },
}));
