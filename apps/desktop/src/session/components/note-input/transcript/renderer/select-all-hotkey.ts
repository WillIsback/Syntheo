import { type RefObject } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import type { TranscriptWordSelection } from "./selection";

type Entries = Map<string, TranscriptWordSelection>;

// Champs où Ctrl+A garde son sens natif (texte d'une réplique en édition).
const NATIVE_SELECT_ALL =
  "[data-transcript-editor], [contenteditable=true], input, textarea";

// Ctrl+A (Cmd+A sur macOS) dans la marge sélectionne toutes les répliques,
// comme Ctrl+Maj+↑/↓ ; « Copier » copie alors toute la transcription
// (issue 458). Hors de la marge ou dans un champ, la touche reste native.
export function useSelectAllRepliesHotkey({
  containerRef,
  collectAll,
  onSelect,
}: {
  containerRef: RefObject<HTMLElement | null>;
  collectAll: () => { order: string[]; entries: Entries };
  onSelect: (entries: Entries, anchor: string) => void;
}) {
  useHotkeys(
    "mod+a",
    (event) => {
      const target = event.target;
      // La bibliothèque accepte aussi la touche physique A (Ctrl+Q en AZERTY).
      if (event.key.toLowerCase() !== "a" || event.altKey || event.shiftKey) {
        return;
      }
      if (
        !(target instanceof Element) ||
        !containerRef.current?.contains(target)
      ) {
        return;
      }
      if (target.closest(NATIVE_SELECT_ALL)) {
        return;
      }
      const { order, entries } = collectAll();
      if (order.length === 0) {
        return;
      }

      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      onSelect(
        new Map(
          order.flatMap((key) => {
            const entry = entries.get(key);
            return entry ? [[key, entry] as const] : [];
          }),
        ),
        order[0]!,
      );
    },
    { enableOnFormTags: false, enableOnContentEditable: false },
  );
}
