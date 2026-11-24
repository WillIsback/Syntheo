import { t } from "@lingui/core/macro";
import { useMemo } from "react";

import { toast } from "@syntheo/ui/components/ui/toast";

import { AudioUploadTooLargeError } from "./audio-upload-stream";
import {
  getBatchProvider,
  getFileTranscriptionRoute,
} from "./transcription-route";
import { useUsableTranscription } from "./usable-transcription";
import { useSTTConnection } from "./useSTTConnection";

import { describeServiceError } from "~/shared/service-error";
import { useTabs } from "~/store/zustand/tabs";

/**
 * Un fichier importé passe par la transcription par lot ou, pour un modèle qui
 * ne transcrit qu'en direct (NVIDIA streaming), par son flux temps réel
 * (issue 463). Sans l'un ni l'autre, on le dit avant de toucher à la note
 * (issue 462).
 */
type AudioImportAvailability =
  | { status: "ready"; route: "batch" | "realtime" }
  | { status: "no_provider" }
  | { status: "server_required" }
  | { status: "unsupported" };

export function getAudioImportAvailability(
  conn: { provider: string; model: string } | null,
  onDeviceActive = false,
): AudioImportAvailability {
  if (!conn) {
    // « Sur ce poste » ne transcrit que le direct d'une écoute : l'import
    // d'un fichier passe toujours par un serveur.
    return onDeviceActive
      ? { status: "server_required" }
      : { status: "no_provider" };
  }
  // Même choix de cible que `useRunBatch` avec `allowRealtimeStream`.
  const route = getFileTranscriptionRoute(conn);
  return route ? { status: "ready", route } : { status: "unsupported" };
}

/**
 * Les autres fonctions (dictée du chat, réparation) restent liées au lot :
 * un modèle temps réel seul ne les fait pas.
 */
type BatchAvailability =
  | { status: "ready" }
  | { status: "no_provider" }
  | { status: "live_only" };

export function getBatchAvailability(
  conn: { provider: string; model: string } | null,
): BatchAvailability {
  if (!conn) {
    return { status: "no_provider" };
  }
  return getBatchProvider(conn.provider, conn.model)
    ? { status: "ready" }
    : { status: "live_only" };
}

export function useAudioImportAvailability(): AudioImportAvailability {
  const { serverConn: conn } = useSTTConnection();
  const onDeviceActive = useUsableTranscription().active === "on_device";
  return useMemo(
    () => getAudioImportAvailability(conn, onDeviceActive),
    [conn, onDeviceActive],
  );
}

export function describeAudioImportUnavailable(
  availability: AudioImportAvailability,
): string | null {
  switch (availability.status) {
    case "ready":
      return null;
    case "unsupported":
      return t`This model can't transcribe a file. Choose another transcription model.`;
    case "no_provider":
      return t`No transcription service is set up: importing a file requires a transcription model.`;
    case "server_required":
      return t`Importing a file goes through a transcription server: transcription on this computer only transcribes live recordings. Add a server in Settings › Transcription.`;
  }
}

export function openTranscriptionSettings() {
  useTabs
    .getState()
    .openNew({ type: "settings", state: { tab: "transcription" } });
}

const settingsAction = () => ({
  label: t`Transcription settings`,
  onClick: openTranscriptionSettings,
});

/** Retourne `true` quand l'import peut partir ; sinon l'explique et s'arrête. */
export function ensureAudioImportAvailable(
  availability: AudioImportAvailability,
): boolean {
  const reason = describeAudioImportUnavailable(availability);
  if (!reason) {
    return true;
  }
  toast.warning(t`Can't import this audio`, {
    id: "audio-import-unavailable",
    description: reason,
    duration: 10_000,
    action: settingsAction(),
  });
  return false;
}

export function describeAudioImportError(error: unknown): string {
  if (error instanceof AudioUploadTooLargeError) {
    return t`This file is too large to import (2 GB maximum).`;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/^audio_upload_/.test(message)) {
    return t`Syntheo couldn't read this file.`;
  }
  // Issue 714 : pas encore de décodeur Opus, refus avant tout envoi.
  if (/unsupported audio codec: opus/i.test(message)) {
    return t`Opus files (.ogg, .opus, .webm in Opus) are not supported yet: convert the file to MP3, M4A or WAV, then import it again.`;
  }
  // Issue 713 : message traduit, sans adresse complète (« UnexpectedStatus
  // { status: 500, … } » et autres messages bruts du transport).
  return describeServiceError(error);
}

/** Assez long pour lire et cliquer, sans rester sur les écrans suivants. */
export const AUDIO_IMPORT_FAILED_TOAST_DURATION_MS = 12_000;

/** Une erreur pendant l'import s'affiche au lieu d'un rafraîchissement muet. */
export function notifyAudioImportFailed(error: unknown) {
  toast.error(t`Audio import failed`, {
    id: "audio-import-failed",
    description: describeAudioImportError(error),
    duration: AUDIO_IMPORT_FAILED_TOAST_DURATION_MS,
    keepDuration: true,
    action: settingsAction(),
  });
}

/**
 * Import repris au lancement qui échoue (issue 531) : son résultat est
 * abandonné et la note passe en échec. On le dit une fois, au lieu de le
 * retenter en silence à chaque lancement.
 */
export function notifyResumedImportAbandoned({
  sessionId,
  name,
  error,
}: {
  sessionId: string;
  name: string | null;
  error: unknown;
}) {
  const reason = describeAudioImportError(error);
  toast.error(t`Audio import failed`, {
    id: `audio-import-abandoned-${sessionId}`,
    description: name
      ? t`The import of ${name} was abandoned: ${reason}`
      : t`The import was abandoned: ${reason}`,
    duration: AUDIO_IMPORT_FAILED_TOAST_DURATION_MS,
    keepDuration: true,
    action: {
      label: t`Open note`,
      onClick: () =>
        useTabs.getState().openNew({ type: "sessions", id: sessionId }),
    },
  });
}

/**
 * Import interrompu par la fermeture de Syntheo (issue 714) : dit une fois au
 * lancement suivant, avec l'invitation à réimporter le fichier.
 */
export function notifyImportInterrupted({
  sessionId,
  name,
}: {
  sessionId: string;
  name: string | null;
}) {
  toast.error(t`Audio import interrupted`, {
    id: `audio-import-interrupted-${sessionId}`,
    description: name
      ? t`Syntheo was closed before the import of ${name} finished. Import the file again.`
      : t`Syntheo was closed before the import finished. Import the file again.`,
    duration: AUDIO_IMPORT_FAILED_TOAST_DURATION_MS,
    keepDuration: true,
    action: {
      label: t`Open note`,
      onClick: () =>
        useTabs.getState().openNew({ type: "sessions", id: sessionId }),
    },
  });
}
