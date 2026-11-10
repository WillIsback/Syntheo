import { beforeEach, describe, expect, test, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  label: "main",
  emitTo: vi.fn(async () => {}),
  live: {
    sessionId: "session-1" as string | null,
    status: "active",
    muted: false,
    speakerMuted: false,
  },
  setMuted: vi.fn(),
  setSpeakerMuted: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => {}),
  emitTo: hoisted.emitTo,
  listen: vi.fn(),
}));
vi.mock("@syntheo/plugin-transcription", () => ({ commands: {} }));
vi.mock("@syntheo/plugin-windows", () => ({
  getCurrentWebviewWindowLabel: () => hoisted.label,
}));
vi.mock("./contexts", () => ({ useListener: vi.fn() }));
vi.mock("./useStartListeningWithBatchOverride", () => ({
  useStartListeningWithBatchOverride: vi.fn(),
}));
vi.mock("./pause-listening", () => ({ finishPausedListening: vi.fn() }));
vi.mock("~/store/zustand/listener/instance", () => ({
  listenerStore: {
    getState: () => ({
      live: hoisted.live,
      setMuted: hoisted.setMuted,
      setSpeakerMuted: hoisted.setSpeakerMuted,
    }),
  },
}));

import { setChannelMuted, toggleLiveChannel } from "./channel-mute";

// Issue 447 : une bascule coupe son canal sans relancer l'écoute.
describe("channel mute", () => {
  beforeEach(() => {
    hoisted.label = "main";
    hoisted.live = {
      sessionId: "session-1",
      status: "active",
      muted: false,
      speakerMuted: false,
    };
    hoisted.emitTo.mockClear();
    hoisted.setMuted.mockClear();
    hoisted.setSpeakerMuted.mockClear();
  });

  test("the main window mutes the channel of the current listening", () => {
    expect(toggleLiveChannel("mic")).toBe(true);
    expect(hoisted.setMuted).toHaveBeenCalledWith(true);

    hoisted.live.speakerMuted = true;
    expect(toggleLiveChannel("speaker")).toBe(true);
    expect(hoisted.setSpeakerMuted).toHaveBeenCalledWith(false);
    expect(hoisted.emitTo).not.toHaveBeenCalled();
  });

  test("the shortcuts do nothing outside a listening", () => {
    hoisted.live.status = "inactive";
    expect(toggleLiveChannel("mic")).toBe(false);

    setChannelMuted("session-1", "speaker", true);
    expect(hoisted.setMuted).not.toHaveBeenCalled();
    expect(hoisted.setSpeakerMuted).not.toHaveBeenCalled();
  });

  test("ignores another session", () => {
    setChannelMuted("session-2", "mic", true);
    expect(hoisted.setMuted).not.toHaveBeenCalled();
  });

  test.each([
    ["mic", true, "muteMic"],
    ["mic", false, "unmuteMic"],
    ["speaker", true, "muteSpeaker"],
    ["speaker", false, "unmuteSpeaker"],
  ] as const)(
    "a detached note asks the main window (%s %s)",
    async (channel, muted, action) => {
      hoisted.label = "note-1";
      setChannelMuted("session-1", channel, muted);

      expect(hoisted.emitTo).toHaveBeenCalledWith(
        "main",
        "syntheo:listener-control",
        expect.objectContaining({ action, sessionId: "session-1" }),
      );
      expect(hoisted.setMuted).not.toHaveBeenCalled();
      expect(hoisted.setSpeakerMuted).not.toHaveBeenCalled();
    },
  );
});
