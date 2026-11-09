import { type RefObject, useCallback } from "react";
import { flushSync } from "react-dom";

import {
  focusTranscriptSelection,
  getTranscriptMergeTarget,
  mergeTranscriptSelections,
  type TranscriptWordSelection,
} from "./selection";
import type { useTranscriptSelectionSources } from "./selection-context";
import { preserveScrollPosition } from "./viewport-hooks";

import {
  assignTranscriptSpeaker,
  mergeTranscriptSegments,
  updateTranscriptSegmentText,
} from "~/stt/queries";

// Actions d'édition de la transcription depuis une sélection : attribuer un
// interlocuteur, éditer, changer d'interlocuteur, fusionner, supprimer. Les
// écritures gardent la position de défilement.
export function useTranscriptEditActions({
  containerRef,
  onEditModeChange,
  collectEntries,
  selectedEntries,
  visibleTranscriptIdsRef,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  onEditModeChange?: (editMode: boolean) => void;
  collectEntries: ReturnType<
    typeof useTranscriptSelectionSources
  >["collectEntries"];
  selectedEntries: Map<string, TranscriptWordSelection>;
  visibleTranscriptIdsRef: RefObject<string[]>;
}) {
  const handleAssignSpeaker = useCallback(
    async (
      selection: TranscriptWordSelection,
      humanId: string,
      extendToAdjacent?: boolean,
    ) => {
      await preserveScrollPosition(containerRef.current, () =>
        Promise.all(
          selection.groups.map((group) =>
            assignTranscriptSpeaker({
              transcriptId: group.transcriptId,
              segmentKey: group.segmentKey,
              humanId,
              anchorWordId: group.wordIds[0]!,
              mode: "segment",
              wordIds: group.wordIds,
              extendToAdjacent,
            }),
          ),
        ),
      );
    },
    [containerRef],
  );
  const handleEditSelection = useCallback(
    (selection: TranscriptWordSelection) => {
      flushSync(() => onEditModeChange?.(true));
      if (containerRef.current) {
        focusTranscriptSelection(selection, containerRef.current);
      }
    },
    [containerRef, onEditModeChange],
  );
  const handleChangeSpeakerSelection = useCallback(
    (selection: TranscriptWordSelection) => {
      flushSync(() => onEditModeChange?.(true));
      const container = containerRef.current;
      if (!container) return;
      const editor = focusTranscriptSelection(selection, container);
      if (!editor) return;
      window.getSelection()?.collapseToStart();
      editor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    [containerRef, onEditModeChange],
  );
  const handleMergeSegments = useCallback(async () => {
    const { order, entries } = collectEntries(visibleTranscriptIdsRef.current);
    const target = getTranscriptMergeTarget(
      new Set(selectedEntries.keys()),
      order,
      entries,
    );
    const targetGroup = target?.groups[0];
    const selection = mergeTranscriptSelections([...selectedEntries.values()]);
    if (!targetGroup || !selection) {
      return;
    }

    const groups = selection.groups.filter(
      (group) => group.transcriptId === targetGroup.transcriptId,
    );
    await preserveScrollPosition(containerRef.current, () =>
      Promise.all(
        groups.map((group) =>
          mergeTranscriptSegments({
            transcriptId: group.transcriptId,
            segmentKey: targetGroup.segmentKey,
            wordIds: group.wordIds,
          }),
        ),
      ),
    );
  }, [collectEntries, containerRef, selectedEntries, visibleTranscriptIdsRef]);
  const handleDeleteSelection = useCallback(
    async (selection: TranscriptWordSelection) => {
      const wordsByTranscript = new Map<string, Set<string>>();
      for (const group of selection.groups) {
        const wordIds =
          wordsByTranscript.get(group.transcriptId) ?? new Set<string>();
        group.wordIds.forEach((wordId) => wordIds.add(wordId));
        wordsByTranscript.set(group.transcriptId, wordIds);
      }
      await preserveScrollPosition(containerRef.current, () =>
        Promise.all(
          [...wordsByTranscript].map(([transcriptId, wordIds]) =>
            updateTranscriptSegmentText({
              transcriptId,
              wordIds: [...wordIds],
              text: "",
            }),
          ),
        ),
      );
    },
    [containerRef],
  );

  return {
    handleAssignSpeaker,
    handleEditSelection,
    handleChangeSpeakerSelection,
    handleMergeSegments,
    handleDeleteSelection,
  };
}
