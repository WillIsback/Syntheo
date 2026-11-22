import { t } from "@lingui/core/macro";
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

/** Une installation est possible : clé de signature configurée. */
export function isOnDeviceInstallable(
  status: OnDeviceStatus | null | undefined,
) {
  return !!status?.allowed && status.installable;
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

export const ON_DEVICE_COMMISSIONING_QUERY_KEY = [
  "on-device-commissioning",
] as const;

export async function loadOnDeviceCommissioning() {
  const result = await transcriptionCommands.onDeviceCommissioning();
  if (result.status === "error") throw new Error(result.error);
  return result.data;
}

export function useOnDeviceCommissioning(enabled: boolean) {
  return useQuery({
    queryKey: ON_DEVICE_COMMISSIONING_QUERY_KEY,
    queryFn: loadOnDeviceCommissioning,
    enabled,
  });
}

/** Mesure les profils (une à deux minutes) et enregistre le résultat. */
export async function runOnDeviceCommissioning() {
  const result = await transcriptionCommands.onDeviceCommission();
  if (result.status === "error") throw new Error(result.error);
  return result.data;
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

/**
 * Message clair pour un code d'erreur du module (commandes du plugin, état
 * « refusé ») : jamais de texte technique affiché tel quel.
 */
export function describeOnDeviceError(code: string): string {
  switch (code) {
    case "capture_in_progress":
      return t`Stop the recording first.`;
    case "disabled":
      return t`Your administrator has disabled transcription on this computer.`;
    case "no_key":
      return t`Installing the module is not available yet.`;
    case "not_manifest":
      return t`Choose the manifest.json file of the module folder.`;
    case "unsafe_path":
      return t`Choose a module folder on this computer (not on a network share).`;
    case "running":
      return t`The module is in use. Stop the recording, then try again.`;
    case "installing":
      return t`An installation is already in progress.`;
    case "bad_signature":
      return t`The module is not signed by Syntheo.`;
    case "module_altered":
      return t`A file of the module has been modified.`;
    case "module_incomplete":
      return t`The module folder is incomplete or contains unexpected files.`;
    case "incompatible":
      return t`This module is not made for this computer.`;
    case "app_too_old":
      return t`This module needs a newer version of Syntheo.`;
    case "module_too_old":
      return t`This module is older than the one already accepted.`;
    case "measuring":
      return t`A measurement is already in progress.`;
    case "no_commissioning_audio":
      return t`The module has no measurement audio. Install it again.`;
    case "measure_failed":
      return t`The measurement could not run. Try again.`;
    case "io":
      return t`The module files could not be read or written (disk full?). Try again.`;
    default:
      return t`The operation failed. Try again.`;
  }
}
