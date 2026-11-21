import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Issue 643 : ajout au dictionnaire accepté ou refusé dans la carte, puis
// annulable en un clic.
const mocks = vi.hoisted(() => ({
  removeDictionaryTerms: vi.fn(() => Promise.resolve()),
}));

vi.mock("~/chat/tools/dictionary-terms", () => ({
  removeDictionaryTerms: mocks.removeDictionaryTerms,
}));

import { ToolSessionCorrection } from "./session-correction";

import { usePendingDictionaryStore } from "~/chat/tools/pending-dictionary-store";

const running = {
  type: "tool-apply_session_correction",
  toolCallId: "call-1",
  state: "input-available",
  input: { oldText: "Kovalchik", newText: "Kowalczyk" },
} as const;

function done(dictionaryChanges: Record<string, unknown>) {
  return {
    ...running,
    state: "output-available",
    output: { status: "applied", dictionaryChanges },
  } as const;
}

describe("ToolSessionCorrection", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    usePendingDictionaryStore.setState({ approvals: new Map() });
  });

  it("asks before adding terms, and answers the tool", () => {
    const resolve = vi.fn();
    usePendingDictionaryStore
      .getState()
      .addApproval({ requestId: "call-1", terms: ["Kowalczyk"], resolve });
    render(<ToolSessionCorrection part={running as never} />);

    expect(screen.getByText("Kowalczyk", { selector: "li" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add to dictionary" }));
    expect(resolve).toHaveBeenCalledWith(true);
    expect(usePendingDictionaryStore.getState().approvals.size).toBe(0);
  });

  it("can decline the terms", () => {
    const resolve = vi.fn();
    usePendingDictionaryStore
      .getState()
      .addApproval({ requestId: "call-1", terms: ["Kowalczyk"], resolve });
    render(<ToolSessionCorrection part={running as never} />);

    fireEvent.click(screen.getByRole("button", { name: "Don't add" }));
    expect(resolve).toHaveBeenCalledWith(false);
  });

  it("shows the added terms with a one-click undo", async () => {
    render(
      <ToolSessionCorrection
        part={done({ addedTerms: ["Kowalczyk"], rejectedTerms: [] }) as never}
      />,
    );

    expect(screen.getByText("Added to your dictionary:")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(screen.getByText("Removed from your dictionary:")).toBeTruthy(),
    );
    expect(mocks.removeDictionaryTerms).toHaveBeenCalledWith(["Kowalczyk"]);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("says how many suggested terms were ignored", () => {
    render(
      <ToolSessionCorrection
        part={
          done({
            addedTerms: [],
            rejectedTerms: ["https://attaquant.example", "![](x)"],
          }) as never
        }
      />,
    );
    // Le pluriel ICU n'est pas résolu par la traduction factice des tests.
    expect(document.body.textContent).toContain("suggested terms were ignored");
    expect(document.body.textContent).not.toContain("attaquant");
  });
});
