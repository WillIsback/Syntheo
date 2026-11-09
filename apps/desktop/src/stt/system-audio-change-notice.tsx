import { t } from "@lingui/core/macro";
import { useEffect } from "react";

import { toast } from "@syntheo/ui/components/ui/toast";

import {
  type CapturedOutput,
  detectSystemAudioChange,
  type SystemAudioChange,
} from "./system-audio-change";

import {
  getCapturedSpeakerDevice,
  listSpeakerDevices,
} from "~/settings/general/speaker-device";
import { useConfigValue } from "~/shared/config";
import { useListener } from "~/stt/contexts";

const POLL_MS = 3_000;

export function systemAudioChangeMessage(change: SystemAudioChange) {
  const { output } = change;
  switch (change.kind) {
    case "headphones-unplugged":
      return t`System audio: the headset was unplugged, Syntheo now captures ${output}.`;
    case "headphones-plugged":
      return t`System audio: a headset was plugged in, Syntheo now captures ${output}.`;
    case "output-unavailable": {
      const { previous } = change;
      return t`System audio: ${previous} is no longer available, Syntheo now captures ${output}.`;
    }
    case "output-changed":
      return t`System audio: Syntheo now captures ${output}.`;
  }
}

// Pendant une écoute, surveille la sortie capturée comme son système et
// prévient, sans bloquer, quand elle change (issue 450).
export function SystemAudioChangeNotice() {
  const active = useListener((state) => state.live.status === "active");
  const sessionId = useListener((state) => state.live.sessionId);
  const preferred = useConfigValue("speaker_device");

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;
    let polling = false;
    let previous: CapturedOutput | null = null;

    const poll = async () => {
      if (polling) {
        return;
      }
      polling = true;
      try {
        const [devices, captured] = await Promise.all([
          listSpeakerDevices(),
          getCapturedSpeakerDevice(preferred),
        ]);
        if (cancelled || devices === null) {
          // macOS : la sortie capturée ne se choisit pas, rien à surveiller.
          if (devices === null) {
            clearInterval(timer);
          }
          return;
        }
        const change = detectSystemAudioChange(previous, captured, devices);
        if (change) {
          toast.info(systemAudioChangeMessage(change));
        }
        previous = captured ?? previous;
      } catch (error) {
        console.error("[listener] system audio output check failed", error);
      } finally {
        polling = false;
      }
    };

    const timer = setInterval(() => void poll(), POLL_MS);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, sessionId, preferred]);

  return null;
}
