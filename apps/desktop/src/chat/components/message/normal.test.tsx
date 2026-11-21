import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Issue 644 : une carte qui attend une décision est visible sans déplier la
// section « Activité ».
vi.mock("streamdown", () => ({
  defaultRehypePlugins: {},
  Streamdown: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { NormalMessage } from "./normal";

import { usePendingToolApprovalStore } from "~/chat/tools/pending-tool-approval-store";

function assistantMessage(parts: Array<Record<string, unknown>>) {
  return {
    id: "message-1",
    role: "assistant",
    parts,
    metadata: { createdAt: Date.now() },
  } as never;
}

describe("NormalMessage", () => {
  afterEach(() => {
    cleanup();
    usePendingToolApprovalStore.setState({ approvals: new Map() });
  });

  it("shows a correction waiting for approval outside the collapsed activity", () => {
    usePendingToolApprovalStore.getState().addApproval({
      kind: "session_correction",
      sessionTitle: "Standup",
      otherNote: false,
      oldText: "Kovalchik",
      newText: "Kowalczyk",
      summaries: 1,
      transcriptReplacements: 0,
      title: false,
      dictionaryTerms: [],
      requestId: "call-1",
      resolve: vi.fn(),
    });

    render(
      <NormalMessage
        message={assistantMessage([
          {
            type: "tool-search_meetings",
            toolCallId: "call-0",
            state: "output-available",
            input: { query: "standup" },
            output: { meetings: [] },
          },
          {
            type: "tool-apply_session_correction",
            toolCallId: "call-1",
            state: "input-available",
            input: { oldText: "Kovalchik", newText: "Kowalczyk" },
          },
        ])}
      />,
    );

    // Hors du <details> replié de « Activité » : visible sans action.
    expect(
      screen.getByRole("button", { name: "Apply" }).closest("details"),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Decline" }).closest("details"),
    ).toBeNull();
    // La recherche reste rangée dans « Activité », repliée.
    expect(screen.getByText("Activity").closest("details")).not.toBeNull();
  });

  it.each(["tool-move_meeting_contents", "tool-move_meetings_to_folder"])(
    "keeps %s out of the activity section",
    (type) => {
      usePendingToolApprovalStore.getState().addApproval({
        kind: "move_meeting_contents",
        sourceTitle: "Standup",
        targetTitle: "Board",
        requestId: "call-2",
        resolve: vi.fn(),
      });
      render(
        <NormalMessage
          message={assistantMessage([
            { type, toolCallId: "call-2", state: "input-available", input: {} },
          ])}
        />,
      );
      expect(screen.queryByText("Activity")).toBeNull();
      expect(
        screen.getByRole("button", { name: "Apply" }).closest("details"),
      ).toBeNull();
    },
  );
});
