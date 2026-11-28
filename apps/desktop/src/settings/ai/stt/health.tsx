import { usesDeferredProviderAuthentication } from "@syntheo/provider-validation";

import { useConfigValues } from "~/shared/config";
import {
  describeOnDeviceUnavailability,
  type OnDeviceUnavailability,
  onDeviceUnavailability,
  useOnDeviceStatus,
} from "~/stt/on-device";
import { useSTTConnection } from "~/stt/useSTTConnection";

export type HealthStatus = {
  status: "pending" | "error" | "success" | null;
  message?: string;
  // Source « Sur ce poste » choisie mais inutilisable : la raison, pour
  // proposer l'action qui convient (mise à jour des modèles, issue 763).
  onDeviceUnavailable?: OnDeviceUnavailability;
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
    const reason = onDevice.data?.allowed
      ? onDeviceUnavailability(onDevice.data)
      : null;
    if (stt_on_device && reason) {
      return {
        status: "error",
        message: describeOnDeviceUnavailability(reason),
        onDeviceUnavailable: reason,
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
