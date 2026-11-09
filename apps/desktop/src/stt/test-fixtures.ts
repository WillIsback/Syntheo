// Fabriques partagées par les tests de stt/ : mots de transcript, deltas
// reçus en direct et indices de locuteur au format stocké.
import type { LiveTranscriptDelta } from "@syntheo/plugin-transcription";

export type StoredHint = {
  id: string;
  word_id: string;
  type: string;
  value: string;
};

/** Mot stocké, long de 100 ms par défaut ; son texte vaut son id. */
export function word(
  id: string,
  startMs: number,
  endMs = startMs + 100,
  channel = 0,
  text = id,
) {
  return { id, text, start_ms: startMs, end_ms: endMs, channel };
}

/** Mot final reçu en direct, avec son index de locuteur éventuel. */
export function liveWord(
  id: string,
  startMs: number,
  endMs: number,
  channel = 0,
  speakerIndex?: number,
  text = id,
): LiveTranscriptDelta["new_words"][number] {
  return {
    ...word(id, startMs, endMs, channel, text),
    state: "final",
    ...(speakerIndex === undefined ? {} : { speaker_index: speakerIndex }),
  };
}

export function liveDelta(
  newWords: LiveTranscriptDelta["new_words"],
  replacedIds: string[] = [],
): LiveTranscriptDelta {
  return { new_words: newWords, replaced_ids: replacedIds, partials: [] };
}

export function providerHint(
  wordId: string,
  channel: number,
  speakerIndex: number,
  id = `${wordId}:provider_speaker_index`,
): StoredHint {
  return {
    id,
    word_id: wordId,
    type: "provider_speaker_index",
    value: JSON.stringify({ channel, speaker_index: speakerIndex }),
  };
}

/** Attribution d'une suite de mots à une personne. */
export function segmentHint(
  wordId: string,
  humanId: string,
  wordIds: string[],
  id = `${wordId}:user_speaker_assignment:segment`,
): StoredHint {
  return {
    id,
    word_id: wordId,
    type: "user_speaker_assignment",
    value: JSON.stringify({
      human_id: humanId,
      scope: "segment",
      word_ids: wordIds,
    }),
  };
}

/** Attribution d'un locuteur entier (canal et index) à une personne. */
export function speakerHint(
  wordId: string,
  humanId: string,
  channel: number,
  speakerIndex: number,
): StoredHint {
  return {
    id: `${wordId}:user_speaker_assignment`,
    word_id: wordId,
    type: "user_speaker_assignment",
    value: JSON.stringify({
      human_id: humanId,
      scope: "speaker",
      channel,
      speaker_index: speakerIndex,
    }),
  };
}

/** Ancienne forme d'attribution, sans portée. */
export function legacyHint(
  wordId: string,
  humanId: string,
  type = "user_speaker_assignment",
  id = `${wordId}:${type}`,
): StoredHint {
  return {
    id,
    word_id: wordId,
    type,
    value: JSON.stringify({ human_id: humanId }),
  };
}
