import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FloatingBarState } from "@syntheo/plugin-windows";

import { FloatingBarOverlay } from "./bar";

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
    liveCaptionMinimized: true,
    liveCaptionToggleVisible: true,
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

describe("FloatingBarOverlay", () => {
  afterEach(() => {
    cleanup();
  });

  it.each(["recording", "reconnecting", "error"] as const)(
    "stops listening while %s",
    (status) => {
      const onStop = vi.fn();

      render(
        <FloatingBarOverlay
          state={state({ status })}
          onStop={onStop}
          onToggleExpanded={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /stop listening/i }));

      expect(onStop).toHaveBeenCalledOnce();
    },
  );

  // Issue 353 : « Mettre en pause » pendant l'écoute ; en pause, l'état est
  // écrit en toutes lettres avec « Reprendre » et « Terminer ».
  it("pauses the listening from the floating bar", () => {
    const onPause = vi.fn();
    render(
      <FloatingBarOverlay
        state={state()}
        onStop={vi.fn()}
        onPause={onPause}
        onResume={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Pause listening" }));

    expect(onPause).toHaveBeenCalledOnce();
  });

  it("shows Paused with Resume and Finish while paused", () => {
    const onResume = vi.fn();
    const onStop = vi.fn();
    render(
      <FloatingBarOverlay
        state={state({
          status: "paused",
          amplitude: 0,
          liveCaptionToggleVisible: false,
          transcriptBubbles: [],
        })}
        onStop={onStop}
        onPause={vi.fn()}
        onResume={onResume}
        onToggleExpanded={vi.fn()}
      />,
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

  it("expands to the live transcript and can collapse again", () => {
    const onToggleExpanded = vi.fn();

    const view = render(
      <FloatingBarOverlay
        state={state()}
        onStop={vi.fn()}
        onToggleExpanded={onToggleExpanded}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: "Expand live transcript",
    });
    fireEvent.click(toggle);
    expect(onToggleExpanded).toHaveBeenCalledWith(true);

    view.rerender(
      <FloatingBarOverlay
        state={state({ liveCaptionMinimized: false })}
        onStop={vi.fn()}
        onToggleExpanded={onToggleExpanded}
      />,
    );

    screen.getByRole("button", { name: "Collapse live transcript" });
    expect(screen.getByText("Let's start.")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse live transcript" }),
    );
    expect(onToggleExpanded).toHaveBeenCalledWith(false);
  });
});
