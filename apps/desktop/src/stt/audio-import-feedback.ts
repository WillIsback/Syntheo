import { t } from "@lingui/core/macro";
import { useMemo } from "react";

import { toast } from "@syntheo/ui/components/ui/toast";

import { AudioUploadTooLargeError } from "./audio-upload-stream";
import { getBatchProvider } from "./useRunBatch";
import { useSTTConnection } from "./useSTTConnection";

import { useTabs } from "~/store/zustand/tabs";

/**
 * Importer un fichier passe par la transcription par lot. Un modèle qui ne
 * transcrit qu'en direct (NVIDIA streaming) ne peut pas le faire : on le dit
 * avant de toucher à la note (issue 462).
 */
export type AudioImportAvailability =
  | { status: "ready" }
  | { status: "no_provider" }
  | { status: "live_only" };

export function getAudioImportAvailability(
  conn: { provider: string; model: string } | null,
): AudioImportAvailability {
  if (!conn) {
    return { status: "no_provider" };
  }
  // Même choix de cible que `useRunBatch`.
  if (!getBatchProvider(conn.provider, conn.model)) {
    return { status: "live_only" };
  }
  return { status: "ready" };
}

export function useAudioImportAvailability(): AudioImportAvailability {
  const { conn } = useSTTConnection();
  return useMemo(() => getAudioImportAvailability(conn), [conn]);
}

export function describeAudioImportUnavailable(
  availability: AudioImportAvailability,
): string | null {
  switch (availability.status) {
    case "ready":
      return null;
    case "live_only":
      return t`This model only transcribes live: importing a file requires a batch transcription model.`;
    case "no_provider":
      return t`No transcription service is set up: importing a file requires a batch transcription model.`;
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
  return message;
}

/** Une erreur pendant l'import s'affiche au lieu d'un rafraîchissement muet. */
export function notifyAudioImportFailed(error: unknown) {
  toast.error(t`Audio import failed`, {
    id: "audio-import-failed",
    description: describeAudioImportError(error),
    duration: Infinity,
    action: settingsAction(),
  });
}
