import {
  autoUpdate,
  computePosition,
  flip,
  limitShift,
  offset,
  shift,
  type VirtualElement,
} from "@floating-ui/dom";
import { useEditorEffect } from "@handlewithcare/react-prosemirror";
import { useRef } from "react";

// Place la fenêtre flottante sous la position `anchor` du document et la suit
// tant qu'elle est ouverte ; `anchor` vaut `null` quand elle est fermée.
export function useFloatingPopup(anchor: number | null) {
  const popupRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEditorEffect((view) => {
    if (!view || anchor === null) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      return;
    }

    const popup = popupRef.current;
    if (!popup) return;

    const coords = view.coordsAtPos(anchor);
    const referenceEl: VirtualElement = {
      getBoundingClientRect: () =>
        new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top),
    };

    const update = () => {
      void computePosition(referenceEl, popup, {
        placement: "bottom-start",
        middleware: [offset(4), flip(), shift({ limiter: limitShift() })],
      }).then(({ x, y }) => {
        Object.assign(popup.style, {
          left: `${x}px`,
          top: `${y}px`,
        });
      });
    };

    cleanupRef.current?.();
    cleanupRef.current = autoUpdate(referenceEl, popup, update);
    update();
  });

  return popupRef;
}
