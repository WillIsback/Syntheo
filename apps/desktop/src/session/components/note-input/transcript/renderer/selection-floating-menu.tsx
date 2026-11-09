import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import { Trans } from "@lingui/react/macro";
import { type MouseEvent, useCallback, useRef, useState } from "react";

import { Copy, Pencil, UserSwitch } from "@syntheo/ui/components/icons";
import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";
import { cn } from "@syntheo/utils";

import {
  getTranscriptRangeRects,
  getTranscriptSelectionFromRange,
  isRangeCoveredBySelection,
} from "./selection";
import type { TranscriptWordSelection } from "./selection";

const MENU_CONTAINER_CLASSES = [
  "pointer-events-auto",
  "bg-card shadow-lg rounded-md border border-border p-1",
];

const MENU_BUTTON_CLASSES = [
  "flex w-full items-center justify-start gap-2 px-2 py-1.5 text-left text-xs rounded-xs",
  "hover:bg-accent transition-colors",
];

export function SelectionFloatingMenu({
  selection,
  range,
  containerRef,
  floatingRef,
  floatingStyles,
  onClose,
  onAction,
  onChangeSpeaker,
  onEdit,
}: {
  selection: TranscriptWordSelection;
  range: Range | null;
  containerRef: React.RefObject<HTMLElement | null>;
  floatingRef: (node: HTMLDivElement | null) => void;
  floatingStyles: React.CSSProperties;
  onClose: () => void;
  onAction?: (action: "copy", selection: TranscriptWordSelection) => void;
  onEdit?: (selection: TranscriptWordSelection) => void;
  onChangeSpeaker?: (selection: TranscriptWordSelection) => void;
}) {
  const handleAction = useCallback(
    (action: "copy") => {
      onAction?.(action, selection);
      onClose();
    },
    [onAction, onClose, selection],
  );
  const handleMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  return (
    <>
      <SelectionHighlight
        key={getSelectionHighlightKey(selection, range)}
        range={range}
        containerRef={containerRef}
      />
      <FloatingPortal>
        <div
          ref={floatingRef}
          style={{ ...floatingStyles, zIndex: 50 }}
          className={cn([MENU_CONTAINER_CLASSES, "min-w-40"])}
          onMouseDown={handleMouseDown}
        >
          <div className="flex flex-col gap-0.5">
            {onEdit && (
              <button
                type="button"
                className={cn(MENU_BUTTON_CLASSES)}
                onClick={() => {
                  onClose();
                  onEdit(selection);
                }}
              >
                <Pencil className="size-3.5 shrink-0" />
                <Trans>Edit</Trans>
              </button>
            )}
            {selection.sessionId && onChangeSpeaker && (
              <button
                type="button"
                className={cn(MENU_BUTTON_CLASSES)}
                onClick={() => {
                  onClose();
                  onChangeSpeaker?.(selection);
                }}
              >
                <UserSwitch className="size-3.5" />
                <Trans>Change speaker from here</Trans>
              </button>
            )}
            <button
              type="button"
              className={cn(MENU_BUTTON_CLASSES)}
              onClick={() => handleAction("copy")}
            >
              <Copy className="size-3.5 shrink-0" />
              <Trans>Copy</Trans>
            </button>
          </div>
        </div>
      </FloatingPortal>
    </>
  );
}

function SelectionHighlight({
  range,
  containerRef,
}: {
  range: Range | null;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const [rects, setRects] = useState<DOMRect[]>([]);

  // The native selection paints the range while it lasts; the overlay takes
  // over once focus moves into the menu and the selection is gone.
  const updateRects = useCallback(() => {
    if (!range || isRangeCoveredBySelection(range, window.getSelection())) {
      setRects((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    setRects(getTranscriptRangeRects(range));
  }, [range]);

  useMountEffect(() => {
    if (!range) {
      return;
    }

    updateRects();
    const container = containerRef.current;
    window.addEventListener("resize", updateRects);
    document.addEventListener("selectionchange", updateRects);
    container?.addEventListener("scroll", updateRects, { passive: true });

    return () => {
      window.removeEventListener("resize", updateRects);
      document.removeEventListener("selectionchange", updateRects);
      container?.removeEventListener("scroll", updateRects);
    };
  });

  if (rects.length === 0) {
    return null;
  }

  return (
    <FloatingPortal>
      {rects.map((rect, index) => (
        <div
          key={index}
          data-transcript-selection-overlay
          style={{
            position: "fixed",
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            backgroundColor: "var(--selection-overlay)",
            pointerEvents: "none",
            zIndex: 40,
          }}
        />
      ))}
    </FloatingPortal>
  );
}

export function useSelectionMenuState({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const [selection, setSelection] = useState<TranscriptWordSelection | null>(
    null,
  );
  const [storedRange, setStoredRange] = useState<Range | null>(null);
  const isVisible = selection !== null;
  const { refs, floatingStyles, update } = useFloating<HTMLElement>({
    open: isVisible,
    placement: "bottom-start",
    strategy: "fixed",
    transform: false,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const show = useCallback(
    (nextSelection: TranscriptWordSelection, range: Range) => {
      setSelection(nextSelection);
      setStoredRange(range.cloneRange());
      refs.setPositionReference({
        getBoundingClientRect: () => range.getBoundingClientRect(),
      });
    },
    [refs],
  );
  const hide = useCallback(() => {
    setSelection(null);
    setStoredRange(null);
  }, []);
  const handleSelectionChangeRef = useRef<() => void>(() => {});
  handleSelectionChangeRef.current = () => {
    const nativeSelection = window.getSelection();
    const container = containerRef.current;
    if (!nativeSelection || nativeSelection.rangeCount === 0 || !container) {
      if (!isVisibleRef.current) {
        hide();
      }
      return;
    }

    const range = nativeSelection.getRangeAt(0);
    const nextSelection = getTranscriptSelectionFromRange(range, container);
    if (!nextSelection?.text) {
      if (!isVisibleRef.current) {
        hide();
      }
      return;
    }

    show(nextSelection, range);
  };
  const updateRef = useRef(update);
  updateRef.current = update;
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;

  useMountEffect(() => {
    const handleSelectionChange = () => handleSelectionChangeRef.current();
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  });

  useMountEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const handleScroll = () => {
      if (isVisibleRef.current) {
        void updateRef.current();
      }
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  });

  return { isVisible, selection, hide, refs, floatingStyles, storedRange };
}

function getSelectionHighlightKey(
  selection: TranscriptWordSelection,
  range: Range | null,
) {
  return [
    ...selection.groups.flatMap((group) => group.wordIds),
    selection.text,
    range?.startOffset ?? 0,
    range?.endOffset ?? 0,
  ].join(":");
}
