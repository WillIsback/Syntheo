import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TranscriptionFailureNotice } from "./transcription-failure";

// Issue 559 : un import sans parole laissait la note vierge en « Préparer »,
// sans mention de l'échec. La note l'affiche désormais.

const mocks = vi.hoisted(() => ({
  batch: {} as Record<
    string,
    { error?: string | null; terminalReason?: string | null }
  >,
  clearBatchSession: vi.fn(),
}));

vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({
      batch: mocks.batch,
      clearBatchSession: mocks.clearBatchSession,
    }),
}));

describe("TranscriptionFailureNotice", () => {
  beforeEach(() => {
    mocks.batch = {};
    mocks.clearBatchSession.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows why the audio transcription failed", () => {
    mocks.batch = {
      "session-1": {
        error: "No speech was detected in the audio.",
        terminalReason: "failed",
      },
    };
    render(<TranscriptionFailureNotice sessionId="session-1" />);

    const notice = screen.getByRole("alert");
    expect(notice.textContent).toContain("The audio transcription failed.");
    expect(notice.textContent).toContain(
      "No speech was detected in the audio.",
    );
  });

  it("clears the failure when dismissed", () => {
    mocks.batch = {
      "session-1": { error: "boom", terminalReason: "failed" },
    };
    render(<TranscriptionFailureNotice sessionId="session-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(mocks.clearBatchSession).toHaveBeenCalledWith("session-1");
  });

  it("stays hidden without a failure or after a user stop", () => {
    mocks.batch = {
      "session-2": { error: "boom", terminalReason: "failed" },
      "session-3": { error: "stopped", terminalReason: "stopped" },
    };
    const { rerender } = render(
      <TranscriptionFailureNotice sessionId="session-1" />,
    );
    expect(screen.queryByRole("alert")).toBeNull();

    rerender(<TranscriptionFailureNotice sessionId="session-3" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
