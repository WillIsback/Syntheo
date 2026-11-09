import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { cn } from "@syntheo/utils";

import { copySelectedReplies } from "./copy-replies";
import { useTranscriptEditActions } from "./edit-actions";
import { TranscriptScrollControls } from "./scroll-controls";
import {
  completeTranscriptContextSelection,
  getTranscriptContextSelection,
  getTranscriptMergeTarget,
  getTranscriptSectionKeyFromElement,
  getTranscriptSectionSelection,
  mergeTranscriptSelections,
  type TranscriptWordSelection,
} from "./selection";
import {
  TranscriptSelectionProvider,
  useTranscriptSelectionSources,
} from "./selection-context";
import { MultiSelectionBar, SelectionMenu } from "./selection-menu";
import type { TranscriptContextMenuRequest } from "./selection-menu";
import { RenderTranscript } from "./transcript";
import { useAutoScroll, useScrollDetection } from "./viewport-hooks";

import type { Segment } from "~/stt/live-segment";

const LIVE_TRANSCRIPT_PLACEHOLDER_ID = "__live-transcript__";

type SelectedEntries = Map<string, TranscriptWordSelection>;

function getVisibleTranscriptIds(
  transcriptIds: string[],
  liveSegments: Segment[],
): string[] {
  if (transcriptIds.length > 0) {
    return transcriptIds;
  }
  if (liveSegments.length > 0) {
    return [LIVE_TRANSCRIPT_PLACEHOLDER_ID];
  }
  return [];
}

function applyShiftRangeSelection(
  next: SelectedEntries,
  order: string[],
  entries: SelectedEntries,
  anchorIndex: number,
  targetIndex: number,
): void {
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  for (const key of order.slice(start, end + 1)) {
    const selection = entries.get(key);
    if (selection) {
      next.set(key, selection);
    }
  }
}

function toggleTranscriptEntry(
  next: SelectedEntries,
  targetKey: string,
  entries: SelectedEntries,
  section: HTMLElement,
  container: HTMLElement,
): void {
  if (next.has(targetKey)) {
    next.delete(targetKey);
    return;
  }
  const selection =
    entries.get(targetKey) ?? getTranscriptSectionSelection(section, container);
  if (selection) {
    next.set(targetKey, selection);
  }
}

export function TranscriptViewer({
  transcriptIds,
  liveSegments,
  currentActive,
  captureGeneration = 0,
  scrollRef,
  editMode = false,
  onEditModeChange,
  footer,
  scrollControlsSlot,
}: Readonly<{
  footer?: ReactNode;
  /** Emplacement des flèches ↑↓ dans l'en-tête du panneau, s'il y en a un. */
  scrollControlsSlot?: HTMLElement | null;
  transcriptIds: string[];
  liveSegments: Segment[];
  currentActive: boolean;
  captureGeneration?: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  editMode?: boolean;
  onEditModeChange?: (editMode: boolean) => void;
}>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [contextRequest, setContextRequest] =
    useState<TranscriptContextMenuRequest | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<
    Map<string, TranscriptWordSelection>
  >(() => new Map());
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const [selectionForEditMode, setSelectionForEditMode] = useState(editMode);
  if (selectionForEditMode !== editMode) {
    setSelectionForEditMode(editMode);
    if (!editMode) {
      setSelectedEntries(new Map());
      setSelectionAnchor(null);
    }
  }
  const selectMode = editMode;
  const selectedKeys = useMemo(
    () => new Set(selectedEntries.keys()),
    [selectedEntries],
  );
  const { registerSource, collectEntries } = useTranscriptSelectionSources();
  const multiSelection = useMemo(
    () => mergeTranscriptSelections([...selectedEntries.values()]),
    [selectedEntries],
  );
  const handleContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      setScrollElement(node);
      scrollRef.current = node;
    },
    [scrollRef],
  );

  const {
    isAtTop,
    isAtBottom,
    canScroll,
    autoScrollEnabled,
    scrollToTop,
    scrollToBottom,
  } = useScrollDetection(containerRef, currentActive);

  const shouldAutoScroll = currentActive && autoScrollEnabled;
  // Une seule règle de suivi : la dernière transcription ne recolle au bas
  // que si le suivi automatique est actif (l'utilisateur n'a pas remonté).
  const shouldScrollLastTranscriptToEnd = shouldAutoScroll;
  // Pas de dépendance aux partiels : le suivi réagit à la hauteur du contenu.
  useAutoScroll(
    containerRef,
    [transcriptIds, shouldAutoScroll],
    shouldAutoScroll,
  );
  const visibleTranscriptIds = getVisibleTranscriptIds(
    transcriptIds,
    liveSegments,
  );
  const visibleTranscriptIdsRef = useRef(visibleTranscriptIds);
  visibleTranscriptIdsRef.current = visibleTranscriptIds;

  // Syntheo ne conserve jamais l'audio : la seule action est la copie.
  const handleSelectionAction = useCallback(
    (_action: "copy", selection: TranscriptWordSelection) => {
      void navigator.clipboard.writeText(selection.text);
    },
    [],
  );
  const handleCopySelectedReplies = useCallback(async () => {
    const { order, entries } = collectEntries(visibleTranscriptIdsRef.current);
    await copySelectedReplies(selectedEntries, order, entries);
  }, [collectEntries, selectedEntries]);
  const {
    handleAssignSpeaker,
    handleEditSelection,
    handleChangeSpeakerSelection,
    handleMergeSegments,
    handleDeleteSelection,
  } = useTranscriptEditActions({
    containerRef,
    onEditModeChange,
    collectEntries,
    selectedEntries,
    visibleTranscriptIdsRef,
  });
  const canMergeSelection = useMemo(() => {
    if (selectedEntries.size < 2) {
      return false;
    }
    const { order, entries } = collectEntries(visibleTranscriptIds);
    return getTranscriptMergeTarget(selectedKeys, order, entries) != null;
  }, [
    collectEntries,
    selectedEntries.size,
    selectedKeys,
    visibleTranscriptIds,
  ]);
  const handleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (selectMode) {
        return;
      }
      const nativeSelection = window.getSelection();
      const activeRange =
        nativeSelection && nativeSelection.rangeCount > 0
          ? nativeSelection.getRangeAt(0)
          : undefined;
      const request = getTranscriptContextSelection({
        target: event.target,
        container: event.currentTarget,
        activeRange,
      });
      if (!request) {
        return;
      }
      const selection = request.sectionKey
        ? completeTranscriptContextSelection(
            request.selection,
            collectEntries(visibleTranscriptIdsRef.current).entries.get(
              request.sectionKey,
            ),
          )
        : request.selection;

      event.preventDefault();
      event.stopPropagation();
      setContextRequest({
        id: crypto.randomUUID(),
        range: request.range,
        selection,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [collectEntries, selectMode],
  );
  const handleContextClose = useCallback(() => {
    setContextRequest(null);
  }, []);
  const clearSelectedEntries = useCallback(() => {
    setSelectedEntries(new Map());
    setSelectionAnchor(null);
  }, []);

  useHotkeys(
    "esc",
    (event) => {
      event.preventDefault();
      clearSelectedEntries();
    },
    { enabled: editMode && selectedEntries.size > 0 },
  );

  useHotkeys(
    "mod+shift+up, mod+shift+down",
    (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-transcript-editor], [contenteditable=true]")
      ) {
        return;
      }
      const { order, entries } = collectEntries(
        visibleTranscriptIdsRef.current,
      );
      const anchorIndex = selectionAnchor ? order.indexOf(selectionAnchor) : -1;
      if (anchorIndex === -1) {
        return;
      }

      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      const keys =
        event.key === "ArrowUp"
          ? order.slice(0, anchorIndex + 1)
          : order.slice(anchorIndex);
      setSelectedEntries(new Map(keys.map((key) => [key, entries.get(key)!])));
    },
    {
      enabled: selectedEntries.size > 0,
      enableOnFormTags: false,
      enableOnContentEditable: false,
    },
  );

  const handleSegmentSelection = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target;
      const section =
        target instanceof Element
          ? target.closest<HTMLElement>("section[data-transcript-segment-id]")
          : null;
      if (!section || !event.currentTarget.contains(section)) {
        return;
      }
      if (
        target instanceof Element &&
        target.closest(
          "button, a, input, textarea, [data-transcript-speaker-assign], [data-transcript-editor]",
        )
      ) {
        return;
      }

      const hasSelectionModifier =
        event.metaKey || event.ctrlKey || event.shiftKey;
      if (!selectMode && !hasSelectionModifier) {
        if (selectedEntries.size > 0) {
          clearSelectedEntries();
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      window.getSelection()?.removeAllRanges();
      const container = event.currentTarget;
      const targetKey = getTranscriptSectionKeyFromElement(section);
      if (!targetKey) {
        return;
      }
      const { order, entries } = collectEntries(
        visibleTranscriptIdsRef.current,
      );

      setSelectedEntries((current) => {
        const next = new Map(current);
        if (event.shiftKey && selectionAnchor) {
          const anchorIndex = order.indexOf(selectionAnchor);
          const targetIndex = order.indexOf(targetKey);
          if (anchorIndex !== -1 && targetIndex !== -1) {
            applyShiftRangeSelection(
              next,
              order,
              entries,
              anchorIndex,
              targetIndex,
            );
            return next;
          }
        }

        toggleTranscriptEntry(next, targetKey, entries, section, container);
        return next;
      });
      setSelectionAnchor(targetKey);
    },
    [
      clearSelectedEntries,
      collectEntries,
      selectMode,
      selectedEntries.size,
      selectionAnchor,
    ],
  );

  return (
    <TranscriptSelectionProvider
      selectMode={selectMode}
      selectedKeys={selectedKeys}
      registerSource={registerSource}
    >
      <div className="relative flex h-full flex-col">
        {canScroll && (
          <TranscriptScrollControls
            slot={scrollControlsSlot}
            isAtTop={isAtTop}
            isAtBottom={isAtBottom}
            onScrollToTop={scrollToTop}
            onScrollToBottom={scrollToBottom}
          />
        )}
        <div
          ref={handleContainerRef}
          data-transcript-container
          data-transcript-select-mode={selectMode ? "true" : undefined}
          onClickCapture={handleSegmentSelection}
          onContextMenu={handleContextMenu}
          className={cn([
            "flex min-h-0 min-w-0 flex-1 flex-col gap-8 overflow-x-clip overflow-y-auto",
            "scrollbar-hide",
            "scroll-pb-[calc(8rem+env(safe-area-inset-bottom))]",
            "pb-[calc(4rem+env(safe-area-inset-bottom))]",
          ])}
        >
          {visibleTranscriptIds.map((transcriptId, index) => {
            const isLastTranscript = index === visibleTranscriptIds.length - 1;
            const isActiveTranscript = currentActive && isLastTranscript;

            // Une capture par reprise après une pause (issue 353) : les
            // transcripts s'enchaînent comme un seul fil, sans séparateur, à
            // l'écart d'un changement de tour de parole (`pt-4` d'un segment).
            return (
              <div
                key={transcriptId}
                data-transcript-capture={transcriptId}
                className={cn(["flex flex-col", index > 0 && "-mt-4"])}
              >
                <RenderTranscript
                  scrollElement={scrollElement}
                  isLastTranscript={isLastTranscript}
                  shouldScrollToEnd={shouldScrollLastTranscriptToEnd}
                  transcriptId={transcriptId}
                  currentActive={isActiveTranscript}
                  captureGeneration={isActiveTranscript ? captureGeneration : 0}
                  liveSegments={isActiveTranscript ? liveSegments : []}
                  editMode={editMode}
                />
              </div>
            );
          })}

          {footer}

          <SelectionMenu
            containerRef={containerRef}
            contextRequest={contextRequest}
            onContextClose={handleContextClose}
            onAction={handleSelectionAction}
            onEdit={onEditModeChange ? handleEditSelection : undefined}
            onChangeSpeaker={
              onEditModeChange ? handleChangeSpeakerSelection : undefined
            }
          />
        </div>

        {multiSelection && (
          <MultiSelectionBar
            selection={multiSelection}
            entryCount={selectedEntries.size}
            canMerge={canMergeSelection}
            onClear={clearSelectedEntries}
            onCopy={handleCopySelectedReplies}
            onAssignSpeaker={handleAssignSpeaker}
            onMerge={handleMergeSegments}
            onDelete={
              editMode && !currentActive ? handleDeleteSelection : undefined
            }
          />
        )}
      </div>
    </TranscriptSelectionProvider>
  );
}
