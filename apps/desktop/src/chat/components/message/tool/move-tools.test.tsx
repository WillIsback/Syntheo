import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ToolMoveMeetingContents,
  ToolMoveMeetingsToFolder,
} from "./move-tools";

import { usePendingToolApprovalStore } from "~/chat/tools/pending-tool-approval-store";

// Issue 644 : les déplacements proposés par le chat se valident dans la carte.
function part(type: string) {
  return {
    type,
    toolCallId: "call-1",
    state: "input-available",
    input: {},
  } as never;
}

describe("move tool cards", () => {
  beforeEach(() => {
    cleanup();
    usePendingToolApprovalStore.setState({ approvals: new Map() });
  });

  it("names both meetings before moving contents", () => {
    const resolve = vi.fn();
    usePendingToolApprovalStore.getState().addApproval({
      kind: "move_meeting_contents",
      sourceTitle: "Standup",
      targetTitle: "Board",
      requestId: "call-1",
      resolve,
    });
    render(
      <ToolMoveMeetingContents part={part("tool-move_meeting_contents")} />,
    );

    expect(document.body.textContent).toContain("Standup");
    expect(document.body.textContent).toContain("Board");
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(resolve).toHaveBeenCalledWith({ approved: false });
  });

  it("lists the meetings and the folder before moving them", () => {
    const resolve = vi.fn();
    usePendingToolApprovalStore.getState().addApproval({
      kind: "move_meetings_to_folder",
      folderPath: "Clients/Acme",
      meetingTitles: ["Kickoff", "Revue"],
      meetingCount: 7,
      requestId: "call-1",
      resolve,
    });
    render(
      <ToolMoveMeetingsToFolder part={part("tool-move_meetings_to_folder")} />,
    );

    expect(screen.getByText("Clients/Acme")).toBeTruthy();
    expect(screen.getByText("Kickoff")).toBeTruthy();
    expect(screen.getByText("Revue")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(resolve).toHaveBeenCalledWith({ approved: true });
  });
});
