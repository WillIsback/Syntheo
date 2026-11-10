// Marge transparente autour du panneau de dictée ; la pastille de réunion n'en a
// pas (issue 448).
export const FLOATING_BAR_INSET = 4;
export const FLOATING_BAR_COMPACT_HEIGHT = 38;
export const FLOATING_BAR_COMPACT_STOP_WIDTH = 62;
export const FLOATING_BAR_COMPACT_ICON_SIZE = 30;
const FLOATING_BAR_COMPACT_GAP = 0;
export const FLOATING_BAR_COMPACT_HORIZONTAL_PADDING = 4;
export const FLOATING_BAR_CONTROL_RADIUS = 10;
export const FLOATING_BAR_COMPACT_RADIUS = 14;
export const FLOATING_BAR_EXPANDED_RADIUS = 21;

// « En pause », « Reprendre » et « Terminer » (issue 353) ; même valeur que
// PAUSED_CONTROLS_WIDTH côté Rust (floating_bar.rs).
export const FLOATING_BAR_PAUSED_CONTROLS_WIDTH = 232;

// Pastille d'écoute (issue 448), de gauche à droite. La fenêtre native a
// exactement cette largeur : RECORDING_PILL_WIDTH côté Rust (floating_bar.rs),
// comparée par bar.test.tsx.
export const FLOATING_PILL_SLOTS = {
  leadingPadding: FLOATING_BAR_COMPACT_HORIZONTAL_PADDING,
  dot: 22,
  duration: 38,
  level: 28,
  separator: 9,
  // Bascule du micro (issue 447) : bouton de 30 px et son écart.
  microphone: FLOATING_BAR_COMPACT_ICON_SIZE + 2,
  pause: 70,
  buttonGap: 2,
  finish: 85,
  trailingPadding: FLOATING_BAR_COMPACT_HORIZONTAL_PADDING,
} as const;
export const FLOATING_BAR_RECORDING_PILL_WIDTH = 294;
// Au-delà d'une heure, la durée passe de mm:ss à h:mm:ss : LONG_DURATION_* côté
// Rust élargit la fenêtre d'autant.
const FLOATING_PILL_LONG_DURATION_SECONDS = 3600;
const FLOATING_PILL_LONG_DURATION_EXTRA_WIDTH = 16;

export function dictationControlsWidth() {
  return (
    FLOATING_BAR_COMPACT_STOP_WIDTH +
    FLOATING_BAR_COMPACT_GAP +
    FLOATING_BAR_COMPACT_ICON_SIZE
  );
}

export function durationSlotWidth(elapsedSeconds: number) {
  return elapsedSeconds >= FLOATING_PILL_LONG_DURATION_SECONDS
    ? FLOATING_PILL_SLOTS.duration + FLOATING_PILL_LONG_DURATION_EXTRA_WIDTH
    : FLOATING_PILL_SLOTS.duration;
}

/** Durée d'écoute : mm:ss, puis h:mm:ss au-delà d'une heure. */
export function formatListeningDuration(elapsedSeconds: number) {
  const total = Math.max(0, Math.floor(elapsedSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}
