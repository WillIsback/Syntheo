import { t } from "@lingui/core/macro";

import { toast } from "@syntheo/ui/components/ui/toast";

// Le natif remonte dans `audio_ready` le nom du micro réellement ouvert.
// S'il diffère du micro choisi, la capture s'est repliée sur un autre
// périphérique (souvent le micro par défaut) : on le dit (issue 433).
// Nom du périphérique par défaut côté cpal (ALSA comme Core Audio).
const DEFAULT_DEVICE_NAME = "Default Audio Device";

export const getMicFallback = (
  requested: string | null | undefined,
  opened: string | null | undefined,
): string | null =>
  requested && opened && requested !== opened ? requested : null;

export const notifyMicFallback = (
  sessionId: string,
  requested: string | null | undefined,
  opened: string | null | undefined,
  openSettings: () => void,
) => {
  const missing = getMicFallback(requested, opened);
  if (!missing || !opened) return;
  toast.warning(t`Microphone "${missing}" not found`, {
    id: `mic-fallback-${sessionId}`,
    description:
      opened === DEFAULT_DEVICE_NAME
        ? t`Recording with the default microphone instead. Check that the microphone is plugged in, or choose another one.`
        : t`Recording with "${opened}" instead. Check that the microphone is plugged in, or choose another one.`,
    action: {
      label: t`Device settings`,
      onClick: openSettings,
    },
  });
};

/** Le natif a refusé l'entrée par défaut, monitor de la sortie (issue 715). */
export const isMicMonitorRefusal = (error: string): boolean =>
  error.startsWith("audio_mic_unavailable") &&
  error.includes("mic_default_is_monitor");

/**
 * Le micro a disparu et la seule entrée restante renvoie le son du poste :
 * elle n'est pas enregistrée comme micro, et on le dit une fois.
 */
export const notifyMicMonitorRefused = (
  sessionId: string,
  openSettings: () => void,
) => {
  toast.warning(t`No microphone available`, {
    id: `mic-monitor-${sessionId}`,
    description: t`The only remaining input is the computer's sound output, so it is not recorded as your microphone. Plug in a microphone or choose one in the device settings. System audio continues.`,
    action: {
      label: t`Device settings`,
      onClick: openSettings,
    },
  });
};
