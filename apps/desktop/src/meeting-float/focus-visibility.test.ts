import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFloatingBarConcealment,
  FLOATING_BAR_FOCUS_DELAY_MS,
  type FloatingBarFocusSources,
  shouldShowFloatingBar,
} from "./focus-visibility";

// Issue 527 : la pastille ne s'affiche que lorsqu'elle est utile.
describe("shouldShowFloatingBar", () => {
  const listening = { listenedSessionId: "s1" };

  it("hides the pill when the main window shows the listened note", () => {
    expect(
      shouldShowFloatingBar({
        ...listening,
        focusedWindow: "main",
        activeTabSessionId: "s1",
      }),
    ).toBe(false);
  });

  it("hides the pill when the detached window of the listened note is focused", () => {
    expect(
      shouldShowFloatingBar({
        ...listening,
        focusedWindow: "note-s1",
        activeTabSessionId: "other",
      }),
    ).toBe(false);
  });

  it("shows the pill when another application is focused or Syntheo is minimized", () => {
    expect(
      shouldShowFloatingBar({
        ...listening,
        focusedWindow: null,
        activeTabSessionId: "s1",
      }),
    ).toBe(true);
  });

  it("shows the pill when another tab or note is active", () => {
    expect(
      shouldShowFloatingBar({
        ...listening,
        focusedWindow: "main",
        activeTabSessionId: "other",
      }),
    ).toBe(true);
    expect(
      shouldShowFloatingBar({
        ...listening,
        focusedWindow: "main",
        activeTabSessionId: null,
      }),
    ).toBe(true);
    expect(
      shouldShowFloatingBar({
        ...listening,
        focusedWindow: "note-other",
        activeTabSessionId: "s1",
      }),
    ).toBe(true);
  });

  it("does not hide anything without a listened note", () => {
    expect(
      shouldShowFloatingBar({
        listenedSessionId: null,
        focusedWindow: "main",
        activeTabSessionId: "s1",
      }),
    ).toBe(true);
  });
});

function createSources(initial: { mainFocused: boolean; tab: string | null }) {
  const focusHandlers = new Map<string, (focused: boolean) => void>();
  const tabListeners = new Set<() => void>();
  let tab = initial.tab;
  const sources: FloatingBarFocusSources = {
    isMainWindowFocused: () => initial.mainFocused,
    watchWindowFocus: vi.fn((label, onFocusChange) => {
      focusHandlers.set(label, onFocusChange);
      return () => focusHandlers.delete(label);
    }),
    getActiveTabSessionId: () => tab,
    subscribeActiveTab: (onChange) => {
      tabListeners.add(onChange);
      return () => tabListeners.delete(onChange);
    },
  };
  return {
    sources,
    focusHandlers,
    focus: (label: string, focused: boolean) =>
      focusHandlers.get(label)?.(focused),
    setTab: (next: string | null) => {
      tab = next;
      tabListeners.forEach((listener) => listener());
    },
  };
}

describe("createFloatingBarConcealment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts concealed when the listened note is already in view", () => {
    const { sources } = createSources({ mainFocused: true, tab: "s1" });
    const concealment = createFloatingBarConcealment({
      sources,
      getListenedSessionId: () => "s1",
      onConcealedChange: vi.fn(),
    });

    expect(concealment.concealed).toBe(true);
    concealment.dispose();
  });

  it("debounces focus changes and ignores a quick round trip", () => {
    const harness = createSources({ mainFocused: true, tab: "s1" });
    const onConcealedChange = vi.fn();
    const concealment = createFloatingBarConcealment({
      sources: harness.sources,
      getListenedSessionId: () => "s1",
      onConcealedChange,
    });

    harness.focus("main", false);
    vi.advanceTimersByTime(FLOATING_BAR_FOCUS_DELAY_MS - 50);
    harness.focus("main", true);
    vi.advanceTimersByTime(FLOATING_BAR_FOCUS_DELAY_MS);
    expect(onConcealedChange).not.toHaveBeenCalled();

    harness.focus("main", false);
    vi.advanceTimersByTime(FLOATING_BAR_FOCUS_DELAY_MS - 1);
    expect(onConcealedChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onConcealedChange).toHaveBeenCalledWith(false);
    expect(concealment.concealed).toBe(false);
    concealment.dispose();
  });

  it("follows the detached window of the listened note", () => {
    const harness = createSources({ mainFocused: false, tab: null });
    const onConcealedChange = vi.fn();
    const concealment = createFloatingBarConcealment({
      sources: harness.sources,
      getListenedSessionId: () => "s1",
      onConcealedChange,
    });

    harness.focus("note-s1", true);
    vi.advanceTimersByTime(FLOATING_BAR_FOCUS_DELAY_MS);
    expect(onConcealedChange).toHaveBeenLastCalledWith(true);

    // Passage à la fenêtre principale sur un autre onglet.
    harness.focus("main", true);
    harness.focus("note-s1", false);
    vi.advanceTimersByTime(FLOATING_BAR_FOCUS_DELAY_MS);
    expect(onConcealedChange).toHaveBeenLastCalledWith(false);
    concealment.dispose();
  });

  it("shows the pill again after a tab change", () => {
    const harness = createSources({ mainFocused: true, tab: "s1" });
    const onConcealedChange = vi.fn();
    const concealment = createFloatingBarConcealment({
      sources: harness.sources,
      getListenedSessionId: () => "s1",
      onConcealedChange,
    });

    harness.setTab("other");
    vi.advanceTimersByTime(FLOATING_BAR_FOCUS_DELAY_MS);
    expect(onConcealedChange).toHaveBeenCalledWith(false);
    concealment.dispose();
  });

  it("applies a new listened note at once and watches its window", () => {
    const harness = createSources({ mainFocused: true, tab: "s2" });
    let listened: string | null = null;
    const onConcealedChange = vi.fn();
    const concealment = createFloatingBarConcealment({
      sources: harness.sources,
      getListenedSessionId: () => listened,
      onConcealedChange,
    });
    expect(concealment.concealed).toBe(false);

    listened = "s2";
    expect(concealment.refresh()).toBe(true);
    expect(harness.focusHandlers.has("note-s2")).toBe(true);
    expect(onConcealedChange).not.toHaveBeenCalled();

    listened = null;
    expect(concealment.refresh()).toBe(false);
    expect(harness.focusHandlers.has("note-s2")).toBe(false);
    concealment.dispose();
    expect(harness.focusHandlers.size).toBe(0);
  });

  it("drops pending changes on dispose", () => {
    const harness = createSources({ mainFocused: true, tab: "s1" });
    const onConcealedChange = vi.fn();
    const concealment = createFloatingBarConcealment({
      sources: harness.sources,
      getListenedSessionId: () => "s1",
      onConcealedChange,
    });

    harness.focus("main", false);
    concealment.dispose();
    vi.advanceTimersByTime(FLOATING_BAR_FOCUS_DELAY_MS);
    expect(onConcealedChange).not.toHaveBeenCalled();
  });
});
