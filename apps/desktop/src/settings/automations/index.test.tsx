import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real iconify-icon web component renders asynchronously via timers that
// can fire after the test environment is torn down ("document is not
// defined" unhandled errors), so render an inert element instead.
vi.mock("@iconify-icon/react", () => ({
  Icon: (props: Record<string, unknown>) =>
    createElement("iconify-icon", props),
}));

const mocks = vi.hoisted(() => ({
  chatGroup: null as {
    id: string;
    ownerUserId: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  } | null,
  deleteChatAutomation: vi.fn(),
  deleteWorkflow: vi.fn(),
  removeDraft: vi.fn(),
  createFromTemplate: vi.fn(),
  selectWorkflow: vi.fn(),
  selection: null as unknown,
  setSettingValue: vi.fn<(...args: unknown[]) => Promise<void>>(() =>
    Promise.resolve(),
  ),
  workflows: [] as Array<Record<string, unknown>>,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("~/automations/actions", () => ({
  useCreateWorkflowFromTemplate: () => ({
    mutate: mocks.createFromTemplate,
    isPending: false,
  }),
  useDeleteChatAutomation: () => ({ mutate: mocks.deleteChatAutomation }),
  useDeleteWorkflow: () => ({ mutate: mocks.deleteWorkflow }),
}));

vi.mock("~/automations/workflows", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/automations/workflows")>();
  return {
    ...actual,
    useAutomationWorkflows: () => mocks.workflows,
    saveAutomationWorkflows: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("~/automations/selection", () => ({
  useAutomationSelection: (selector: (state: unknown) => unknown) =>
    selector({
      removeDraft: mocks.removeDraft,
      selectWorkflow: mocks.selectWorkflow,
    }),
  useEffectiveAutomationSelection: () => mocks.selection,
}));

vi.mock("~/chat/store/queries", () => ({
  useChatGroup: () => mocks.chatGroup,
}));

vi.mock("~/settings/queries", () => ({
  setSettingValue: mocks.setSettingValue,
  setSettingValues: mocks.setSettingValue,
  getStoredSettingValues: () =>
    Promise.resolve({
      values: { automation_workflows: "[]" },
      hasValues: new Set(["automation_workflows"]),
    }),
  useStoredSettingValue: () => ({ value: "", hasValue: false }),
  useStoredSettingValues: () => ({ values: {}, hasValues: new Set() }),
}));

vi.mock("./markdown-export-config", () => ({
  AutomationLastRunLine: () => null,
  MarkdownExportConfig: () => <div data-testid="config-markdown" />,
}));

vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  },
}));

import { AutomationsContent } from ".";

function renderAutomations() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AutomationsContent />
    </QueryClientProvider>,
  );
}

describe("AutomationsContent", () => {
  // Radix's focus scope schedules a focus dispatch on unmount, so drain the
  // timer queue while jsdom is still alive; left pending it fires against a
  // torn-down realm and vitest reports an unhandled error.
  afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  beforeEach(() => {
    mocks.chatGroup = null;
    mocks.deleteChatAutomation.mockClear();
    mocks.deleteWorkflow.mockClear();
    mocks.removeDraft.mockClear();
    mocks.createFromTemplate.mockClear();
    mocks.selectWorkflow.mockClear();
    mocks.selection = null;
    mocks.workflows = [];
    mocks.setSettingValue.mockClear();
    mocks.toastError.mockClear();
    mocks.toastSuccess.mockClear();
    mocks.toastWarning.mockClear();
  });

  it("shows one list and the templates when nothing is selected", () => {
    mocks.workflows = [
      {
        id: "legacy-markdown-export",
        title: "",
        templateId: "markdown-export",
        enabled: true,
        trigger: "meeting_completed",
        steps: [{ id: "s", type: "markdown_export", directory: "/exports" }],
        lastRun: null,
        processedSessionIds: [],
        chatGroupId: null,
      },
    ];

    renderAutomations();

    expect(screen.getByRole("heading", { name: "Automations" })).toBeTruthy();
    expect(
      screen.getByText(
        "Syntheo chains local steps after your meetings. Nothing leaves your computer, except a webhook step if you add one.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Start from a template")).toBeTruthy();
    expect(screen.getByText("My automations")).toBeTruthy();
    // Ses actions existent (issue 442) : « Extraire les tâches » est proposé.
    expect(screen.getByText("Extract tasks")).toBeTruthy();
    expect(screen.queryByText(/Zapier|destination/i)).toBeNull();
    expect(
      screen.getByText("Meeting ends → Export as Markdown · never run"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByText("Meeting ends → Export as Markdown · never run"),
    );
    expect(mocks.selectWorkflow).toHaveBeenCalledWith(
      "legacy-markdown-export",
      null,
    );
  });

  it("creates an automation from the Markdown template", () => {
    renderAutomations();

    fireEvent.click(screen.getByRole("button", { name: /Export as Markdown/ }));

    expect(mocks.createFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "markdown-export" }),
    );
  });

  it("numbers the trigger 1 and the actions 2, 3 with translated labels", () => {
    mocks.selection = { kind: "workflow", workflowId: "wf-1" };
    mocks.workflows = [
      {
        id: "wf-1",
        title: "Archive",
        enabled: false,
        trigger: "manual",
        steps: [
          { id: "a", type: "markdown_export", directory: "/a" },
          { id: "b", type: "markdown_export", directory: "" },
        ],
        lastRun: null,
        processedSessionIds: [],
        chatGroupId: null,
      },
    ];

    renderAutomations();

    expect(screen.getByRole("heading", { name: "Archive" })).toBeTruthy();
    const numbers = Array.from(
      document.querySelectorAll("[data-step-number]"),
    ).map((badge) => badge.textContent);
    expect(numbers).toEqual(["1", "2", "3"]);
    expect(screen.getByRole("button", { name: "Remove step 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove step 3" })).toBeTruthy();
    expect(
      screen.getByText(
        "Launch it from a note: the ⋯ menu, the capsule in Synthesis, or Ask the note (Ctrl+J).",
      ),
    ).toBeTruthy();
    // Variables de base dès l'étape 1, puis la sortie de l'étape 2.
    expect(screen.getAllByText("Summary").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Exported file").length).toBeGreaterThan(0);
    // Lancée à la main : pas de bouton d'activation.
    expect(screen.queryByRole("button", { name: "Save & enable" })).toBeNull();
    expect(
      screen.queryByText(/Unsupported step|Zapier|destination/i),
    ).toBeNull();
  });

  it("shows the untitled draft page after the sidebar plus button", () => {
    mocks.selection = { kind: "draft", draftId: "draft-1" };

    renderAutomations();

    expect(
      screen.getByRole("heading", { name: "Untitled automation" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Add a step").length).toBeGreaterThan(0);
  });

  it.each([
    {
      name: "draft",
      selection: { kind: "draft", draftId: "draft-1" },
      chatGroup: null,
      mock: mocks.removeDraft,
      id: "draft-1",
    },
    {
      name: "chat automation",
      selection: { kind: "chat", groupId: "automation-1" },
      chatGroup: {
        id: "automation-1",
        ownerUserId: "user-1",
        title: "Share weekly recap",
        createdAt: "2026-08-03T10:00:00.000Z",
        updatedAt: "2026-08-03T10:00:00.000Z",
      },
      mock: mocks.deleteChatAutomation,
      id: "automation-1",
    },
  ])(
    "deletes a $name from its actions menu",
    async ({ selection, chatGroup, mock, id }) => {
      mocks.selection = selection;
      mocks.chatGroup = chatGroup;

      renderAutomations();

      const trigger = screen.getByRole("button", {
        name: "Automation actions",
      });
      fireEvent.pointerDown(trigger);
      fireEvent.click(trigger);

      fireEvent.click(await screen.findByText("Delete automation"));

      expect(mock).toHaveBeenCalledWith(id);
    },
  );
});
