import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "zustand";
import { useShallow } from "zustand/shallow";

import { SessionCapsule } from "./session-capsule";

import { createListenerStore } from "~/store/zustand/listener";
import type { Tab } from "~/store/zustand/tabs";

// Vrai magasin de l'écoute : la capsule lit la progression là où l'import
// l'écrit (issue 526).
const hoisted = vi.hoisted(() => ({
  store: null as unknown as ReturnType<
    typeof import("~/store/zustand/listener").createListenerStore
  >,
  stopTranscription: vi.fn(async () => {}),
  startListening: vi.fn(),
  generateSummary: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => "linux" }));

vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock("~/contexts/shell", () => ({
  useShell: () => ({ chat: { mode: "FloatingClosed", sendEvent: vi.fn() } }),
}));

vi.mock("~/stt/contexts", () => ({
  useListener: <T,>(selector: (state: unknown) => T) =>
    useStore(hoisted.store, useShallow(selector as never)) as T,
}));

vi.mock("~/session/hooks/useGenerateSummary", () => ({
  useGenerateSummary: () => ({
    generate: hoisted.generateSummary,
    pending: false,
  }),
}));

vi.mock("~/stt/useStartListening", () => ({
  useStartListening: () => hoisted.startListening,
}));

vi.mock("~/automations/workflows", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/automations/workflows")>()),
  useAutomationWorkflows: () => [],
}));

vi.mock("~/session/queries", () => ({
  useSession: () => ({ raw_md: "mes notes" }),
  useEnhancedNote: () => undefined,
  useEnhancedNoteRecords: () => [],
}));

vi.mock("~/session/hooks/useEnhancedNotes", () => ({
  useIsSessionEnhancing: () => false,
}));

vi.mock("~/session/components/outer-header/overflow/export-modal", () => ({
  ExportModal: () => null,
}));

const SESSION = "session-1";
const tab = {
  type: "sessions",
  id: SESSION,
  active: true,
  pinned: false,
  slotId: "slot-1",
  state: { view: null, autoStart: null },
} as Extract<Tab, { type: "sessions" }>;

function renderCapsule() {
  return render(
    <SessionCapsule
      tab={tab}
      stage="synthesis"
      currentView={{ type: "raw" }}
    />,
  );
}

describe("SessionCapsule pendant un import", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(0);
    hoisted.store = createListenerStore();
    hoisted.store.setState({ stopTranscription: hoisted.stopTranscription });
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function startImport(audioSeconds: number | null) {
    act(() => {
      hoisted.store.getState().handleImportStarted(SESSION, audioSeconds);
      hoisted.store.getState().handleBatchStarted(SESSION, "importing");
    });
  }

  function startTranscription() {
    act(() => {
      hoisted.store.getState().clearBatchSession(SESSION);
      hoisted.store.getState().handleBatchStarted(SESSION);
    });
  }

  it("replaces Resume listening and Generate the summary with the progress", () => {
    renderCapsule();
    expect(
      screen.getByRole("button", { name: "Resume listening" }),
    ).toBeTruthy();

    startImport(600);

    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Resume listening" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Generate the summary" }),
    ).toBeNull();
    // Copie du fichier : pas encore d'arrêt possible.
    expect(
      (screen.getByRole("button", { name: "Stop" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("estimates the remaining time and the speed once reliable", () => {
    renderCapsule();
    startImport(600);
    startTranscription();

    expect(screen.getByText("estimating…")).toBeTruthy();

    act(() => {
      hoisted.store.getState().updateBatchProgress(SESSION, 0.2);
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "20",
    );
    expect(screen.getByText("~4 min left · ×2.0")).toBeTruthy();
  });

  it("stops the transcription like the Transcript tab", () => {
    renderCapsule();
    startImport(600);
    startTranscription();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(hoisted.stopTranscription).toHaveBeenCalledWith(SESSION);
  });

  it("returns to its normal state when the import ends", () => {
    renderCapsule();
    startImport(600);
    startTranscription();

    act(() => {
      hoisted.store.getState().handleBatchStopped(SESSION);
      hoisted.store.getState().handleImportEnded(SESSION);
    });

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Resume listening" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Generate the summary" }),
    ).toBeTruthy();
  });
});
