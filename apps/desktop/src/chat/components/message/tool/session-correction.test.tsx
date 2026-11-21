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

import { usePendingToolApprovalStore } from "~/chat/tools/pending-tool-approval-store";

const running = {
  type: "tool-apply_session_correction",
  toolCallId: "call-1",
  state: "input-available",
  input: { oldText: "Kovalchik", newText: "Kowalczyk" },
} as const;

const CORRECTION = {
  kind: "session_correction" as const,
  sessionTitle: "Standup",
  otherNote: false,
  oldText: "Kovalchik",
  newText: "Kowalczyk",
  summaries: 1,
  transcriptReplacements: 2,
  title: false,
  dictionaryTerms: ["Kowalczyk"],
};

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
    usePendingToolApprovalStore.setState({ approvals: new Map() });
  });

  // Issue 644 : une seule carte valide la correction et les termes.
  it("shows the correction and the terms, and applies both on approval", () => {
    const resolve = vi.fn();
    usePendingToolApprovalStore.getState().addApproval({
      ...CORRECTION,
      requestId: "call-1",
      resolve,
    });
    render(<ToolSessionCorrection part={running as never} />);

    expect(screen.getByText("Kowalczyk", { selector: "li" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("another note");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(resolve).toHaveBeenCalledWith({
      approved: true,
      addDictionaryTerms: true,
    });
    expect(usePendingToolApprovalStore.getState().approvals.size).toBe(0);
  });

  it("can apply the correction without adding the terms", () => {
    const resolve = vi.fn();
    usePendingToolApprovalStore.getState().addApproval({
      ...CORRECTION,
      requestId: "call-1",
      resolve,
    });
    render(<ToolSessionCorrection part={running as never} />);

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(resolve).toHaveBeenCalledWith({
      approved: true,
      addDictionaryTerms: false,
    });
  });

  it("can decline the whole correction", () => {
    const resolve = vi.fn();
    usePendingToolApprovalStore.getState().addApproval({
      ...CORRECTION,
      requestId: "call-1",
      resolve,
    });
    render(<ToolSessionCorrection part={running as never} />);

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(resolve).toHaveBeenCalledWith({
      approved: false,
      addDictionaryTerms: false,
    });
  });

  it("warns when the correction changes another note", () => {
    usePendingToolApprovalStore.getState().addApproval({
      ...CORRECTION,
      otherNote: true,
      sessionTitle: "Comité budget",
      requestId: "call-1",
      resolve: vi.fn(),
    });
    render(<ToolSessionCorrection part={running as never} />);

    expect(document.body.textContent).toContain(
      "This correction changes another note: Comité budget",
    );
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
