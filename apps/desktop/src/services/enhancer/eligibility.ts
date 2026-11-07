import { t } from "@lingui/core/macro";

import {
  MIN_TRANSCRIPT_CHARACTERS_FOR_SUMMARY,
  MIN_WORDS_FOR_SUMMARY,
  getSummaryEligibility,
  type SummaryEligibility,
  type SummaryEligibilitySkipCode,
} from "@syntheo/utils/summary-eligibility";

import { countTranscriptWordCharacters } from "./summary-length";

export type EnhanceEligibilitySkipCode = SummaryEligibilitySkipCode;

export function getEligibility(
  transcripts: ReadonlyArray<{
    words: ReadonlyArray<{ text?: unknown }>;
  }>,
): SummaryEligibility {
  return getSummaryEligibility({
    transcriptCount: transcripts.length,
    wordCount: transcripts.reduce(
      (total, transcript) => total + transcript.words.length,
      0,
    ),
    characterCount: countTranscriptWordCharacters(transcripts),
  });
}

// Le paquet partagé renvoie une raison en anglais ; le texte affiché passe par
// Lingui pour suivre la langue de l'interface.
export function getSummaryIneligibilityReason(
  eligibility: Extract<SummaryEligibility, { eligible: false }>,
): string {
  if (eligibility.code === "no_transcript") {
    return t`No transcript recorded`;
  }

  const { characterCount, wordCount } = eligibility;
  if (wordCount < MIN_WORDS_FOR_SUMMARY) {
    const minWords = MIN_WORDS_FOR_SUMMARY;
    return t`Not enough words recorded (${wordCount}/${minWords} minimum)`;
  }

  const minCharacters = MIN_TRANSCRIPT_CHARACTERS_FOR_SUMMARY;
  return t`Transcript too short to summarize (${characterCount}/${minCharacters} characters minimum)`;
}
