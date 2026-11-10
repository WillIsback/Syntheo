import { type CSSProperties, useMemo } from "react";

import type { SegmentKey, SegmentWord } from "~/stt/live-segment";
import { speakerColor, speakerColorDark } from "~/stt/speaker-palette";

export type HighlightSegment = { text: string; isMatch: boolean };

type SentenceLine = {
  words: SegmentWord[];
  startMs: number;
  endMs: number;
};

type SegmentColorVars = CSSProperties & {
  "--segment-color-light": string;
  "--segment-color-dark": string;
};

// Fin de phrase : la notion de « ligne » de la transcription.
export function endsSentence(word: SegmentWord): boolean {
  const text = word.text.trim();
  return text.endsWith(".") || text.endsWith("?") || text.endsWith("!");
}

export function groupWordsIntoLines(words: SegmentWord[]): SentenceLine[] {
  if (words.length === 0) return [];

  const lines: SentenceLine[] = [];
  let currentLine: SegmentWord[] = [];

  for (const word of words) {
    currentLine.push(word);
    if (endsSentence(word)) {
      lines.push({
        words: currentLine,
        startMs: currentLine[0]!.start_ms,
        endMs: currentLine[currentLine.length - 1]!.end_ms,
      });
      currentLine = [];
    }
  }

  if (currentLine.length > 0) {
    lines.push({
      words: currentLine,
      startMs: currentLine[0]!.start_ms,
      endMs: currentLine[currentLine.length - 1]!.end_ms,
    });
  }

  return lines;
}

function getSpeakerIndex(key: SegmentKey): number {
  let speakerIndex = key.speaker_index ?? 0;
  if (key.speaker_human_id) {
    speakerIndex = 0;
    for (const character of key.speaker_human_id) {
      speakerIndex =
        (Math.imul(speakerIndex, 31) + character.charCodeAt(0)) >>> 0;
    }
  }
  return speakerIndex;
}

// Palette Syntheo s1–s4 : couleur stable et cyclique par locuteur.
export function getSegmentColorVars(key: SegmentKey): SegmentColorVars {
  const speakerIndex = getSpeakerIndex(key);
  return {
    "--segment-color-light": speakerColor(speakerIndex),
    "--segment-color-dark": speakerColorDark(speakerIndex),
  };
}

export function useSegmentColorVars(key: SegmentKey): SegmentColorVars {
  return useMemo(() => getSegmentColorVars(key), [key]);
}
