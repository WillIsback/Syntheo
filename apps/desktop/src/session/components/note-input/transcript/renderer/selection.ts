import {
  addWordToSelection,
  getSelectedEditableWordIndices,
  parseNumberArray,
  parseStringArray,
  rangeIntersectsNode,
  readSegmentKey,
  readWordStartMs,
  type TranscriptWordSelection,
  type TranscriptWordSelectionGroup,
} from "./selection-dom";

import type { Segment, SegmentKey } from "~/stt/live-segment";

export type { TranscriptWordSelection } from "./selection-dom";
export {
  focusTranscriptSelection,
  getTranscriptRangeRects,
  isRangeCoveredBySelection,
} from "./selection-rects";

export function getTranscriptSelectionFromRange(
  range: Range,
  container: HTMLElement,
): TranscriptWordSelection | null {
  if (range.collapsed || !container.contains(range.commonAncestorContainer)) {
    return null;
  }

  const accumulator: SelectionAccumulator = {
    groups: new Map<string, TranscriptWordSelectionGroup>(),
  };
  collectRenderedWords(range, container, accumulator);
  collectEditedWords(range, container, accumulator);

  if (accumulator.groups.size === 0) {
    return null;
  }

  return {
    sessionId: accumulator.sessionId,
    text: range.toString().trim(),
    startMs: accumulator.startMs ?? 0,
    groups: [...accumulator.groups.values()],
  };
}

type SelectionAccumulator = {
  groups: Map<string, TranscriptWordSelectionGroup>;
  sessionId?: string;
  startMs?: number;
};

type SegmentContext = {
  segmentElement: HTMLElement;
  transcriptId: string;
  segmentKey: SegmentKey;
};

function readSegmentContext(element: HTMLElement): SegmentContext | null {
  const segmentElement = element.closest<HTMLElement>("[data-transcript-id]");
  const transcriptId = segmentElement?.dataset.transcriptId;
  const segmentKey = segmentElement
    ? readSegmentKey(segmentElement)
    : undefined;
  if (!segmentElement || !transcriptId || !segmentKey) {
    return null;
  }
  return { segmentElement, transcriptId, segmentKey };
}

function collectRenderedWords(
  range: Range,
  container: HTMLElement,
  accumulator: SelectionAccumulator,
) {
  for (const wordElement of container.querySelectorAll<HTMLElement>(
    "[data-transcript-word-id]",
  )) {
    if (!rangeIntersectsNode(range, wordElement)) {
      continue;
    }

    const wordId = wordElement.dataset.transcriptWordId;
    const context = readSegmentContext(wordElement);
    if (!wordId || !context) {
      continue;
    }

    addWordToSelection(
      accumulator.groups,
      context.transcriptId,
      context.segmentKey,
      wordId,
    );
    accumulator.sessionId ??=
      context.segmentElement.dataset.sessionId || undefined;
    accumulator.startMs ??= readWordStartMs(
      wordElement,
      context.segmentElement,
    );
  }
}

function collectEditedWords(
  range: Range,
  container: HTMLElement,
  accumulator: SelectionAccumulator,
) {
  for (const editorElement of container.querySelectorAll<HTMLElement>(
    "[data-transcript-edit-word-ids]",
  )) {
    if (!rangeIntersectsNode(range, editorElement)) {
      continue;
    }

    const context = readSegmentContext(editorElement);
    if (!context) {
      continue;
    }

    addSelectedEditedWords(range, editorElement, context, accumulator);
  }
}

function addSelectedEditedWords(
  range: Range,
  editorElement: HTMLElement,
  context: SegmentContext,
  accumulator: SelectionAccumulator,
) {
  const wordIds = parseStringArray(editorElement.dataset.transcriptEditWordIds);
  const wordTexts = parseStringArray(
    editorElement.dataset.transcriptEditWordTexts,
  );
  const wordStartMs = parseNumberArray(
    editorElement.dataset.transcriptEditWordStartMs,
  );
  const transcriptOffsetMs = Number(
    context.segmentElement.dataset.transcriptOffsetMs ?? 0,
  );
  for (const index of getSelectedEditableWordIndices(
    range,
    editorElement,
    wordTexts,
  )) {
    const wordId = wordIds[index];
    if (!wordId) {
      continue;
    }
    addWordToSelection(
      accumulator.groups,
      context.transcriptId,
      context.segmentKey,
      wordId,
    );
    accumulator.sessionId ??=
      context.segmentElement.dataset.sessionId || undefined;
    accumulator.startMs ??= (wordStartMs[index] ?? 0) + transcriptOffsetMs;
  }
}

export function getTranscriptContextSelection({
  target,
  container,
  activeRange,
}: {
  target: EventTarget | null;
  container: HTMLElement;
  activeRange?: Range;
}): {
  range: Range;
  selection: TranscriptWordSelection;
  // Section du segment entier, quand la sélection le couvre sans plage.
  sectionKey?: string;
} | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const selectionTarget = target.closest<HTMLElement>(
    "[data-transcript-word-id], [data-transcript-editor]",
  );
  if (!selectionTarget || !container.contains(selectionTarget)) {
    return null;
  }

  if (
    activeRange &&
    !activeRange.collapsed &&
    rangeIntersectsNode(activeRange, selectionTarget)
  ) {
    const selection = getTranscriptSelectionFromRange(activeRange, container);
    if (selection) {
      return { range: activeRange.cloneRange(), selection };
    }
  }

  const segmentContent = selectionTarget.closest<HTMLElement>(
    "[data-transcript-segment-content]",
  );
  if (!segmentContent) {
    return null;
  }

  // Tout le segment, même affiché en plusieurs paragraphes (issue 281) : une
  // section par paragraphe, toutes avec la même identité de segment.
  const section = segmentContent.closest<HTMLElement>(
    "section[data-transcript-segment-id]",
  );
  const contents = section
    ? getSegmentContents(section, container)
    : [segmentContent];
  const first = contents[0] ?? segmentContent;
  const last = contents[contents.length - 1] ?? segmentContent;
  const range = document.createRange();
  range.selectNodeContents(first);
  range.setEnd(last, last.childNodes.length);
  const selection = getTranscriptSelectionFromRange(range, container);
  const sectionKey = section
    ? (getTranscriptSectionKeyFromElement(section) ?? undefined)
    : undefined;
  return selection ? { range, selection, sectionKey } : null;
}

function getSegmentContents(section: HTMLElement, container: HTMLElement) {
  const { transcriptId, transcriptSegmentId } = section.dataset;
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      "section[data-transcript-segment-id]",
    ),
  ).flatMap((candidate) =>
    candidate.dataset.transcriptId === transcriptId &&
    candidate.dataset.transcriptSegmentId === transcriptSegmentId
      ? Array.from(
          candidate.querySelectorAll<HTMLElement>(
            "[data-transcript-segment-content]",
          ),
        )
      : [],
  );
}

// Les paragraphes d'un long segment hors de la fenêtre virtuelle ne sont pas
// montés : le menu contextuel reprend alors le segment entier depuis les
// données, comme quand il était affiché d'un seul bloc.
export function completeTranscriptContextSelection(
  mounted: TranscriptWordSelection,
  entry: TranscriptWordSelection | undefined,
): TranscriptWordSelection {
  if (!entry) {
    return mounted;
  }
  return countSelectedWords(entry) > countSelectedWords(mounted)
    ? entry
    : mounted;
}

function countSelectedWords(selection: TranscriptWordSelection) {
  return selection.groups.reduce(
    (total, group) => total + group.wordIds.length,
    0,
  );
}

export function getTranscriptSegmentDomId(
  transcriptId: string,
  segment: Pick<Segment, "id" | "start_ms" | "end_ms" | "words">,
) {
  return (
    segment.id ||
    `${transcriptId}:${segment.words[0]?.id ?? segment.start_ms}:${segment.words[segment.words.length - 1]?.id ?? segment.end_ms}`
  );
}

export function getTranscriptSectionKey(
  transcriptId: string,
  segmentId: string,
) {
  return `${transcriptId}:${segmentId}`;
}

export function getTranscriptSectionKeyFromElement(section: HTMLElement) {
  const transcriptId = section.dataset.transcriptId;
  const segmentId = section.dataset.transcriptSegmentId;
  return transcriptId && segmentId
    ? getTranscriptSectionKey(transcriptId, segmentId)
    : null;
}

export function getTranscriptSelectionFromSegment({
  transcriptId,
  sessionId,
  offsetMs,
  segment,
}: {
  transcriptId: string;
  sessionId?: string;
  offsetMs: number;
  segment: Pick<Segment, "key" | "text" | "words" | "provisional_speaker">;
}): TranscriptWordSelection | null {
  const wordIds = segment.words
    .map((word) => word.id)
    .filter(
      (wordId): wordId is string =>
        typeof wordId === "string" && wordId.length > 0,
    );
  if (wordIds.length === 0) {
    return null;
  }

  return {
    sessionId,
    text: segment.text.trim(),
    startMs: offsetMs + (segment.words[0]?.start_ms ?? 0),
    groups: [
      {
        transcriptId,
        segmentKey: segment.key,
        ...(segment.provisional_speaker?.human_id
          ? { inferredHumanId: segment.provisional_speaker.human_id }
          : {}),
        wordIds,
      },
    ],
  };
}

export function getTranscriptSectionSelection(
  section: HTMLElement,
  container: HTMLElement,
): TranscriptWordSelection | null {
  const content = section.querySelector<HTMLElement>(
    "[data-transcript-segment-content]",
  );
  if (!content) {
    return null;
  }

  const range = document.createRange();
  range.selectNodeContents(content);
  return getTranscriptSelectionFromRange(range, container);
}

export function mergeTranscriptSelections(
  selections: TranscriptWordSelection[],
): TranscriptWordSelection | null {
  if (selections.length === 0) {
    return null;
  }

  const groups = new Map<string, TranscriptWordSelectionGroup>();
  for (const selection of selections) {
    for (const nextGroup of selection.groups) {
      const group = groups.get(nextGroup.transcriptId) ?? {
        transcriptId: nextGroup.transcriptId,
        segmentKey: nextGroup.segmentKey,
        wordIds: [],
      };
      for (const wordId of nextGroup.wordIds) {
        if (!group.wordIds.includes(wordId)) {
          group.wordIds.push(wordId);
        }
      }
      groups.set(nextGroup.transcriptId, group);
    }
  }

  return {
    sessionId: selections.find((selection) => selection.sessionId)?.sessionId,
    text: selections.map((selection) => selection.text).join("\n\n"),
    startMs: Math.min(...selections.map((selection) => selection.startMs)),
    groups: [...groups.values()],
  };
}

const LIVE_TRANSCRIPT_PLACEHOLDER_ID = "__live-transcript__";

export function getTranscriptMergeTarget(
  selectedKeys: ReadonlySet<string>,
  order: string[],
  entries: Map<string, TranscriptWordSelection>,
) {
  if (selectedKeys.size < 2) {
    return null;
  }

  const indexes = order.flatMap((key, index) =>
    selectedKeys.has(key) ? [index] : [],
  );
  if (indexes.length !== selectedKeys.size) {
    return null;
  }

  for (let index = 1; index < indexes.length; index += 1) {
    if (indexes[index] !== indexes[index - 1]! + 1) {
      return null;
    }
  }

  const firstKey = order[indexes[0]!];
  const first = firstKey ? (entries.get(firstKey) ?? null) : null;
  const targetGroup = first?.groups[0];
  if (!first || !targetGroup) {
    return null;
  }
  if (targetGroup.transcriptId === LIVE_TRANSCRIPT_PLACEHOLDER_ID) {
    return null;
  }
  if (
    !targetGroup.segmentKey.speaker_human_id &&
    !targetGroup.inferredHumanId &&
    typeof targetGroup.segmentKey.speaker_index !== "number"
  ) {
    return null;
  }

  for (const index of indexes) {
    const group = entries.get(order[index]!)?.groups[0];
    if (
      group?.transcriptId !== targetGroup.transcriptId ||
      group?.segmentKey.channel !== targetGroup.segmentKey.channel
    ) {
      return null;
    }
  }

  if (!targetGroup.segmentKey.speaker_human_id && targetGroup.inferredHumanId) {
    return {
      ...first,
      groups: [
        {
          ...targetGroup,
          segmentKey: {
            ...targetGroup.segmentKey,
            speaker_human_id: targetGroup.inferredHumanId,
          },
        },
      ],
    };
  }
  return first;
}
