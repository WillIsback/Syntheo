import type { Token } from "@syntheo/plugin-transcription";

import { ChannelProfile } from "~/stt/segment";
import type { SpeakerHintWithId, WordWithId } from "~/stt/types";

/**
 * Un intervenant nommé par une balise de voix `<v Nom>` d'un fichier de
 * sous-titres (issue 785). `speakerIndex` sert d'index de locuteur sur le
 * canal mixte ; `anchorWordId` porte l'attribution au contact.
 */
export type SubtitleSpeaker = {
  name: string;
  speakerIndex: number;
  anchorWordId: string;
};

/** Les mots gardent les champs que l'import écrivait déjà. */
export type SubtitleWord = WordWithId & {
  transcript_id: string;
  user_id: string;
  created_at: string;
};

export type SubtitleTranscript = {
  words: SubtitleWord[];
  speakerHints: SpeakerHintWithId[];
  speakers: SubtitleSpeaker[];
};

export function normalizeSubtitleSpeakerName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Les mots et les repères de locuteur d'une transcription importée. Chaque
 * voix distincte (casse ignorée) reçoit un index de locuteur, dans l'ordre de
 * première apparition : la transcription montre déjà des intervenants séparés
 * avant même que les noms soient rattachés à des contacts. Un jeton sans voix
 * (fichier .srt, .vtt sans balise) reste un mot sans repère, comme avant.
 */
export function buildSubtitleTranscript({
  tokens,
  transcriptId,
  userId,
  createdAt,
  newId,
}: {
  tokens: Token[];
  transcriptId: string;
  userId: string;
  createdAt: string;
  newId: () => string;
}): SubtitleTranscript {
  const words: SubtitleWord[] = [];
  const speakerHints: SpeakerHintWithId[] = [];
  const speakersByKey = new Map<string, SubtitleSpeaker>();

  for (const token of tokens) {
    const wordId = newId();
    words.push({
      id: wordId,
      transcript_id: transcriptId,
      text: token.text,
      start_ms: token.start_time,
      end_ms: token.end_time,
      channel: ChannelProfile.MixedCapture,
      user_id: userId,
      created_at: createdAt,
    });

    const name = token.speaker?.trim().replace(/\s+/g, " ");
    if (!name) {
      continue;
    }

    const key = normalizeSubtitleSpeakerName(name);
    let speaker = speakersByKey.get(key);
    if (!speaker) {
      speaker = {
        name,
        speakerIndex: speakersByKey.size,
        anchorWordId: wordId,
      };
      speakersByKey.set(key, speaker);
    }

    speakerHints.push({
      id: `${wordId}:provider_speaker_index`,
      word_id: wordId,
      type: "provider_speaker_index",
      value: JSON.stringify({
        channel: ChannelProfile.MixedCapture,
        speaker_index: speaker.speakerIndex,
      }),
    });
  }

  return { words, speakerHints, speakers: [...speakersByKey.values()] };
}

/**
 * Rattache chaque voix à son contact, comme le fait « Nommer les
 * intervenants » : une attribution portée par tout le locuteur.
 */
export function buildSubtitleSpeakerAssignments(
  speakers: SubtitleSpeaker[],
  humanIdByName: ReadonlyMap<string, string>,
): SpeakerHintWithId[] {
  return speakers.flatMap((speaker) => {
    const humanId = humanIdByName.get(
      normalizeSubtitleSpeakerName(speaker.name),
    );
    if (!humanId) {
      return [];
    }

    return [
      {
        id: `${speaker.anchorWordId}:user_speaker_assignment`,
        word_id: speaker.anchorWordId,
        type: "user_speaker_assignment",
        value: JSON.stringify({
          human_id: humanId,
          scope: "speaker",
          channel: ChannelProfile.MixedCapture,
          speaker_index: speaker.speakerIndex,
        }),
      },
    ];
  });
}
