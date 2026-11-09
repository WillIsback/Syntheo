import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TranscriptEmptyState } from "./empty";

describe("TranscriptEmptyState", () => {
  afterEach(() => {
    cleanup();
  });

  it("lets users stop batch transcription", () => {
    const onStopTranscription = vi.fn();

    render(
      <TranscriptEmptyState
        isBatching
        phase="transcribing"
        onStopTranscription={onStopTranscription}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stop transcription" }));

    expect(onStopTranscription).toHaveBeenCalledTimes(1);
  });

  it("shows the remaining time once the progress can be extrapolated", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const { rerender } = render(
        <TranscriptEmptyState
          isBatching
          phase="transcribing"
          percentage={0.1}
        />,
      );
      expect(screen.getByText("10% complete")).not.toBeNull();
      expect(document.querySelector("[data-remaining-time]")).toBeNull();

      vi.setSystemTime(60_000);
      rerender(
        <TranscriptEmptyState
          isBatching
          phase="transcribing"
          percentage={0.2}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(1_000);
      });

      // 10 % par minute : il reste 8 minutes.
      expect(screen.getByText("About 8 min remaining")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides the stop control while importing audio", () => {
    render(<TranscriptEmptyState isBatching phase="importing" />);

    expect(
      screen.queryByRole("button", { name: "Stop transcription" }),
    ).toBeNull();
  });

  // Aucun audio conservé : rien à retranscrire.
  it("uses the same error hierarchy without offering re-transcription", () => {
    render(
      <TranscriptEmptyState error="The transcription provider timed out." />,
    );

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.getByText("Transcription failed").className).toContain(
      "text-base",
    );
    expect(
      screen.getByText("The transcription provider timed out.").className,
    ).toContain("text-sm");

    expect(screen.queryByRole("button", { name: "Re-transcribe" })).toBeNull();
  });
});
