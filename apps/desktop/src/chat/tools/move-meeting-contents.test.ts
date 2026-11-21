import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  moveSessionContents: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("~/session/move-contents", () => ({
  moveSessionContents: mocks.moveSessionContents,
}));

vi.mock("~/db", () => ({
  liveQueryClient: { execute: mocks.execute },
}));

import { buildMoveMeetingContentsTool } from "./move-meeting-contents";
import {
  type ToolApproval,
  type ToolApprovalDecision,
  usePendingToolApprovalStore,
} from "./pending-tool-approval-store";

const TITLES: Record<string, string> = { source: "Standup", target: "Board" };
const OPTIONS = { toolCallId: "call-1" };

// La carte de l'outil répond à la demande de validation (issue 644).
const approvals = {
  decision: { approved: true } as ToolApprovalDecision,
  seen: [] as ToolApproval[],
};
let stopAnswering: (() => void) | null = null;

describe("move meeting contents chat tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockImplementation(async (_sql: string, [id]: string[]) =>
      TITLES[id] ? [{ title: TITLES[id] }] : [],
    );
    mocks.moveSessionContents.mockResolvedValue({
      status: "moved",
      sourceMeetingId: "source",
      targetMeetingId: "target",
      sourceTitle: "Standup",
      targetTitle: "Board",
      moved: {
        recording: true,
        transcripts: 1,
        summaries: 1,
        notes: true,
        actionItems: 0,
      },
    });
    approvals.decision = { approved: true };
    approvals.seen = [];
    stopAnswering = usePendingToolApprovalStore.subscribe((state) => {
      for (const approval of state.approvals.values()) {
        if (approvals.seen.includes(approval)) continue;
        approvals.seen.push(approval);
        queueMicrotask(() =>
          usePendingToolApprovalStore
            .getState()
            .resolveApproval(approval.requestId, approvals.decision),
        );
      }
    });
  });

  afterEach(() => {
    stopAnswering?.();
    usePendingToolApprovalStore.setState({ approvals: new Map() });
  });

  it("defaults the source meeting to the current session", async () => {
    const tool = buildMoveMeetingContentsTool({
      getSessionId: () => "source",
    });

    await expect(
      (tool as any).execute({ targetMeetingId: "target" }, OPTIONS),
    ).resolves.toMatchObject({ status: "moved" });

    expect(mocks.moveSessionContents).toHaveBeenCalledWith({
      sourceSessionId: "source",
      targetSessionId: "target",
    });
  });

  it("requires an explicit source when no meeting is open", async () => {
    const tool = buildMoveMeetingContentsTool({
      getSessionId: () => undefined,
    });

    await expect(
      (tool as any).execute({ targetMeetingId: "target" }, OPTIONS),
    ).resolves.toEqual({
      status: "error",
      message:
        "No source meeting selected. Provide sourceMeetingId explicitly when calling move_meeting_contents.",
    });
    expect(mocks.moveSessionContents).not.toHaveBeenCalled();
  });

  // Issue 644 : rien n'est déplacé sans l'accord de l'utilisateur.
  it("moves nothing when the user declines, and names both meetings", async () => {
    approvals.decision = { approved: false };
    const tool = buildMoveMeetingContentsTool({
      getSessionId: () => "source",
    });

    await expect(
      (tool as any).execute({ targetMeetingId: "target" }, OPTIONS),
    ).resolves.toMatchObject({ status: "declined" });

    expect(mocks.moveSessionContents).not.toHaveBeenCalled();
    expect(approvals.seen[0]).toMatchObject({
      kind: "move_meeting_contents",
      sourceTitle: "Standup",
      targetTitle: "Board",
    });
  });

  it("refuses an unknown meeting before asking anything", async () => {
    const tool = buildMoveMeetingContentsTool({
      getSessionId: () => "source",
    });

    await expect(
      (tool as any).execute({ targetMeetingId: "invented" }, OPTIONS),
    ).resolves.toMatchObject({ status: "error" });
    expect(approvals.seen).toEqual([]);
    expect(mocks.moveSessionContents).not.toHaveBeenCalled();
  });
});
