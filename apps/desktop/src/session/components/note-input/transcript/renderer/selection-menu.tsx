import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import { useCallback, useMemo } from "react";

import type { TranscriptWordSelection } from "./selection";
import {
  SelectionFloatingMenu,
  useSelectionMenuState,
} from "./selection-floating-menu";

import { useAutoCloser } from "~/shared/hooks/useAutoCloser";

export { MultiSelectionBar } from "./multi-selection-bar";

export type TranscriptContextMenuRequest = {
  id: string;
  range: Range;
  selection: TranscriptWordSelection;
  x: number;
  y: number;
};

export function SelectionMenu({
  containerRef,
  contextRequest,
  audioExists,
  onContextClose,
  onAction,
  onChangeSpeaker,
  onEdit,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  contextRequest: TranscriptContextMenuRequest | null;
  audioExists: boolean;
  onContextClose: () => void;
  onAction?: (
    action: "copy" | "play",
    selection: TranscriptWordSelection,
  ) => void;
  onEdit?: (selection: TranscriptWordSelection) => void;
  onChangeSpeaker?: (selection: TranscriptWordSelection) => void;
}) {
  return (
    <>
      <TextSelectionMenu
        containerRef={containerRef}
        suspended={contextRequest !== null}
        audioExists={audioExists}
        onAction={onAction}
        onChangeSpeaker={onChangeSpeaker}
        onEdit={onEdit}
      />
      {contextRequest && (
        <ContextSelectionMenu
          key={contextRequest.id}
          request={contextRequest}
          containerRef={containerRef}
          audioExists={audioExists}
          onClose={onContextClose}
          onAction={onAction}
          onChangeSpeaker={onChangeSpeaker}
          onEdit={onEdit}
        />
      )}
    </>
  );
}

function TextSelectionMenu({
  containerRef,
  suspended,
  audioExists,
  onAction,
  onChangeSpeaker,
  onEdit,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  suspended: boolean;
  audioExists: boolean;
  onAction?: (
    action: "copy" | "play",
    selection: TranscriptWordSelection,
  ) => void;
  onEdit?: (selection: TranscriptWordSelection) => void;
  onChangeSpeaker?: (selection: TranscriptWordSelection) => void;
}) {
  const { isVisible, selection, hide, refs, floatingStyles, storedRange } =
    useSelectionMenuState({ containerRef });
  const handleClose = useCallback(() => {
    hide();
    window.getSelection()?.removeAllRanges();
  }, [hide]);
  const autoCloserRef = useAutoCloser(handleClose, {
    esc: true,
    outside: true,
  });
  const floatingRef = useCallback(
    (node: HTMLDivElement | null) => {
      refs.setFloating(node);
      autoCloserRef.current = node;
    },
    [refs, autoCloserRef],
  );

  if (!isVisible || !selection || suspended) {
    return null;
  }

  return (
    <SelectionFloatingMenu
      selection={selection}
      range={storedRange}
      containerRef={containerRef}
      floatingRef={floatingRef}
      floatingStyles={floatingStyles}
      audioExists={audioExists}
      onClose={handleClose}
      onAction={onAction}
      onChangeSpeaker={onChangeSpeaker}
      onEdit={onEdit}
    />
  );
}

function ContextSelectionMenu({
  request,
  containerRef,
  audioExists,
  onClose,
  onAction,
  onChangeSpeaker,
  onEdit,
}: {
  request: TranscriptContextMenuRequest;
  containerRef: React.RefObject<HTMLElement | null>;
  audioExists: boolean;
  onClose: () => void;
  onAction?: (
    action: "copy" | "play",
    selection: TranscriptWordSelection,
  ) => void;
  onEdit?: (selection: TranscriptWordSelection) => void;
  onChangeSpeaker?: (selection: TranscriptWordSelection) => void;
}) {
  const virtualRect = useMemo(
    () => new DOMRect(request.x, request.y, 0, 0),
    [request.x, request.y],
  );
  const { refs, floatingStyles, update } = useFloating<HTMLElement>({
    open: true,
    placement: "bottom-start",
    strategy: "fixed",
    transform: false,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const handleClose = useCallback(() => {
    onClose();
    window.getSelection()?.removeAllRanges();
  }, [onClose]);
  const autoCloserRef = useAutoCloser(handleClose, {
    esc: true,
    outside: true,
  });
  const floatingRef = useCallback(
    (node: HTMLDivElement | null) => {
      refs.setFloating(node);
      refs.setPositionReference({
        getBoundingClientRect: () => virtualRect,
      });
      autoCloserRef.current = node;
      if (node) {
        void update();
      }
    },
    [autoCloserRef, refs, update, virtualRect],
  );

  return (
    <SelectionFloatingMenu
      selection={request.selection}
      range={request.range}
      containerRef={containerRef}
      floatingRef={floatingRef}
      floatingStyles={floatingStyles}
      audioExists={audioExists}
      onClose={handleClose}
      onAction={onAction}
      onChangeSpeaker={onChangeSpeaker}
      onEdit={onEdit}
    />
  );
}
