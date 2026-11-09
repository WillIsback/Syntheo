import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FloatingBarState } from "@syntheo/plugin-windows";

import { FloatingBarOverlay } from "./bar";
import {
  FLOATING_BAR_RECORDING_PILL_WIDTH,
  FLOATING_PILL_SLOTS,
  formatListeningDuration,
} from "./layout";

vi.mock("@syntheo/ui/components/ui/dancing-sticks", () => ({
  DancingSticks: ({ amplitude }: { amplitude: number }) => (
    <span data-testid="waveform" data-amplitude={amplitude} />
  ),
}));

function state(overrides: Partial<FloatingBarState> = {}): FloatingBarState {
  return {
    dictation: null,
    amplitude: 0.4,
    title: "Weekly sync",
    status: "recording",
    colorScheme: "light",
    opacity: 0.78,
    liveCaptionOpacity: 0.3,
    liveCaptionWidth: 440,
    liveCaptionLineCount: 1,
    liveCaptionPosition: "topCenter",
    liveCaptionMinimized: false,
    liveCaptionToggleVisible: true,
    elapsedSeconds: 767,
    transcriptBubbles: [
      {
        id: "1",
        speakerLabel: "Ada",
        text: "Let's start.",
        isSelf: false,
        isFinal: true,
        startMs: 0,
        endMs: 1200,
        overlapsPrevious: false,
        overlapsNext: false,
      },
    ],
    ...overrides,
  };
}

function renderPill(
  overrides: Partial<FloatingBarState> = {},
  callbacks: Partial<Parameters<typeof FloatingBarOverlay>[0]> = {},
) {
  return render(
    <FloatingBarOverlay
      state={state(overrides)}
      onStop={vi.fn()}
      onPause={vi.fn()}
      onResume={vi.fn()}
      onOpenNote={vi.fn()}
      onToggleExpanded={vi.fn()}
      {...callbacks}
    />,
  );
}

describe("formatListeningDuration", () => {
  it.each([
    [0, "00:00"],
    [767, "12:47"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3767, "1:02:47"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatListeningDuration(seconds)).toBe(expected);
  });
});

describe("FloatingBarOverlay meeting pill (issue 448)", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the duration, the sound level, Pause and Finish with visible labels", () => {
    renderPill();

    expect(screen.getByText("12:47")).toBeTruthy();
    expect(screen.getByTestId("waveform").dataset.amplitude).toBe("0.4");
    expect(
      screen.getByRole("button", { name: "Pause listening" }).textContent,
    ).toBe("Pause");
    expect(
      screen.getByRole("button", { name: "Finish the meeting" }).textContent,
    ).toBe("Finish");
  });

  it("keeps the slots in step with the window width computed by Rust", () => {
    expect(
      Object.values(FLOATING_PILL_SLOTS).reduce<number>(
        (sum, width) => sum + width,
        0,
      ),
    ).toBe(FLOATING_BAR_RECORDING_PILL_WIDTH);
  });

  it.each(["recording", "reconnecting", "error"] as const)(
    "finishes the meeting while %s",
    (status) => {
      const onStop = vi.fn();
      renderPill({ status }, { onStop });

      fireEvent.click(
        screen.getByRole("button", { name: "Finish the meeting" }),
      );

      expect(onStop).toHaveBeenCalledOnce();
    },
  );

  it("pauses the listening from the pill", () => {
    const onPause = vi.fn();
    renderPill({}, { onPause });

    fireEvent.click(screen.getByRole("button", { name: "Pause listening" }));

    expect(onPause).toHaveBeenCalledOnce();
  });

  // Issue 353 : en pause, l'état est écrit en toutes lettres avec « Reprendre » et
  // « Terminer ».
  it("shows Paused with Resume and Finish while paused", () => {
    const onResume = vi.fn();
    const onStop = vi.fn();
    renderPill(
      {
        status: "paused",
        amplitude: 0,
        liveCaptionToggleVisible: false,
        transcriptBubbles: [],
      },
      { onResume, onStop },
    );

    expect(screen.getByRole("status").textContent).toBe("Paused");
    expect(screen.queryByTestId("waveform")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Pause listening" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume listening" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish the meeting" }));

    expect(onResume).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("brings the note back when the duration is clicked", () => {
    const onOpenNote = vi.fn();
    renderPill({}, { onOpenNote });

    fireEvent.click(screen.getByRole("button", { name: /back to the note/i }));

    expect(onOpenNote).toHaveBeenCalledOnce();
  });

  it("no longer offers the live transcript in a meeting", () => {
    renderPill({ liveCaptionMinimized: false, liveCaptionToggleVisible: true });

    expect(
      screen.queryByRole("button", { name: /live transcript/i }),
    ).toBeNull();
    expect(screen.queryByText("Let's start.")).toBeNull();
    expect(screen.queryByText("Ada")).toBeNull();
  });

  it("is dragged from anywhere except its buttons", () => {
    const view = renderPill();

    const pill = screen.getByTestId("meeting-pill");
    expect(pill.getAttribute("data-tauri-drag-region")).toBe("deep");
    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("data-tauri-drag-region")).toBe("false");
    }

    // Calque Wayland : le compositeur tient la position, plus de zone de déplacement.
    view.rerender(
      <FloatingBarOverlay
        state={state({
          layout: { controlsCenterX: 131, expandsUpward: true, movable: false },
        })}
        onStop={vi.fn()}
        onOpenNote={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("meeting-pill").hasAttribute("data-tauri-drag-region"),
    ).toBe(false);
  });

  it("takes the whole window, with no reserved area above it", () => {
    renderPill();

    const pill = screen.getByTestId("meeting-pill");
    expect(pill.className).toContain("h-full");
    expect(pill.className).toContain("w-full");
    expect(pill.style.top).toBe("");
  });
});
