import { t } from "@lingui/core/macro";
import { useQuery } from "@tanstack/react-query";

import {
  commands as transcriptionCommands,
  type OnDeviceStatus,
  type Probe,
} from "@syntheo/plugin-transcription";

// Source « Sur ce poste » (issues 684 et 685) : adresse interne réservée,
// résolue par l'application au lancement du module ; jamais une adresse
// réelle ni modifiable.
export const ON_DEVICE_BASE_URL = "syntheo-speech://local";
// Moteur retenu par l'issue 680 : parakeet-rs (ONNX Runtime), int8.
const ON_DEVICE_ENGINE = "parakeet_onnx" as const;
export const ON_DEVICE_STATUS_QUERY_KEY = ["on-device-status"] as const;

async function loadOnDeviceStatus(): Promise<OnDeviceStatus> {
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

/**
 * Les modèles peuvent être installés (issue 683) : source autorisée et
 * programme compagnon livré avec cette version de l'application.
 */
export function isOnDeviceInstallable(
  status: OnDeviceStatus | null | undefined,
) {
  return !!status?.allowed && status.companion;
}

/** La source peut servir : autorisée, compagnon présent, modèles installés. */
export function isOnDeviceUsable(status: OnDeviceStatus | null | undefined) {
  return (
    !!status?.allowed && status.companion && status.models.kind === "installed"
  );
}

/** Télécharge les modèles depuis les sources de l'application. */
export async function downloadOnDeviceModels() {
  const result = await transcriptionCommands.onDeviceDownloadModels();
  if (result.status === "error") throw new Error(result.error);
  return result.data;
}

/** Installe les modèles depuis un dossier choisi côté Rust ; `null` : annulé. */
export async function installOnDeviceModelsFromFolder() {
  const result = await transcriptionCommands.onDeviceInstallModels();
  if (result.status === "error") throw new Error(result.error);
  return result.data;
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

/** Mesure les profils (de moins d'une minute à environ trois minutes) et enregistre le résultat. */
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
    case "unsafe_path":
      return t`Choose a folder on this computer (not on a network share).`;
    case "running":
      return t`Transcription on this computer is in use. Stop the recording, then try again.`;
    case "installing":
      return t`An installation is already in progress.`;
    case "companion_missing":
      return t`This version of Syntheo does not include transcription on this computer, or its program is missing. Reinstall Syntheo.`;
    case "companion_altered":
      return t`The transcription program of this computer has been modified. Reinstall Syntheo.`;
    case "models_missing":
      return t`The models are not installed or are incomplete.`;
    case "models_altered":
      return t`A model file has been modified. Remove the models and install them again.`;
    case "models_not_found":
      return t`This folder does not contain the models. Choose the folder that contains the model files.`;
    case "models_mismatch":
      return t`A model file does not match the expected file (damaged or another version).`;
    case "not_enough_disk":
      return t`Not enough free disk space for the models (2 GB needed).`;
    case "no_download_source":
      return t`Downloading the models is not available: install them from a folder.`;
    case "network":
      return t`The models could not be downloaded (network or server). Try again: the download resumes where it stopped.`;
    case "cancelled":
      return t`Installation cancelled. A download resumes where it stopped.`;
    case "measuring":
      return t`A measurement is already in progress.`;
    case "invalid":
      return t`The transcription program or its models have been modified or are missing. Reinstall Syntheo or install the models again.`;
    case "crashing":
      return t`The transcription program keeps stopping. Try again in a few minutes.`;
    case "execution_blocked":
      return t`This computer does not allow the transcription program to run from the Syntheo data folder (application control policy or noexec mount). Ask your administrator.`;
    case "no_commissioning_audio":
      return t`The measurement audio is missing from this version of Syntheo.`;
    case "measure_failed":
      return t`The measurement could not run. Try again.`;
    case "io":
      return t`The files could not be read or written (disk full?). Try again.`;
    default:
      return t`The operation failed. Try again.`;
  }
}

// Noms propres et sigles gardés tels quels en tête d'une phrase insérée.
const KEEP_CAPITALIZED = new Set(["Syntheo", "Windows", "macOS", "Linux"]);

/**
 * Phrase insérée après deux-points dans une phrase composée (« … est en
 * pause : ce poste n'autorise pas… ») : sa première lettre passe en
 * minuscule, sauf pour un nom propre ou un sigle (QA 0.8.0-4).
 */
export function afterColon(sentence: string): string {
  const first = sentence.split(/[\s'’,.:;]/, 1)[0] ?? "";
  if (
    !first ||
    KEEP_CAPITALIZED.has(first) ||
    (first.length > 1 && first === first.toLocaleUpperCase())
  ) {
    return sentence;
  }
  return sentence.charAt(0).toLocaleLowerCase() + sentence.slice(1);
}

/** Message d'erreur du module, à insérer après deux-points. */
export function describeOnDeviceErrorAfterColon(code: string): string {
  return afterColon(describeOnDeviceError(code));
}

// Refus de lancement qui arrête une mise en service (codes de l'hôte) : la
// mesure n'a pas eu lieu, le poste n'est pas « trop lent ».
const LAUNCH_REFUSALS = ["execution_blocked", "invalid", "disabled"] as const;

/** Raison du refus de lancement enregistrée par la dernière mise en service. */
export function launchRefusal(
  commissioning:
    | { profile: string | null; measures: { error: string | null }[] }
    | null
    | undefined,
): string | null {
  if (!commissioning || commissioning.profile) return null;
  const last = commissioning.measures[commissioning.measures.length - 1];
  const error = last?.error ?? null;
  return error && (LAUNCH_REFUSALS as readonly string[]).includes(error)
    ? error
    : null;
}

/** Profil « un seul flux » : seul le micro est transcrit. */
export function isSingleStreamProfile(profile: string | null | undefined) {
  return profile === "one_stream" || profile === "one_stream_diarized";
}

export function getSingleStreamReminderMessage() {
  return t`Transcription on this computer uses the microphone only: the computer's sound (remote participants) is not transcribed.`;
}
