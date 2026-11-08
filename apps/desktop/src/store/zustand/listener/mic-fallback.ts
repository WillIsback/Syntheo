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
