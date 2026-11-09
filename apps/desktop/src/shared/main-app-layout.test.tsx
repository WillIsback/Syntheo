import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  windowLabel: "main",
  openNew: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="outlet" />,
  useNavigate: () => vi.fn(),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({}),
}));

vi.mock("@syntheo/plugin-windows", () => ({
  events: {
    navigate: () => ({ listen: () => Promise.resolve(() => {}) }),
    openTab: () => ({ listen: () => Promise.resolve(() => {}) }),
  },
  getCurrentWebviewWindowLabel: () => mocks.windowLabel,
}));

vi.mock("./useNewNote", () => ({
  openNewNoteAndListen: vi.fn(),
  openSessionAndListen: vi.fn(),
  useNewNote: () => vi.fn(),
}));

vi.mock("@syntheo/ui/hooks/use-mount-effect", () => ({
  useMountEffect: vi.fn(),
}));

vi.mock("~/sidebar/toast/undo-delete-toast", () => ({
  UndoDeleteToast: () => null,
}));

vi.mock("~/store/zustand/tabs", () => ({
  isTabInputSupported: vi.fn(),
  useTabs: () => mocks.openNew,
}));

import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import MainAppLayout from "./main-app-layout";

import { useFolderSelection } from "~/folders/selection";

describe("MainAppLayout", () => {
  beforeEach(() => {
    mocks.windowLabel = "main";
  });

  afterEach(cleanup);

  it("mounts no cloud sync service in any window", () => {
    render(<MainAppLayout />);

    expect(screen.queryByTestId("meeting-import-sync")).toBeNull();
    expect(screen.queryByTestId("enterprise-capture-sync")).toBeNull();
    expect(screen.queryByTestId("workspace-invitation-toasts")).toBeNull();
  });

  // Issue 501 : une mention de dossier (note, chat) ouvre la page du dossier,
  // sous-dossier compris (le chemin contient des « / »).
  it("ouvre la page d'un dossier mentionné", () => {
    vi.mocked(useMountEffect).mockImplementationOnce((effect) => {
      effect();
    });
    render(<MainAppLayout />);

    const navigate = (
      window as unknown as { __SYNTHEO_NAVIGATE__: (path: string) => void }
    ).__SYNTHEO_NAVIGATE__;
    navigate("/app/folder/Clients/ACME");

    expect(useFolderSelection.getState().selectedPath).toBe("Clients/ACME");
    expect(mocks.openNew).toHaveBeenCalledWith({ type: "folders" });
  });
});
