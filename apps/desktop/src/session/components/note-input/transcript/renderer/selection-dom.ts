// Lecture des attributs data-* des mots et des éditeurs de la transcription.
import type { SegmentKey } from "~/stt/live-segment";

export type TranscriptWordSelectionGroup = {
  transcriptId: string;
  segmentKey: SegmentKey;
  inferredHumanId?: string;
  wordIds: string[];
};

export type TranscriptWordSelection = {
  sessionId?: string;
  text: string;
  startMs: number;
  groups: TranscriptWordSelectionGroup[];
};

export function readSegmentKey(element: HTMLElement): SegmentKey | undefined {
  const channel = element.dataset.segmentChannel;
  if (
    channel !== "DirectMic" &&
    channel !== "RemoteParty" &&
    channel !== "MixedCapture"
  ) {
    return undefined;
  }

  const speakerIndexValue = element.dataset.segmentSpeakerIndex;
  const speakerIndex =
    speakerIndexValue === undefined || speakerIndexValue === ""
      ? null
      : Number(speakerIndexValue);

  return {
    channel,
    speaker_index: Number.isFinite(speakerIndex) ? speakerIndex : null,
    speaker_human_id: element.dataset.segmentSpeakerHumanId || null,
  };
}

export function addWordToSelection(
  groups: Map<string, TranscriptWordSelectionGroup>,
  transcriptId: string,
  segmentKey: SegmentKey,
  wordId: string,
) {
  const group = groups.get(transcriptId) ?? {
    transcriptId,
    segmentKey,
    wordIds: [],
  };
  if (!group.wordIds.includes(wordId)) {
    group.wordIds.push(wordId);
  }
  groups.set(transcriptId, group);
}

export function getSelectedEditableWordIndices(
  range: Range,
  editor: HTMLElement,
  wordTexts: string[],
) {
  const offsets = getRangeOffsets(range, editor);
  if (!offsets) {
    return [];
  }

  const indices: number[] = [];
  let cursor = 0;
  for (const [index, wordText] of wordTexts.entries()) {
    const start = cursor;
    const end = start + wordText.length;
    if (offsets.start < end && offsets.end > start) {
      indices.push(index);
    }
    cursor = end + 1;
  }
  return indices;
}

function getRangeOffsets(range: Range, container: HTMLElement) {
  if (
    !container.contains(range.startContainer) ||
    !container.contains(range.endContainer)
  ) {
    return null;
  }

  const beforeStart = document.createRange();
  beforeStart.selectNodeContents(container);
  beforeStart.setEnd(range.startContainer, range.startOffset);
  const beforeEnd = document.createRange();
  beforeEnd.selectNodeContents(container);
  beforeEnd.setEnd(range.endContainer, range.endOffset);
  return {
    start: beforeStart.toString().length,
    end: beforeEnd.toString().length,
  };
}

export function parseStringArray(value: string | undefined): string[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function parseNumberArray(value: string | undefined): number[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed)
      ? parsed.map((item) => (typeof item === "number" ? item : 0))
      : [];
  } catch {
    return [];
  }
}

export function readWordStartMs(
  wordElement: HTMLElement,
  segmentElement: HTMLElement | null,
) {
  const wordStartMs = Number(wordElement.dataset.transcriptWordStartMs ?? 0);
  const transcriptOffsetMs = Number(
    segmentElement?.dataset.transcriptOffsetMs ?? 0,
  );
  return wordStartMs + transcriptOffsetMs;
}

export function rangeIntersectsNode(range: Range, node: Node) {
  try {
    return range.intersectsNode(node);
  } catch {
    return false;
  }
}
