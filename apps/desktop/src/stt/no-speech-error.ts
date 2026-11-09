import { t } from "@lingui/core/macro";

export const NO_SPEECH_ERROR_CODE = "no_speech";

/**
 * La transcription n'a rendu aucune parole. Le message s'affiche traduit ; la
 * détection passe par la classe ou le code, jamais par le texte (issue 525).
 */
export class NoSpeechDetectedError extends Error {
  readonly code = NO_SPEECH_ERROR_CODE;

  constructor() {
    super(t`No speech was detected in the audio.`);
    this.name = "NoSpeechDetectedError";
  }
}

export function isNoSpeechDetectedError(error: unknown): boolean {
  return (
    error instanceof NoSpeechDetectedError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === NO_SPEECH_ERROR_CODE)
  );
}
