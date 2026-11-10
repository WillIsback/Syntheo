import { listen, TauriEvent } from "@tauri-apps/api/event";

// Pastille masquée quand la note écoutée est visible au premier plan
// (issue 527) : la capsule de la note fait alors le même travail.

/** Temporisation des changements de focus et d'onglet, contre le clignotement. */
export const FLOATING_BAR_FOCUS_DELAY_MS = 300;

const MAIN_WINDOW_LABEL = "main";

type FloatingBarFocusContext = {
  /** Fenêtre Syntheo au premier plan (`main`, `note-<id>`), `null` sinon. */
  focusedWindow: string | null;
  /** Note de l'onglet actif de la fenêtre principale. */
  activeTabSessionId: string | null;
  /** Note de l'écoute en cours ou en pause. */
  listenedSessionId: string | null;
};

/** Libellé de la fenêtre détachée d'une note (`AppWindow::Note`). */
function noteWindowLabel(sessionId: string) {
  return `note-${sessionId}`;
}

/** La pastille d'écoute doit-elle être visible ? */
export function shouldShowFloatingBar({
  focusedWindow,
  activeTabSessionId,
  listenedSessionId,
}: FloatingBarFocusContext): boolean {
  if (!listenedSessionId || !focusedWindow) {
    return true;
  }

  const listenedNoteInView =
    (focusedWindow === MAIN_WINDOW_LABEL &&
      activeTabSessionId === listenedSessionId) ||
    focusedWindow === noteWindowLabel(listenedSessionId);
  return !listenedNoteInView;
}

export type FloatingBarFocusSources = {
  isMainWindowFocused: () => boolean;
  /** Suit le focus d'une fenêtre, même si elle n'existe pas encore. */
  watchWindowFocus: (
    label: string,
    onFocusChange: (focused: boolean) => void,
  ) => () => void;
  getActiveTabSessionId: () => string | null;
  subscribeActiveTab: (onChange: () => void) => () => void;
};

/**
 * Tient l'état « pastille masquée » à partir du focus des fenêtres et de
 * l'onglet actif, avec une temporisation. Un changement de note écoutée
 * (`refresh`) s'applique tout de suite, pour qu'une écoute lancée depuis sa
 * note n'affiche pas la pastille un instant.
 */
export function createFloatingBarConcealment({
  sources,
  getListenedSessionId,
  onConcealedChange,
  delayMs = FLOATING_BAR_FOCUS_DELAY_MS,
}: {
  sources: FloatingBarFocusSources;
  getListenedSessionId: () => string | null;
  onConcealedChange: (concealed: boolean) => void;
  delayMs?: number;
}) {
  let focusedWindow: string | null = sources.isMainWindowFocused()
    ? MAIN_WINDOW_LABEL
    : null;
  let listenedSessionId = getListenedSessionId();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const compute = () =>
    !shouldShowFloatingBar({
      focusedWindow,
      activeTabSessionId: sources.getActiveTabSessionId(),
      listenedSessionId,
    });
  let concealed = compute();

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const schedule = () => {
    if (disposed) return;
    clearTimer();
    if (compute() === concealed) return;
    timer = setTimeout(() => {
      timer = null;
      const next = compute();
      if (next === concealed) return;
      concealed = next;
      onConcealedChange(concealed);
    }, delayMs);
  };
  const watch = (label: string) =>
    sources.watchWindowFocus(label, (focused) => {
      if (focused) focusedWindow = label;
      else if (focusedWindow === label) focusedWindow = null;
      schedule();
    });

  const unwatchMain = watch(MAIN_WINDOW_LABEL);
  let unwatchNote = listenedSessionId
    ? watch(noteWindowLabel(listenedSessionId))
    : null;
  const unsubscribeTab = sources.subscribeActiveTab(schedule);

  return {
    get concealed() {
      return concealed;
    },
    /** Relit la note écoutée ; renvoie l'état « masquée » à appliquer. */
    refresh() {
      const nextListenedSessionId = getListenedSessionId();
      if (disposed || nextListenedSessionId === listenedSessionId) {
        return concealed;
      }
      listenedSessionId = nextListenedSessionId;
      unwatchNote?.();
      unwatchNote = listenedSessionId
        ? watch(noteWindowLabel(listenedSessionId))
        : null;
      clearTimer();
      concealed = compute();
      return concealed;
    },
    dispose() {
      disposed = true;
      clearTimer();
      unwatchMain();
      unwatchNote?.();
      unsubscribeTab();
    },
  };
}

/** Focus d'une fenêtre Tauri par son libellé (`tauri://focus`, `tauri://blur`). */
export function watchTauriWindowFocus(
  label: string,
  onFocusChange: (focused: boolean) => void,
) {
  let cancelled = false;
  const unlisteners: Array<() => void> = [];
  const target = { kind: "Window", label } as const;
  for (const pending of [
    listen(TauriEvent.WINDOW_FOCUS, () => onFocusChange(true), { target }),
    listen(TauriEvent.WINDOW_BLUR, () => onFocusChange(false), { target }),
  ]) {
    pending
      .then((unlisten) => {
        if (cancelled) unlisten();
        else unlisteners.push(unlisten);
      })
      .catch((error: unknown) => {
        console.error("[meeting-float] failed to watch window focus", error);
      });
  }

  return () => {
    cancelled = true;
    unlisteners.splice(0).forEach((unlisten) => unlisten());
  };
}
