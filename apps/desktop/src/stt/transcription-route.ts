import type { TranscriptionParams } from "@syntheo/plugin-transcription";

import {
  getSttModelTranscriptionMode,
  isSupportedLanguagesBatch,
  isSupportedLanguagesLive,
} from "./capabilities";

type Connection = { provider: string; model: string };
type TranscriptionProvider = TranscriptionParams["provider"];

export function getBatchProvider(
  provider: string,
  _model: string,
): TranscriptionProvider | null {
  // NVIDIA NIM ne propose que le temps réel ; l'import passe par le protocole
  // OpenAI (/v1/audio/transcriptions).
  if (provider === "openai") return "openai";
  return null;
}

/**
 * Un modèle qui ne transcrit qu'en direct peut transcrire un fichier en
 * l'envoyant dans son flux temps réel (issue 463).
 */
export function canStreamFile(provider: string, model: string) {
  return (
    getBatchProvider(provider, model) === null &&
    getSttModelTranscriptionMode(provider, model) === "live"
  );
}

type FileTranscriptionRoute = "batch" | "realtime";

/** Comment un fichier importé sera transcrit, ou `null` s'il ne peut pas l'être. */
export function getFileTranscriptionRoute(
  conn: Connection | null,
): FileTranscriptionRoute | null {
  if (!conn) return null;
  if (getBatchProvider(conn.provider, conn.model)) return "batch";
  return canStreamFile(conn.provider, conn.model) ? "realtime" : null;
}

/**
 * Le lot d'abord ; le flux temps réel seulement pour l'appelant qui l'accepte
 * (l'import de fichier, les morceaux d'audio d'une capture à réparer). Les
 * autres fonctions restent liées au lot.
 */
export function selectTranscriptionProvider(
  provider: string,
  model: string,
  allowRealtimeStream: boolean,
): TranscriptionProvider | null {
  const batch = getBatchProvider(provider, model);
  if (batch) return batch;
  return allowRealtimeStream && canStreamFile(provider, model)
    ? "realtime"
    : null;
}

export function canUseTranscriptionTarget(
  target: TranscriptionProvider,
  connectionProvider: string | undefined,
  model: string,
  languages: readonly string[],
) {
  return target === "realtime"
    ? isSupportedLanguagesLive(connectionProvider ?? target, model, languages)
    : isSupportedLanguagesBatch(target, model, languages);
}

/** Libellé enregistré avec le transcript : le vrai fournisseur, pas « realtime ». */
export function storedTranscriptionProvider(
  target: TranscriptionProvider,
  connectionProvider: string | null | undefined,
): string {
  return target === "realtime" && connectionProvider
    ? connectionProvider
    : target;
}
