import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: true,
  dictationAction: null as
    | null
    | ((event: { payload: { sessionId: string; action: string } }) => void),
  meetingStop: null as null | (() => void),
  listeningAction: null as
    | null
    | ((event: { payload: { action: string } }) => void),
  openMain: null as null | (() => Promise<void>),
  settings: {
    current: {
      floating_bar_opacity: 0.78,
      live_caption_opacity: 0.3,
      live_caption_width: 440,
      live_caption_line_count: 1,
      live_caption_position: "topCenter",
      live_caption_minimized: true,
    },
  },
  floatingBarShow: vi.fn(async () => ({ status: "ok", data: null })),
  floatingBarHide: vi.fn(async () => ({ status: "ok", data: null })),
  floatingBarUpdate: vi.fn(async () => ({ status: "ok", data: null })),
  liveCaptionShow: vi.fn(async () => ({ status: "ok", data: null })),
  liveCaptionHide: vi.fn(async () => ({ status: "ok", data: null })),
  liveCaptionUpdate: vi.fn(async () => ({ status: "ok", data: null })),
  windowShow: vi.fn(async () => ({ status: "ok", data: null })),
  listen: vi.fn(async () => vi.fn()),
  setSettingValue: vi.fn(async () => undefined),
  setSettingValues: vi.fn(),
  subscribeMeetingFloatData: vi.fn(async () => vi.fn(async () => undefined)),
  listenerState: {
    live: {
      status: "active",
      sessionId: "session-1",
      amplitude: { mic: 0, speaker: 0 },
      captureHealth: { mic: null, speaker: null, unavailable: false },
      degraded: null,
      lastError: null,
      liveTranscriptionActive: true,
      seconds: 0,
      elapsedOffsetSeconds: 0,
      muted: false,
    },
    liveSegments: [],
    liveCaptionText: "we should ship this",
    stop: vi.fn(),
    pause: vi.fn(),
    setMuted: vi.fn(),
  },
  subscribeListener: vi.fn(() => vi.fn()),
}));

const focusMocks = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  windowHide: vi.fn(async () => undefined),
  windowShow: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/event", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/api/event")>()),
  listen: vi.fn(
    async (
      event: string,
      handler: () => void,
      options?: { target?: { label?: string } },
    ) => {
      const key = `${options?.target?.label}:${event}`;
      focusMocks.handlers.set(key, handler);
      return () => focusMocks.handlers.delete(key);
    },
  ),
}));

vi.mock("@tauri-apps/api/window", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/api/window")>()),
  Window: {
    getByLabel: vi.fn(async () => ({
      hide: focusMocks.windowHide,
      show: focusMocks.windowShow,
    })),
  },
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: () => "macos",
}));

vi.mock("@syntheo/plugin-windows", () => ({
  commands: {
    floatingBarShow: mocks.floatingBarShow,
    floatingBarHide: mocks.floatingBarHide,
    floatingBarUpdate: mocks.floatingBarUpdate,
    liveCaptionShow: mocks.liveCaptionShow,
    liveCaptionHide: mocks.liveCaptionHide,
    liveCaptionUpdate: mocks.liveCaptionUpdate,
    windowShow: mocks.windowShow,
  },
  events: {
    floatingBarOpenMain: {
      listen: vi.fn(async (callback) => {
        mocks.openMain = callback;
        return vi.fn();
      }),
    },
    floatingBarListeningAction: {
      listen: vi.fn(async (callback) => {
        mocks.listeningAction = callback;
        return vi.fn();
      }),
    },
    floatingBarSettingsChange: { listen: mocks.listen },
    floatingBarStop: {
      listen: vi.fn(async (callback) => {
        mocks.meetingStop = callback;
        return vi.fn();
      }),
    },
    floatingBarDictationAction: {
      listen: vi.fn(async (callback) => {
        mocks.dictationAction = callback;
        return vi.fn();
      }),
    },
  },
}));

vi.mock("./hooks", () => ({
  createMeetingFloatLabelContext: vi.fn(() => undefined),
  createMeetingFloatRenderRequest: vi.fn(() => null),
  loadMeetingFloatData: vi.fn(async () => ({ sessions: {}, humanNames: {} })),
  subscribeMeetingFloatData: mocks.subscribeMeetingFloatData,
}));

vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: vi.fn(async () => ({
    values: mocks.settings.current,
    hasValues: new Set(Object.keys(mocks.settings.current)),
  })),
  setSettingValue: mocks.setSettingValue,
  useSetSettingValues: () => mocks.setSettingValues,
  useStoredSettingValue: () => ({ value: undefined, hasValue: false }),
}));

vi.mock("~/shared/config", () => ({
  useConfigValue: () => mocks.enabled,
  useConfigValues: () => mocks.settings.current,
}));

vi.mock("~/store/zustand/listener/instance", () => ({
  listenerStore: {
    getState: () => mocks.listenerState,
    subscribe: mocks.subscribeListener,
  },
}));

import { FloatingMeetingWindowHost } from "./host";

import { useDictationStatus } from "~/dictation/state";
import { useTabs } from "~/store/zustand/tabs";

describe("FloatingMeetingWindowHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.meetingStop = null;
    mocks.dictationAction = null;
    mocks.enabled = true;
    mocks.listenerState.live.status = "active";
    useDictationStatus.setState(useDictationStatus.getInitialState());
    mocks.settings.current = {
      floating_bar_opacity: 0.78,
      live_caption_opacity: 0.3,
      live_caption_width: 440,
      live_caption_line_count: 1,
      live_caption_position: "topCenter",
      live_caption_minimized: true,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("updates overlay settings without hiding the active floating panel", async () => {
    const view = render(<FloatingMeetingWindowHost />);

    await waitFor(() => {
      expect(mocks.floatingBarShow).toHaveBeenCalledOnce();
      expect(mocks.floatingBarUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ liveCaptionMinimized: true }),
      );
    });

    mocks.settings.current = {
      ...mocks.settings.current,
      live_caption_minimized: false,
    };
    view.rerender(<FloatingMeetingWindowHost />);

    await waitFor(() => {
      expect(mocks.floatingBarUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          liveCaptionMinimized: false,
          transcriptBubbles: null,
        }),
      );
    });
    expect(mocks.liveCaptionShow).not.toHaveBeenCalled();
    expect(mocks.liveCaptionHide).toHaveBeenCalled();
    expect(mocks.floatingBarShow).toHaveBeenCalledOnce();
    expect(mocks.floatingBarHide).not.toHaveBeenCalled();
  });

  it("keeps dictation usable when meeting panels are disabled on macos", async () => {
    mocks.enabled = false;
    mocks.listenerState.live.status = "inactive";
    const finish = vi.fn();
    const cancel = vi.fn();
    useDictationStatus.setState({
      phase: "recording",
      owner: "dictation-1",
      text: "Hello",
      finish,
      cancel,
    });
    render(<FloatingMeetingWindowHost />);
    await waitFor(() =>
      expect(mocks.floatingBarUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dictation: expect.objectContaining({ text: "Hello" }),
        }),
      ),
    );
    expect(mocks.floatingBarUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.floatingBarShow.mock.invocationCallOrder[0]!,
    );
    await act(async () => {
      mocks.dictationAction!({
        payload: { sessionId: "old-recording", action: "finish" },
      });
      mocks.meetingStop!();
    });
    expect(finish).not.toHaveBeenCalled();
    expect(mocks.listenerState.stop).not.toHaveBeenCalled();
    expect(mocks.floatingBarHide).not.toHaveBeenCalled();
    await act(async () => {
      mocks.dictationAction!({
        payload: { sessionId: "dictation-1", action: "togglePreview" },
      });
    });
    await waitFor(() =>
      expect(mocks.floatingBarUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ liveCaptionMinimized: false }),
      ),
    );
    await act(async () => {
      mocks.dictationAction!({
        payload: { sessionId: "dictation-1", action: "finish" },
      });
      mocks.dictationAction!({
        payload: { sessionId: "dictation-1", action: "cancel" },
      });
    });
    expect(finish).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    await act(async () => {
      useDictationStatus.setState({ phase: "idle" });
    });
    await waitFor(() => expect(mocks.floatingBarHide).toHaveBeenCalledOnce());
  });

  // Issue 448 : un clic sur la durée de la pastille ramène la fenêtre principale
  // sur la note de la réunion.
  it("brings the main window back on the meeting note", async () => {
    const openNew = vi
      .spyOn(useTabs.getState(), "openNew")
      .mockImplementation(() => {});
    render(<FloatingMeetingWindowHost />);
    await waitFor(() => expect(mocks.floatingBarShow).toHaveBeenCalledOnce());

    await act(async () => {
      await mocks.openMain!();
    });

    expect(mocks.windowShow).toHaveBeenCalledWith({ type: "main" });
    expect(openNew).toHaveBeenCalledWith({
      type: "sessions",
      id: "session-1",
    });
    openNew.mockRestore();
  });

  // Issue 447 : la bascule du micro de la pastille passe par le même chemin
  // que la capsule, sans relancer l'écoute.
  it("mutes and unmutes the microphone from the pill", async () => {
    render(<FloatingMeetingWindowHost />);
    await waitFor(() =>
      expect(mocks.floatingBarUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ micMuted: false }),
      ),
    );

    await act(async () => {
      mocks.listeningAction!({ payload: { action: "muteMic" } });
      mocks.listeningAction!({ payload: { action: "unmuteMic" } });
    });

    expect(mocks.listenerState.setMuted.mock.calls).toEqual([[true], [false]]);
    expect(mocks.listenerState.pause).not.toHaveBeenCalled();
    expect(mocks.listenerState.stop).not.toHaveBeenCalled();
  });

  // Issue 527 : la pastille se retire quand la note écoutée est au premier plan.
  describe("listened note in view", () => {
    const fire = async (label: string, event: "focus" | "blur") => {
      await act(async () => {
        focusMocks.handlers.get(`${label}:tauri://${event}`)?.();
      });
    };
    const openTab = (id: string) =>
      act(() => {
        useTabs.setState({
          currentTab: { type: "sessions", id } as never,
        });
      });

    afterEach(() => {
      useTabs.setState({ currentTab: null });
      vi.restoreAllMocks();
    });

    it("hides the pill while the main window shows the listened note", async () => {
      vi.spyOn(document, "hasFocus").mockReturnValue(false);
      render(<FloatingMeetingWindowHost />);
      await waitFor(() => expect(mocks.floatingBarShow).toHaveBeenCalledOnce());
      await waitFor(() =>
        expect(focusMocks.handlers.has("main:tauri://focus")).toBe(true),
      );

      await openTab("session-1");
      await fire("main", "focus");
      await waitFor(() => expect(focusMocks.windowHide).toHaveBeenCalledOnce());

      // Perte du focus : la pastille revient après la temporisation.
      await fire("main", "blur");
      expect(focusMocks.windowShow).not.toHaveBeenCalled();
      await waitFor(() => expect(focusMocks.windowShow).toHaveBeenCalledOnce());
      expect(mocks.floatingBarShow).toHaveBeenCalledOnce();
      expect(mocks.floatingBarHide).not.toHaveBeenCalled();
    });

    it("shows the pill again on another tab", async () => {
      vi.spyOn(document, "hasFocus").mockReturnValue(true);
      await openTab("session-1");
      render(<FloatingMeetingWindowHost />);
      await waitFor(() => expect(mocks.floatingBarUpdate).toHaveBeenCalled());
      expect(mocks.floatingBarShow).not.toHaveBeenCalled();

      await openTab("other-note");
      await waitFor(() => expect(mocks.floatingBarShow).toHaveBeenCalledOnce());
    });
  });

  it("gives an active meeting ownership of the panel", async () => {
    useDictationStatus.setState({ phase: "recording", owner: "dictation-1" });
    render(<FloatingMeetingWindowHost />);
    await waitFor(() =>
      expect(mocks.floatingBarUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ dictation: null }),
      ),
    );
    expect(mocks.floatingBarShow).toHaveBeenCalledOnce();
  });
});
