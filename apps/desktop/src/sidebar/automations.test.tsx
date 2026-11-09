import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render as renderTesting,
  screen,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@iconify-icon/react", () => ({
  Icon: (props: Record<string, unknown>) =>
    createElement("iconify-icon", props),
}));

type ContextMenuItem =
  | { id: string; text: string; action: () => void }
  | { separator: true };

const mocks = vi.hoisted(() => ({
  automations: [] as Array<{
    id: string;
    ownerUserId: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  }>,
  contextMenus: [] as Array<
    Array<{ id: string; text: string; action: () => void }>
  >,
  deleteChatAutomation: vi.fn(),
  draftIds: [] as string[],
  removeDraft: vi.fn(),
  selection: null as unknown,
  selectChatAutomation: vi.fn(),
  selectDraft: vi.fn(),
  selectWorkflow: vi.fn(),
  startDraft: vi.fn(),
  saveAutomationWorkflows: vi.fn<
    (workflows: Array<{ id: string }>) => Promise<void>
  >(() => Promise.resolve()),
  showContextMenu: vi.fn(),
  workflows: [] as Array<{
    id: string;
    title: string;
    enabled: boolean;
    trigger: string;
    steps: unknown[];
    lastRun: null;
    processedSessionIds: string[];
    chatGroupId: string | null;
    templateId?: string;
  }>,
}));

vi.mock("~/chat/store/queries", () => ({
  useChatGroups: () => mocks.automations,
}));

vi.mock("~/automations/actions", () => ({
  useDeleteChatAutomation: () => ({ mutate: mocks.deleteChatAutomation }),
  useDeleteWorkflow: () => ({ mutate: vi.fn() }),
}));

vi.mock("~/automations/workflows", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/automations/workflows")>();
  return {
    ...actual,
    useAutomationWorkflows: () => mocks.workflows,
    saveAutomationWorkflows: mocks.saveAutomationWorkflows,
    mutateAutomationWorkflows: async (
      update: (workflows: typeof mocks.workflows) => typeof mocks.workflows,
    ) => {
      await mocks.saveAutomationWorkflows(update(mocks.workflows));
    },
  };
});

vi.mock("~/automations/selection", () => ({
  useAutomationSelection: (selector: (state: unknown) => unknown) =>
    selector({
      draftIds: mocks.draftIds,
      selectChatAutomation: mocks.selectChatAutomation,
      selectDraft: mocks.selectDraft,
      selectWorkflow: mocks.selectWorkflow,
      startDraft: mocks.startDraft,
      removeDraft: mocks.removeDraft,
    }),
  useEffectiveAutomationSelection: () => mocks.selection,
}));

vi.mock("~/shared/hooks/useNativeContextMenu", () => ({
  useNativeContextMenu: (items: ContextMenuItem[]) => {
    mocks.contextMenus.push(
      items.filter(
        (item): item is Exclude<ContextMenuItem, { separator: true }> =>
          !("separator" in item),
      ),
    );
    return mocks.showContextMenu;
  },
}));

vi.mock("~/sidebar/custom-sidebar-header", () => ({
  CustomSidebarHeader: ({ children }: { children?: React.ReactNode }) => (
    <header>{children}</header>
  ),
}));

import { AutomationsNav } from "./automations";

function render(ui: React.ReactElement) {
  return renderTesting(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      {ui}
    </QueryClientProvider>,
  );
}

function findContextMenuItem(id: string) {
  for (const items of mocks.contextMenus) {
    const match = items.find((item) => item.id === id);
    if (match) {
      return match;
    }
  }
  return undefined;
}

describe("AutomationsNav", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.automations = [
      {
        id: "automation-1",
        ownerUserId: "user-1",
        title: "Share weekly recap",
        createdAt: "2026-08-03T10:00:00.000Z",
        updatedAt: "2026-08-03T10:00:00.000Z",
      },
      {
        id: "automation-2",
        ownerUserId: "user-1",
        title: "Update project notes",
        createdAt: "2026-08-02T10:00:00.000Z",
        updatedAt: "2026-08-02T10:00:00.000Z",
      },
    ];
    mocks.contextMenus = [];
    mocks.draftIds = [];
    mocks.selection = { kind: "chat", groupId: "automation-1" };
    mocks.deleteChatAutomation.mockClear();
    mocks.removeDraft.mockClear();
    mocks.selectChatAutomation.mockClear();
    mocks.selectDraft.mockClear();
    mocks.selectWorkflow.mockClear();
    mocks.startDraft.mockClear();
    mocks.saveAutomationWorkflows.mockClear();
    mocks.workflows = [];
    mocks.showContextMenu.mockClear();
  });

  it("lists a single kind of automation, without separate starters", () => {
    mocks.workflows = [
      {
        id: "legacy-markdown-export",
        title: "",
        templateId: "markdown-export",
        enabled: true,
        trigger: "meeting_completed",
        steps: [],
        lastRun: null,
        processedSessionIds: [],
        chatGroupId: null,
      } as (typeof mocks.workflows)[number],
      {
        id: "wf-hand",
        title: "Weekly recap",
        enabled: false,
        trigger: "manual",
        steps: [],
        lastRun: null,
        processedSessionIds: [],
        chatGroupId: null,
      },
    ];

    render(<AutomationsNav />);

    expect(screen.queryByText("Get started")).toBeNull();
    expect(screen.getByText("Export as Markdown")).toBeTruthy();
    expect(screen.getByText("Enabled")).toBeTruthy();
    expect(screen.getByText("Manual")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Export as Markdown/ }));

    expect(mocks.selectWorkflow).toHaveBeenCalledWith(
      "legacy-markdown-export",
      null,
    );
  });

  it("lists chat automations and opens the selected conversation", () => {
    render(<AutomationsNav />);

    expect(screen.getByText("My automations")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: /Share weekly recap/ })
        .getAttribute("aria-current"),
    ).toBe("page");

    const chatAutomationButton = screen
      .getByText("Update project notes")
      .closest("button");
    expect(chatAutomationButton).toBeTruthy();
    fireEvent.click(chatAutomationButton!);

    expect(mocks.selectChatAutomation).toHaveBeenCalledWith("automation-2");
  });

  it("offers edit and delete in the chat automation context menu", () => {
    render(<AutomationsNav />);

    const chatAutomationButton = screen
      .getByText("Update project notes")
      .closest("button");
    fireEvent.contextMenu(chatAutomationButton!);

    expect(mocks.selectChatAutomation).toHaveBeenCalledWith("automation-2");
    expect(mocks.showContextMenu).toHaveBeenCalled();

    findContextMenuItem("delete-automation-automation-2")?.action();
    expect(mocks.deleteChatAutomation).toHaveBeenCalledWith("automation-2");
  });

  it("filters workflows and chat automations together", () => {
    render(<AutomationsNav />);

    fireEvent.change(screen.getByPlaceholderText("Search automations..."), {
      target: { value: "project" },
    });

    expect(screen.queryByText("Share weekly recap")).toBeNull();
    expect(screen.getByText("Update project notes")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.getByText("Share weekly recap")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Search automations..."), {
      target: { value: "zzz" },
    });

    expect(screen.getByText("No automations found")).toBeTruthy();
  });

  it("starts a new automation workflow from the sidebar", async () => {
    render(<AutomationsNav />);

    fireEvent.click(screen.getByRole("button", { name: "New automation" }));

    expect(mocks.saveAutomationWorkflows).toHaveBeenCalledOnce();
    const saved = mocks.saveAutomationWorkflows.mock.calls[0]?.[0];
    expect(saved).toHaveLength(1);
    await vi.waitFor(() => {
      expect(mocks.selectWorkflow).toHaveBeenCalledWith(saved[0]?.id);
    });
  });

  it("shows drafts as untitled automations and selects them", () => {
    mocks.draftIds = ["draft-1"];
    mocks.selection = { kind: "draft", draftId: "draft-1" };

    render(<AutomationsNav />);

    const draftButton = screen
      .getByText("Untitled automation")
      .closest("button");
    expect(draftButton).toBeTruthy();
    expect(draftButton!.getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Draft")).toBeTruthy();

    fireEvent.click(draftButton!);

    expect(mocks.selectDraft).toHaveBeenCalledWith("draft-1");
  });

  it("offers delete in the draft context menu", () => {
    mocks.draftIds = ["draft-1"];

    render(<AutomationsNav />);

    fireEvent.contextMenu(
      screen.getByText("Untitled automation").closest("button")!,
    );

    expect(mocks.selectDraft).toHaveBeenCalledWith("draft-1");
    expect(mocks.showContextMenu).toHaveBeenCalled();

    findContextMenuItem("delete-automation-draft-1")?.action();
    expect(mocks.removeDraft).toHaveBeenCalledWith("draft-1");
  });
});
