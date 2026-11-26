import { t } from "@lingui/core/macro";
import { useQuery } from "@tanstack/react-query";

import {
  commands as transcriptionCommands,
  type OnDeviceModels,
  type OnDeviceStatus,
  type Probe,
} from "@syntheo/plugin-transcription";

/**
 * Modèles d'une autre version en place (QA 0.8.0-4) : fichiers gardés sans
 * téléchargement interrompu ; le reste est à télécharger, ce n'est pas une
 * reprise. La carte, son encart et l'état de la transcription le disent de la
 * même façon : une mise à jour (issue 698).
 */
export function isModelsUpdate(models: OnDeviceModels): boolean {
  return (
    models.kind === "partial" && !models.resumable && models.presentBytes > 0
  );
}

/**
 * Pourquoi la source « Sur ce poste », choisie et autorisée, ne peut pas
 * servir faute de module installé : programme compagnon absent, modèles d'une
 * autre version (mise à jour), ou modèles absents. `null` : module installé.
 */
export type OnDeviceUnavailability =
  | "companion_missing"
  | "models_update"
  | "models_missing";

export function onDeviceUnavailability(
  status: OnDeviceStatus | null | undefined,
): OnDeviceUnavailability | null {
  if (!status) return null;
  if (!status.companion) return "companion_missing";
  if (status.models.kind === "installed") return null;
  return isModelsUpdate(status.models) ? "models_update" : "models_missing";
}

/**
 * Message de la source « Sur ce poste » qui ne peut pas servir : le même pour
 * l'état de la transcription, l'avertissement des réglages et le démarrage
 * d'une écoute (issue 763), jamais « aucun fournisseur ».
 */
export function describeOnDeviceUnavailability(
  reason: OnDeviceUnavailability,
): string {
  switch (reason) {
    case "companion_missing":
      return t`This version of Syntheo does not include transcription on this computer. Go back to the server in Settings › Transcription.`;
    case "models_update":
      return t`The transcription models of this computer need an update. Update them or go back to the server in Settings › Transcription.`;
    case "models_missing":
      return t`The transcription models of this computer are not installed. Install them or go back to the server in Settings › Transcription.`;
  }
}

// Source « Sur ce poste » (issues 684 et 685) : adresse interne réservée,
// résolue par l'application au lancement du module ; jamais une adresse
// réelle ni modifiable.
export const ON_DEVICE_BASE_URL = "syntheo-speech://local";
// Moteur retenu par l'issue 680 : parakeet-rs (ONNX Runtime), int8.
const ON_DEVICE_ENGINE = "parakeet_onnx" as const;
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
 * Ce qu'un téléchargement interrompu laisse (issue 764) : un téléchargement
 * partiel à reprendre (`.part` ou fichiers terminés pendant l'essai), ou
 * rien, les modèles déjà en place (d'une autre version) étant gardés ou non.
 */
export type DownloadLeftover = "partial" | "nothing_models_kept" | "nothing";

function presentBytes(models: OnDeviceModels): number {
  if (models.kind === "missing") return 0;
  if (models.kind === "partial") return models.presentBytes;
  return models.totalBytes;
}

/**
 * Compare l'état des modèles avant l'essai et après l'échec. `undefined` :
 * état illisible, rien à affirmer.
 */
export function downloadLeftover(
  before: OnDeviceModels | null | undefined,
  after: OnDeviceModels | null | undefined,
): DownloadLeftover | undefined {
  if (!after) return undefined;
  if (after.kind === "partial" && after.resumable) return "partial";
  if (!before) return undefined;
  if (presentBytes(after) > presentBytes(before)) return "partial";
  // « Modèles actuels gardés » seulement pour de vrais modèles d'une autre
  // version en place avant l'essai, pas pour n'importe quel octet présent.
  return isModelsUpdate(before) && presentBytes(after) > 0
    ? "nothing_models_kept"
    : "nothing";
}

/**
 * Message clair pour un code d'erreur du module (commandes du plugin, état
 * « refusé ») : jamais de texte technique affiché tel quel. Pour un
 * téléchargement interrompu, `leftover` dit s'il reprendra : « reprend là où
 * il s'est arrêté » seulement s'il existe un téléchargement partiel
 * (issue 764).
 */
// Ces messages s'insèrent après le deux-points d'une phrase composée
// (« Les modèles n'ont pas été installés : … ») : ils n'en contiennent
// jamais eux-mêmes (issue 783).
export function describeOnDeviceError(
  code: string,
  leftover?: DownloadLeftover,
): string {
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
      return t`Downloading the models is not available. Install them from a folder.`;
    case "network":
      switch (leftover) {
        case "partial":
          return t`The models could not be downloaded (network or server). Try again, the download resumes where it stopped.`;
        case "nothing_models_kept":
          return t`No connection to the download server. Nothing was downloaded and the current models are kept. Try again once connected.`;
        case "nothing":
          return t`No connection to the download server. Nothing was downloaded. Try again once connected.`;
        default:
          return t`The models could not be downloaded (network or server). Try again.`;
      }
    case "cancelled":
      return leftover === "partial"
        ? t`Installation cancelled. A download resumes where it stopped.`
        : t`Installation cancelled.`;
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
export function describeOnDeviceErrorAfterColon(
  code: string,
  leftover?: DownloadLeftover,
): string {
  return afterColon(describeOnDeviceError(code, leftover));
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
