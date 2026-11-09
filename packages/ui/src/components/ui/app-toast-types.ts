import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

export type AppToastTone = "info" | "success" | "warning" | "error";

export type AppToastAction = Readonly<{
  label: ReactNode;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  /** Leave the toast up after `onClick` so the caller can morph it. Defaults to dismissing. */
  dismissOnClick?: boolean;
}>;

export type AppToastOptions = Readonly<{
  id?: string;
  closeButton?: boolean;
  message: ReactNode;
  description?: ReactNode;
  tone?: AppToastTone;
  leading?: ReactNode;
  action?: AppToastAction;
  secondaryAction?: AppToastAction;
  durationMs?: number;
  dismissible?: boolean;
  /** Runs once when the toast starts leaving, whatever dismissed it: the user, the timer, or code. */
  onDismiss?: (reason: "user" | "timer" | "programmatic") => void;
}>;

/** Fields a live toast can morph in place; the rest are fixed at show time. */
export type AppToastUpdate = Readonly<
  Partial<
    Pick<
      AppToastOptions,
      | "message"
      | "description"
      | "tone"
      | "leading"
      | "action"
      | "secondaryAction"
    >
  >
>;

export type AppToastHandle = Readonly<{
  /** Morph the visible toast without re-spawning it. A no-op once it is leaving. */
  update: (changes: AppToastUpdate) => void;
  dismiss: () => void;
}>;

/**
 * Texts the toaster renders itself. The package has no i18n, so the app passes
 * translated values; anything left out falls back to English.
 */
export type AppToastLabels = Readonly<{
  /** Default secondary action when a toast only needs a way to close it. */
  dismiss: string;
  expandNotification: string;
  collapseNotification: string;
  /** Accessible name of the countdown footer while the timer runs. */
  pauseAutoDismiss: string;
  /** Accessible name of the countdown footer while the timer is paused. */
  resumeAutoDismiss: string;
  pause: string;
  resume: string;
  /** Text before the remaining seconds while the timer runs. */
  closingIn: string;
  /** Text before the remaining seconds while the timer is paused. */
  timerPaused: string;
  /** Unit after the remaining seconds, pluralised for `count`. */
  seconds: (count: number) => string;
}>;

export const DEFAULT_APP_TOAST_LABELS: AppToastLabels = {
  dismiss: "Dismiss",
  expandNotification: "Expand notification",
  collapseNotification: "Collapse notification",
  pauseAutoDismiss: "Pause auto-dismiss",
  resumeAutoDismiss: "Resume auto-dismiss",
  pause: "Pause",
  resume: "Resume",
  closingIn: "Closing in",
  timerPaused: "Timer paused",
  seconds: (count) => (count === 1 ? "second" : "seconds"),
};

export type AppToastAlign = "center" | "end";
/** `compact` matches desktop chrome: `size-8` icon buttons with `size-4` glyphs. */
export type AppToastSize = "default" | "compact";

export type AppToasterProps = Readonly<{
  theme?: "light" | "dark" | "system";
  position?: "top" | "bottom";
  /** Horizontal placement of the stack: centered (mobile) or flush right (desktop). */
  align?: AppToastAlign;
  size?: AppToastSize;
  visibleToasts?: number;
  gap?: number;
  className?: string;
  style?: CSSProperties;
  /** Translated texts; missing keys keep their English default. */
  labels?: Partial<AppToastLabels>;
}>;
