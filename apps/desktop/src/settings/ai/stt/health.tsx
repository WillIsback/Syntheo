import { t } from "@lingui/core/macro";

import { usesDeferredProviderAuthentication } from "@syntheo/provider-validation";

import { useConfigValues } from "~/shared/config";
import { useOnDeviceStatus } from "~/stt/on-device";
import { useSTTConnection } from "~/stt/useSTTConnection";

type HealthStatus = {
  status: "pending" | "error" | "success" | null;
  message?: string;
};

export function useConnectionHealth(): HealthStatus {
  const { conn } = useSTTConnection();
  const { current_stt_provider, stt_on_device } = useConfigValues([
    "current_stt_provider",
    "stt_on_device",
  ] as const);
  const onDevice = useOnDeviceStatus();

  if (!conn) {
    // Source « Sur ce poste » choisie mais module absent ou refusé : la
    // raison, pas le message générique (la carte propose « Installer » ou
    // « Revenir au serveur »).
    if (stt_on_device && onDevice.data?.allowed) {
      return {
        status: "error",
        message:
          onDevice.data.module.kind === "invalid"
            ? t`The transcription module of this computer is refused. Install it again or go back to the server in Settings › Transcription.`
            : t`The transcription module of this computer is not installed. Install it or go back to the server in Settings › Transcription.`,
      };
    }
    return { status: "error", message: "Provider not configured." };
  }

  if (usesDeferredProviderAuthentication("stt", current_stt_provider ?? "")) {
    return {
      status: null,
      message: "Credentials will be checked when transcription starts.",
    };
  }
  return { status: "success" };
}
