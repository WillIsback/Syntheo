// Estimation des hauteurs et index des lignes de la liste virtuelle.
import type { Segment } from "~/stt/live-segment";

const ESTIMATED_LINE_HEIGHT = 22;
const ESTIMATED_ROW_CHARS = 90;
export const ESTIMATED_ROW_CHROME = 36;
const SEGMENT_GAP = 16;
// Paragraphe suivant d'une même prise de parole (issue 281) : ni en-tête, ni
// marge sous l'en-tête, et un espacement de paragraphe plus serré.
const ESTIMATED_CONTINUATION_CHROME = 0;
const PARAGRAPH_GAP = 8;
export const OVERSCAN_PX = 800;
export const FALLBACK_VIEWPORT_HEIGHT = 800;

// Largeur moyenne d'un caractère du texte de transcription : 90 caractères
// tiennent dans la colonne pleine largeur (~680px).
const ESTIMATED_CHAR_WIDTH_PX = 7.5;

function estimatedCharsPerRow(rowWidthPx?: number) {
  if (!rowWidthPx || !Number.isFinite(rowWidthPx) || rowWidthPx <= 0) {
    return ESTIMATED_ROW_CHARS;
  }
  return Math.max(12, Math.floor(rowWidthPx / ESTIMATED_CHAR_WIDTH_PX));
}

// La marge d'écoute ne fait que 280px : estimer avec la largeur réelle évite
// que les hauteurs mesurées, bien plus grandes que l'estimation, ne décalent
// brutalement les blocs à chaque mesure.
// Les hauteurs estimées sont recalculées à chaque battement pour toutes les
// lignes : le compte de caractères d'une ligne inchangée n'est pas relu
// (issue 287).
const characterCounts = new WeakMap<Segment, number>();

function getCharacterCount(segment: Segment): number {
  let count = characterCounts.get(segment);
  if (count === undefined) {
    count = segment.words.reduce(
      (total, word) => total + word.text.length + 1,
      0,
    );
    characterCounts.set(segment, count);
  }
  return count;
}

export function estimateTranscriptRowHeight(
  segment: Segment,
  index: number,
  rowWidthPx?: number,
  continuation = false,
) {
  const characterCount = getCharacterCount(segment);
  const lineCount =
    characterCount === 0
      ? 0
      : Math.max(
          1,
          Math.ceil(characterCount / estimatedCharsPerRow(rowWidthPx)),
        );
  if (continuation) {
    return (
      ESTIMATED_CONTINUATION_CHROME +
      lineCount * ESTIMATED_LINE_HEIGHT +
      (index > 0 ? PARAGRAPH_GAP : 0)
    );
  }
  return (
    ESTIMATED_ROW_CHROME +
    lineCount * ESTIMATED_LINE_HEIGHT +
    (index > 0 ? SEGMENT_GAP : 0)
  );
}

export function findRowIndex(offsets: number[], target: number): number {
  if (offsets.length <= 1) return 0;
  let low = 0;
  let high = offsets.length - 2;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle + 1]! <= target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

// Première ligne qui contient le mot `wordId`.
export function findWordSegmentIndex(
  segments: Segment[],
  wordId: string,
): number | null {
  const index = segments.findIndex((segment) =>
    segment.words.some((word) => word.id === wordId),
  );
  return index === -1 ? null : index;
}

export function createSegmentIndex(segments: Segment[]) {
  const playbackStarts: number[] = [];
  const playbackEnds: number[] = [];
  const playbackSegmentIndexes: number[] = [];
  const playbackPrefixMaxEnds: number[] = [];

  segments.forEach((segment, segmentIndex) => {
    const first = segment.words[0];
    const last = segment.words[segment.words.length - 1];
    if (!first || !last) return;
    const start = first.start_ms ?? 0;
    const end = last.end_ms ?? 0;
    playbackStarts.push(start);
    playbackEnds.push(end);
    playbackSegmentIndexes.push(segmentIndex);
    playbackPrefixMaxEnds.push(
      Math.max(
        playbackPrefixMaxEnds[playbackPrefixMaxEnds.length - 1] ??
          Number.NEGATIVE_INFINITY,
        end,
      ),
    );
  });

  return {
    playbackStarts,
    playbackEnds,
    playbackSegmentIndexes,
    playbackPrefixMaxEnds,
  };
}

export function findPlaybackSegmentIndex(
  index: ReturnType<typeof createSegmentIndex>,
  currentMs: number,
  offsetMs: number,
): number | null {
  if (currentMs <= 0) return null;
  const target = currentMs - offsetMs;
  let low = 0;
  let high = index.playbackStarts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (index.playbackStarts[middle]! <= target) low = middle + 1;
    else high = middle;
  }
  const lastStarted = low - 1;
  if (lastStarted < 0) return null;

  low = 0;
  high = lastStarted;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (index.playbackPrefixMaxEnds[middle]! < target) low = middle + 1;
    else high = middle;
  }
  return index.playbackEnds[low]! >= target
    ? index.playbackSegmentIndexes[low]!
    : null;
}
