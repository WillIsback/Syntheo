import {
  type FocusEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import {
  createTranscriptSearchIndex,
  getTranscriptSearchIndexMatches,
  registerTranscriptSearchSource,
  type TranscriptSearchSource,
} from "../../search/matching";
import { scrollBehavior } from "./viewport-hooks";
import {
  createSegmentIndex,
  ESTIMATED_ROW_CHROME,
  estimateTranscriptRowHeight,
  FALLBACK_VIEWPORT_HEIGHT,
  findPlaybackSegmentIndex,
  findRowIndex,
  findWordSegmentIndex,
  OVERSCAN_PX,
} from "./virtual-layout";
import {
  useElementWidth,
  useSelectedSegmentIndexes,
  useVirtualViewport,
} from "./virtual-viewport";

import type { Segment } from "~/stt/live-segment";

export { estimateTranscriptRowHeight } from "./virtual-layout";
export { VirtualSegmentRow } from "./virtual-segment-row";

export function useVirtualSegments({
  segments,
  segmentKeys,
  continuations,
  scrollElement,
  activeMatchId,
  searchEnabled,
  currentMs,
  offsetMs,
}: {
  segments: Segment[];
  segmentKeys: string[];
  // Lignes qui poursuivent la prise de parole précédente (sans en-tête).
  continuations?: readonly boolean[];
  scrollElement: HTMLDivElement | null;
  activeMatchId: string | null;
  searchEnabled: boolean;
  currentMs: number;
  offsetMs: number;
}) {
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [measuredHeights, setMeasuredHeights] = useState<
    ReadonlyMap<string, number>
  >(() => new Map());
  const unregisterSearchRef = useRef<(() => void) | null>(null);
  const searchSourceRef = useRef<TranscriptSearchSource>(() => []);
  const scrollToIndexRef = useRef<
    (index: number, behavior: ScrollBehavior) => void
  >(() => {});
  const keySet = useMemo(() => new Set(segmentKeys), [segmentKeys]);
  const latestKeysRef = useRef(keySet);
  latestKeysRef.current = keySet;
  const pendingHeightsRef = useRef(new Map<string, number>());
  const measurementFrameRef = useRef<number | null>(null);

  useMountEffect(() => {
    return () => {
      if (measurementFrameRef.current !== null) {
        cancelAnimationFrame(measurementFrameRef.current);
        measurementFrameRef.current = null;
      }
      pendingHeightsRef.current.clear();
    };
  });

  const listWidth = useElementWidth(listElement);
  const estimatedHeights = useMemo(
    () =>
      segments.map((segment, index) =>
        estimateTranscriptRowHeight(
          segment,
          index,
          listWidth,
          continuations?.[index] ?? false,
        ),
      ),
    [continuations, listWidth, segments],
  );
  const offsets = useMemo(() => {
    const values = [0];
    for (const [index, key] of segmentKeys.entries()) {
      values.push(
        values[index] +
          (measuredHeights.get(key) ??
            estimatedHeights[index] ??
            ESTIMATED_ROW_CHROME),
      );
    }
    return values;
  }, [estimatedHeights, measuredHeights, segmentKeys]);
  const totalHeight = offsets[offsets.length - 1] ?? 0;
  const viewport = useVirtualViewport(scrollElement, listElement);
  // Index construits seulement quand ils servent (recherche, lecture) : à
  // chaque battement de l'écoute, ils reliraient tous les mots (issue 287).
  const activeMatchIndex = useMemo(
    () =>
      activeMatchId ? findWordSegmentIndex(segments, activeMatchId) : null,
    [activeMatchId, segments],
  );
  const playing = currentMs > 0;
  const segmentIndex = useMemo(
    () => (playing ? createSegmentIndex(segments) : null),
    [playing, segments],
  );
  const playbackIndex = useMemo(
    () =>
      segmentIndex
        ? findPlaybackSegmentIndex(segmentIndex, currentMs, offsetMs)
        : null,
    [currentMs, offsetMs, segmentIndex],
  );
  const selectedIndexes = useSelectedSegmentIndexes(listElement);
  const virtualItems = useMemo(() => {
    const visibleTop = viewport.scrollTop - viewport.listTop;
    const visibleBottom = visibleTop + viewport.height;
    const indexes = new Set<number>();

    if (visibleBottom > 0 && visibleTop < totalHeight) {
      const start = findRowIndex(
        offsets,
        Math.max(0, visibleTop - OVERSCAN_PX),
      );
      const end = findRowIndex(
        offsets,
        Math.min(totalHeight, visibleBottom + OVERSCAN_PX),
      );
      for (
        let index = start;
        index <= end && index < segments.length;
        index++
      ) {
        indexes.add(index);
      }
    } else if (!scrollElement && segments.length > 0) {
      const end = findRowIndex(offsets, FALLBACK_VIEWPORT_HEIGHT + OVERSCAN_PX);
      for (let index = 0; index <= end && index < segments.length; index++) {
        indexes.add(index);
      }
    }

    if (activeMatchIndex !== null) indexes.add(activeMatchIndex);
    if (playbackIndex !== null) indexes.add(playbackIndex);
    if (focusedIndex !== null) indexes.add(focusedIndex);
    for (const index of selectedIndexes) indexes.add(index);

    return Array.from(indexes)
      .sort((left, right) => left - right)
      .map((index) => {
        const key = segmentKeys[index]!;
        return {
          index,
          key,
          top: offsets[index]!,
          measuredHeight: measuredHeights.get(key),
        };
      });
  }, [
    activeMatchIndex,
    focusedIndex,
    measuredHeights,
    offsets,
    playbackIndex,
    scrollElement,
    selectedIndexes,
    segmentKeys,
    segments.length,
    totalHeight,
    viewport.height,
    viewport.listTop,
    viewport.scrollTop,
  ]);

  const measureRow = useCallback((key: string, height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    pendingHeightsRef.current.set(key, height);
    if (measurementFrameRef.current !== null) return;

    // Resizing reflows many rows together; copy the height cache only once.
    measurementFrameRef.current = requestAnimationFrame(() => {
      measurementFrameRef.current = null;
      const pending = pendingHeightsRef.current;
      pendingHeightsRef.current = new Map();
      setMeasuredHeights((current) => {
        const keys = latestKeysRef.current;
        const changed = Array.from(pending).some(([key, height]) => {
          const previous = current.get(key);
          return (
            keys.has(key) &&
            (previous === undefined || Math.abs(previous - height) >= 1)
          );
        });
        const pruneNeeded = Array.from(current.keys()).some(
          (key) => !keys.has(key),
        );
        if (!changed && !pruneNeeded) return current;

        const next = new Map<string, number>();
        for (const [key, height] of current) {
          if (keys.has(key)) next.set(key, height);
        }
        for (const [key, height] of pending) {
          if (keys.has(key)) next.set(key, height);
        }
        return next;
      });
    });
  }, []);

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "auto") => {
      if (
        !scrollElement ||
        !listElement ||
        index < 0 ||
        index >= segments.length
      ) {
        return;
      }
      const scrollRect = scrollElement.getBoundingClientRect();
      const listRect = listElement.getBoundingClientRect();
      const listTop = scrollElement.scrollTop + listRect.top - scrollRect.top;
      const rowHeight = offsets[index + 1]! - offsets[index]!;
      const top =
        listTop +
        offsets[index]! -
        Math.max(0, (scrollElement.clientHeight - rowHeight) / 2);
      scrollElement.scrollTo({ top: Math.max(0, top), behavior });
    },
    [listElement, offsets, scrollElement, segments.length],
  );
  scrollToIndexRef.current = scrollToIndex;

  const previousActiveMatchRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (
      activeMatchId &&
      activeMatchId !== previousActiveMatchRef.current &&
      activeMatchIndex !== null &&
      listElement &&
      scrollElement
    ) {
      scrollToIndex(activeMatchIndex, scrollBehavior());
      previousActiveMatchRef.current = activeMatchId;
    } else if (!activeMatchId) {
      previousActiveMatchRef.current = null;
    }
  }, [
    activeMatchId,
    activeMatchIndex,
    listElement,
    scrollElement,
    scrollToIndex,
  ]);

  const searchIndex = useMemo(
    () =>
      searchEnabled
        ? createTranscriptSearchIndex(
            segments.flatMap((segment, index) =>
              segment.words.map((word) => ({
                id: word.id ?? null,
                text: word.text.trim(),
                scrollIntoView: () =>
                  scrollToIndexRef.current(index, scrollBehavior()),
              })),
            ),
          )
        : null,
    [searchEnabled, segments],
  );
  searchSourceRef.current = (preparedQuery, options) =>
    searchIndex
      ? getTranscriptSearchIndexMatches(searchIndex, preparedQuery, options)
      : [];

  const listRef = useCallback(
    (node: HTMLDivElement | null) => {
      unregisterSearchRef.current?.();
      unregisterSearchRef.current = null;
      setListElement(node);
      if (node && scrollElement) {
        unregisterSearchRef.current = registerTranscriptSearchSource(
          scrollElement,
          (preparedQuery, options) =>
            searchSourceRef.current(preparedQuery, options),
        );
      }
    },
    [scrollElement],
  );

  const handleRowFocus = useCallback((index: number) => {
    setFocusedIndex(index);
  }, []);
  const handleRowBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setFocusedIndex(null);
    }
  }, []);

  return {
    handleRowBlur,
    handleRowFocus,
    listRef,
    measureRow,
    totalHeight,
    virtualItems,
  };
}
