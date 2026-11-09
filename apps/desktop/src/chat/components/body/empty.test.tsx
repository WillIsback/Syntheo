import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const automationMocks = vi.hoisted(() => ({
  runWorkflowOnNote: vi.fn(async () => ({
    at: "2026-11-09T10:00:00.000Z",
    status: "success" as const,
    detail: "/exports/Planning.md",
  })),
  workflows: [] as unknown[],
}));

vi.mock("~/automations/engine", () => ({
  runWorkflowOnNote: automationMocks.runWorkflowOnNote,
}));

vi.mock("~/automations/workflows", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/automations/workflows")>()),
  useAutomationWorkflows: () => automationMocks.workflows,
}));

const READY_WORKFLOW = {
  id: "wf-hand",
  title: "Weekly recap",
  enabled: false,
  trigger: "manual",
  steps: [{ id: "s", type: "markdown_export", directory: "/exports" }],
  lastRun: null,
  processedSessionIds: [],
  chatGroupId: null,
};

vi.mock("~/chat/hooks/use-chat-appearance", () => ({
  useChatAppearance: () => ({
    isDarkAppearance: false,
  }),
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: () => vi.fn(),
}));

import { ChatBodyEmpty } from "./empty";

describe("ChatBodyEmpty", () => {
  beforeEach(() => {
    cleanup();
  });

  it("offers different quick actions for notes, live meetings, and no context", () => {
    const prompts: string[] = [];
    for (const props of [
      { hasContext: true },
      { hasContext: true, isLiveMeeting: true },
      { hasContext: false },
    ]) {
      const onSendMessage = vi.fn();
      const view = render(
        <ChatBodyEmpty {...props} onSendMessage={onSendMessage} />,
      );
      fireEvent.click(screen.getAllByRole("button")[0]);
      const [prompt, parts] = onSendMessage.mock.calls[0];
      expect(prompt.trim().length).toBeGreaterThan(0);
      expect(parts).toEqual([{ type: "text", text: prompt }]);
      prompts.push(prompt);
      view.unmount();
    }
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("offers shorter and longer rewrites only when the note has a summary", () => {
    const onSendMessage = vi.fn();
    const view = render(
      <ChatBodyEmpty hasContext hasSummary onSendMessage={onSendMessage} />,
    );
    fireEvent.click(screen.getByText("Make the summary shorter."));
    fireEvent.click(screen.getByText("Make the summary longer."));
    const [shorter, longer] = onSendMessage.mock.calls.map(
      ([prompt]) => prompt,
    );
    expect(shorter.trim()).not.toBe("");
    expect(longer.trim()).not.toBe("");
    expect(shorter).not.toEqual(longer);
    view.unmount();

    render(<ChatBodyEmpty hasContext onSendMessage={vi.fn()} />);
    expect(screen.queryByText("Make the summary shorter.")).toBeNull();
  });

  it("runs an automation on the open note from Ask the note", () => {
    automationMocks.workflows = [READY_WORKFLOW];

    render(
      <ChatBodyEmpty
        hasContext
        automationSessionId="session-1"
        onSendMessage={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("group", { name: "Run an automation" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByText("Weekly recap"));

    expect(automationMocks.runWorkflowOnNote).toHaveBeenCalledWith(
      "wf-hand",
      "session-1",
    );
    automationMocks.workflows = [];
  });

  it("offers no automation without an open note", () => {
    automationMocks.workflows = [READY_WORKFLOW];

    render(<ChatBodyEmpty hasContext onSendMessage={vi.fn()} />);

    expect(screen.queryByText("Run an automation")).toBeNull();
    automationMocks.workflows = [];
  });
});
