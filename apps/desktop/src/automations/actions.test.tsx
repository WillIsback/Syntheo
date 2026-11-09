import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearSelection: vi.fn(),
  selectWorkflow: vi.fn(),
  deleteChatGroup: vi.fn(() => Promise.resolve()),
  setSettingValues: vi.fn(() => Promise.resolve()),
  setSettingValue: vi.fn((..._args: unknown[]) => Promise.resolve()),
  storedValues: {} as Record<string, string>,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("./selection", () => ({
  useAutomationSelection: (selector: (state: unknown) => unknown) =>
    selector({
      clearSelection: mocks.clearSelection,
      selectWorkflow: mocks.selectWorkflow,
    }),
}));

vi.mock("~/chat/store/queries", () => ({
  deleteChatGroup: mocks.deleteChatGroup,
}));

vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: () =>
    Promise.resolve({
      values: mocks.storedValues,
      hasValues: new Set(Object.keys(mocks.storedValues)),
    }),
  setSettingValues: mocks.setSettingValues,
  setSettingValue: mocks.setSettingValue,
}));

vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

import {
  useCreateWorkflowFromTemplate,
  useDeleteChatAutomation,
} from "./actions";
import { AUTOMATION_TEMPLATES } from "./templates";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useCreateWorkflowFromTemplate", () => {
  beforeEach(() => {
    mocks.selectWorkflow.mockClear();
    mocks.setSettingValue.mockClear();
    mocks.storedValues = { automation_workflows: "[]" };
  });

  it("creates an ordinary workflow from the Markdown template and opens it", async () => {
    const { result } = renderHook(() => useCreateWorkflowFromTemplate(), {
      wrapper,
    });
    result.current.mutate(AUTOMATION_TEMPLATES[0]!);

    await waitFor(() => {
      expect(mocks.selectWorkflow).toHaveBeenCalled();
    });
    const saved = JSON.parse(
      mocks.setSettingValue.mock.calls.find(
        (call) => (call as unknown[])[0] === "automation_workflows",
      )![1] as string,
    );
    expect(saved).toEqual([
      expect.objectContaining({
        title: "Export as Markdown",
        templateId: "markdown-export",
        enabled: false,
        trigger: "meeting_completed",
        steps: [expect.objectContaining({ type: "markdown_export" })],
      }),
    ]);
    expect(mocks.selectWorkflow).toHaveBeenCalledWith(saved[0].id);
  });
});

describe("useDeleteChatAutomation", () => {
  beforeEach(() => {
    mocks.clearSelection.mockClear();
    mocks.deleteChatGroup.mockClear();
    mocks.toastError.mockClear();
    mocks.toastSuccess.mockClear();
  });

  it("deletes the chat group and clears the selection", async () => {
    const { result } = renderHook(() => useDeleteChatAutomation(), { wrapper });
    result.current.mutate("group-1");

    await waitFor(() => {
      expect(mocks.deleteChatGroup).toHaveBeenCalledWith("group-1");
    });
    expect(mocks.clearSelection).toHaveBeenCalledWith({
      kind: "chat",
      groupId: "group-1",
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Automation deleted");
  });
});
