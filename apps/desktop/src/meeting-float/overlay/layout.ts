export const FLOATING_BAR_INSET = 4;
export const FLOATING_BAR_COMPACT_HEIGHT = 38;
export const FLOATING_BAR_COMPACT_STOP_WIDTH = 62;
export const FLOATING_BAR_COMPACT_SOLO_STOP_WIDTH = 68;
export const FLOATING_BAR_COMPACT_ICON_SIZE = 30;
export const FLOATING_BAR_COMPACT_GAP = 0;
export const FLOATING_BAR_COMPACT_HORIZONTAL_PADDING = 4;
export const FLOATING_BAR_HOVER_HANDLE_HEIGHT = 12;
export const FLOATING_BAR_HOVER_HANDLE_TOP_PADDING = 7;
const FLOATING_BAR_HOVER_HANDLE_GAP = 2;
export const FLOATING_BAR_HOVER_HANDLE_RESERVED_HEIGHT =
  FLOATING_BAR_HOVER_HANDLE_TOP_PADDING +
  FLOATING_BAR_HOVER_HANDLE_HEIGHT +
  FLOATING_BAR_HOVER_HANDLE_GAP;
export const FLOATING_BAR_CONTROL_RADIUS = 10;
export const FLOATING_BAR_COMPACT_RADIUS = 14;
export const FLOATING_BAR_EXPANDED_RADIUS = 21;

// « En pause », « Reprendre » et « Terminer » (issue 353) ; même valeur que
// PAUSED_CONTROLS_WIDTH côté Rust (floating_bar.rs).
export const FLOATING_BAR_PAUSED_CONTROLS_WIDTH = 232;

export function compactControlsWidth(showsExpand: boolean) {
  return showsExpand
    ? FLOATING_BAR_COMPACT_STOP_WIDTH +
        FLOATING_BAR_COMPACT_GAP +
        FLOATING_BAR_COMPACT_ICON_SIZE
    : FLOATING_BAR_COMPACT_SOLO_STOP_WIDTH;
}

// Même calcul que `meeting_controls_width` côté Rust : la dictée garde ses
// commandes, l'écoute ajoute « Mettre en pause ».
export function floatingControlsWidth(state: {
  dictation?: unknown;
  status: string;
  liveCaptionToggleVisible: boolean;
}) {
  if (state.dictation) {
    return compactControlsWidth(state.liveCaptionToggleVisible);
  }
  if (state.status === "paused") {
    return FLOATING_BAR_PAUSED_CONTROLS_WIDTH;
  }
  return (
    compactControlsWidth(state.liveCaptionToggleVisible) +
    FLOATING_BAR_COMPACT_GAP +
    FLOATING_BAR_COMPACT_ICON_SIZE
  );
}
