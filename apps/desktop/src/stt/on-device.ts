import { useQuery } from "@tanstack/react-query";

import {
  commands as transcriptionCommands,
  type OnDeviceStatus,
  type Probe,
  type Profile,
  type Refusal,
} from "@syntheo/plugin-transcription";

// Source « Sur ce poste » (issues 684 et 685) : adresse interne réservée,
// résolue par l'application au lancement du module ; jamais une adresse
// réelle ni modifiable.
export const ON_DEVICE_BASE_URL = "syntheo-speech://local";
// Moteur retenu par l'issue 680 : parakeet-rs (ONNX Runtime), int8.
export const ON_DEVICE_ENGINE = "parakeet_onnx" as const;
export const ON_DEVICE_STATUS_QUERY_KEY = ["on-device-status"] as const;

export async function loadOnDeviceStatus(): Promise<OnDeviceStatus> {
  const result = await transcriptionCommands.onDeviceStatus();
  if (result.status === "error") throw new Error(result.error);
  return result.data;
}

export function useOnDeviceStatus() {
  return useQuery({
    queryKey: ON_DEVICE_STATUS_QUERY_KEY,
    queryFn: loadOnDeviceStatus,
    staleTime: 30_000,
  });
}

/** La source peut servir : autorisée et module installé et signé. */
export function isOnDeviceUsable(status: OnDeviceStatus | null | undefined) {
  return !!status?.allowed && status.module.kind === "installed";
}

export function isEligible(probe: Probe | null | undefined) {
  return (
    probe?.verdict.kind === "propose" ||
    probe?.verdict.kind === "propose_degraded"
  );
}

export async function runOnDeviceProbe(): Promise<Probe> {
  const result =
    await transcriptionCommands.probeLocalTranscription(ON_DEVICE_ENGINE);
  if (result.status === "error") throw new Error(result.error);
  return result.data;
}

export const PROFILES: readonly Profile[] = [
  "two_streams_diarized",
  "two_streams",
  "one_stream_diarized",
  "one_stream",
];

export const REFUSALS: readonly Refusal[] = [
  "no_avx2",
  "not_enough_memory",
  "not_enough_disk",
  "disk_unknown",
  "too_slow",
];
