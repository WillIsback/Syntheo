import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type CapsuleActions,
  type CapsuleListening,
  NoteCapsule,
} from "./index";

vi.mock("motion/react", () => ({ useReducedMotion: () => false }));

function makeActions(): CapsuleActions {
  return {
    onStart: vi.fn(),
    onStop: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onToggleMic: vi.fn(),
    onToggleSpeaker: vi.fn(),
    onCopy: vi.fn(),
    onExport: vi.fn(),
    onAsk: vi.fn(),
  };
}

function renderListening(
  listening: Partial<CapsuleListening> = {},
  actions = makeActions(),
) {
  render(
    <NoteCapsule
      stage="listen"
      actions={actions}
      listening={{
        seconds: 767,
        amplitude: 0.5,
        muted: false,
        speakerMuted: false,
        finalizing: false,
        ...listening,
      }}
    />,
  );
  return actions;
}

const micToggle = () =>
  screen.getByRole("button", { name: "Mute the microphone" });
const speakerToggle = () =>
  screen.getByRole("button", { name: "Mute system audio" });

// Issue 447 : couper le micro et le son système depuis la capsule d'écoute.
describe("NoteCapsule channel toggles", () => {
  afterEach(() => {
    cleanup();
  });

  it("sits between the sound level and Put on pause", () => {
    renderListening();

    const capsule = screen.getByRole("group", { name: "Note capsule" });
    const meter = capsule.querySelector("[data-level-meter]")!;
    const pause = screen.getByRole("button", { name: "Pause listening" });
    for (const toggle of [micToggle(), speakerToggle()]) {
      expect(
        meter.compareDocumentPosition(toggle) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        toggle.compareDocumentPosition(pause) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("says what a click does, with the shortcut, while everything is captured", () => {
    renderListening();

    expect(micToggle().getAttribute("aria-pressed")).toBe("false");
    expect(micToggle().title).toBe("Mute the microphone (Ctrl+Shift+M)");
    expect(micToggle().getAttribute("aria-keyshortcuts")).toBe(
      "Control+Shift+M",
    );
    expect(speakerToggle().getAttribute("aria-pressed")).toBe("false");
    expect(speakerToggle().title).toBe("Mute system audio (Ctrl+Shift+S)");
    expect(micToggle().className).not.toContain("bg-recording");
  });

  it("shows a muted microphone on the recording background", () => {
    renderListening({ muted: true });

    expect(micToggle().getAttribute("aria-pressed")).toBe("true");
    expect(micToggle().title).toBe("Unmute the microphone (Ctrl+Shift+M)");
    expect(micToggle().className).toContain("bg-recording");
    expect(micToggle().className).toContain("text-background");
    expect(speakerToggle().getAttribute("aria-pressed")).toBe("false");
    // Le son système reste capté : le niveau continue de bouger.
    expect(
      document
        .querySelector("[data-level-meter]")
        ?.getAttribute("data-animated"),
    ).toBe("true");
  });

  it("shows muted system audio and keeps the microphone", () => {
    renderListening({ speakerMuted: true });

    expect(speakerToggle().getAttribute("aria-pressed")).toBe("true");
    expect(speakerToggle().title).toBe("Unmute system audio (Ctrl+Shift+S)");
    expect(speakerToggle().className).toContain("bg-recording");
    expect(micToggle().getAttribute("aria-pressed")).toBe("false");
  });

  it("flattens the level once both channels are muted", () => {
    renderListening({ muted: true, speakerMuted: true });

    expect(
      document
        .querySelector("[data-level-meter]")
        ?.getAttribute("data-animated"),
    ).toBe("false");
  });

  it("toggles each channel on its own", () => {
    const actions = renderListening();

    fireEvent.click(micToggle());
    expect(actions.onToggleMic).toHaveBeenCalledOnce();
    expect(actions.onToggleSpeaker).not.toHaveBeenCalled();

    fireEvent.click(speakerToggle());
    expect(actions.onToggleSpeaker).toHaveBeenCalledOnce();
    expect(actions.onPause).not.toHaveBeenCalled();
  });

  it("hides the toggles during a pause and disables them while finishing", () => {
    renderListening({ paused: true });
    expect(
      screen.queryByRole("button", { name: "Mute the microphone" }),
    ).toBeNull();
    cleanup();

    renderListening({ finalizing: true });
    expect((micToggle() as HTMLButtonElement).disabled).toBe(true);
    expect((speakerToggle() as HTMLButtonElement).disabled).toBe(true);
  });
});
