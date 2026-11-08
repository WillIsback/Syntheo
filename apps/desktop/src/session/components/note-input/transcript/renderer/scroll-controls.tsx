import { t } from "@lingui/core/macro";
import { createPortal } from "react-dom";

import { ArrowDown, ArrowUp } from "@syntheo/ui/components/icons";
import { cn } from "@syntheo/utils";

const BUTTON_CLASS = cn([
  "text-muted-foreground hover:text-foreground hover:bg-accent flex size-6 items-center justify-center rounded-md transition-colors",
  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
  "disabled:pointer-events-none disabled:opacity-30",
]);

// Aller au début ou à la fin de la transcription. Les flèches flottaient au
// milieu du panneau, par-dessus le texte (issue 436) : elles vont dans
// l'en-tête du panneau quand il leur réserve une place (`slot`), sinon dans
// une ligne à elles au-dessus du texte.
export function TranscriptScrollControls({
  slot,
  isAtTop,
  isAtBottom,
  onScrollToTop,
  onScrollToBottom,
}: {
  slot?: HTMLElement | null;
  isAtTop: boolean;
  isAtBottom: boolean;
  onScrollToTop: () => void;
  onScrollToBottom: () => void;
}) {
  const controls = (
    <div data-transcript-scroll-controls className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label={t`Scroll to top`}
        onClick={onScrollToTop}
        disabled={isAtTop}
        className={BUTTON_CLASS}
      >
        <ArrowUp aria-hidden="true" className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={t`Scroll to bottom`}
        onClick={onScrollToBottom}
        disabled={isAtBottom}
        className={BUTTON_CLASS}
      >
        <ArrowDown aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );

  if (slot) {
    return createPortal(controls, slot);
  }
  return <div className="flex shrink-0 justify-end pb-1">{controls}</div>;
}
