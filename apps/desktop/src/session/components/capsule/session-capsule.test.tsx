import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionCapsule } from "./session-capsule";
import { startPreparedNoteFromShortcut } from "./start-shortcut";

import type { Tab } from "~/store/zustand/tabs";
import type { EditorView } from "~/store/zustand/tabs/schema";

const mocks = vi.hoisted(() => ({
  sessionMode: "inactive" as string,
  live: {
    sessionId: null as string | null,
    seconds: 0,
    elapsedOffsetSeconds: 0,
    amplitude: { mic: 0, speaker: 0 },
    muted: false,
    pause: null as {
      sessionId: string;
      elapsedSeconds: number;
      phase: "pausing" | "paused";
    } | null,
  },
  startListening: vi.fn(),
  stopListening: vi.fn(),
  pauseListening: vi.fn(),
  finishPausedListening: vi.fn(),
  generateSummary: vi.fn(),
  requestMainListenerControl: vi.fn(),
  isMainWebviewWindow: true,
  sendChatEvent: vi.fn(),
  leaveOverlayTab: vi.fn(),
  copyTextToClipboard: vi.fn(),
  rawMd: "",
  enhancedContent: undefined as string | undefined,
  enhancedNotes: [] as Array<{ id: string; content: string }>,
  enhancing: false,
  exportModal: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => "linux" }));

vi.mock("~/contexts/shell", () => ({
  useShell: () => ({
    chat: { mode: "FloatingClosed", sendEvent: mocks.sendChatEvent },
  }),
}));

vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({
      getSessionMode: () => mocks.sessionMode,
      stop: mocks.stopListening,
      pause: mocks.pauseListening,
      live: mocks.live,
    }),
}));

vi.mock("~/stt/pause-listening", () => ({
  finishPausedListening: mocks.finishPausedListening,
}));

vi.mock("~/session/hooks/useGenerateSummary", () => ({
  useGenerateSummary: () => ({
    generate: mocks.generateSummary,
    pending: false,
  }),
}));

vi.mock("~/stt/useStartListening", () => ({
  useStartListening: () => mocks.startListening,
}));

vi.mock("~/stt/window-control", () => ({
  isMainWebviewWindow: () => mocks.isMainWebviewWindow,
  requestMainListenerControl: mocks.requestMainListenerControl,
}));

vi.mock("~/shared/leave-overlay-tab", () => ({
  leaveOverlayTab: mocks.leaveOverlayTab,
}));

vi.mock("~/session/queries", () => ({
  useSession: () => ({ raw_md: mocks.rawMd }),
  useEnhancedNote: (id: string) =>
    id ? { content: mocks.enhancedContent } : undefined,
  useEnhancedNoteRecords: () => mocks.enhancedNotes,
}));

vi.mock("~/session/hooks/useEnhancedNotes", () => ({
  useIsSessionEnhancing: () => mocks.enhancing,
}));

vi.mock("~/session/components/note-input/header-shared", () => ({
  copyTextToClipboard: mocks.copyTextToClipboard,
  getStoredNoteMarkdown: (content: string | undefined) => content ?? "",
}));

vi.mock("~/session/components/outer-header/overflow/export-modal", () => ({
  ExportModal: (props: { open: boolean; currentView: EditorView }) => {
    mocks.exportModal(props);
    return props.open ? <div role="dialog">Export</div> : null;
  },
}));

const tab = {
  type: "sessions",
  id: "session-1",
  active: true,
  pinned: false,
  slotId: "slot-1",
  state: { view: null, autoStart: null },
} as Extract<Tab, { type: "sessions" }>;

function renderCapsule(
  props: Partial<React.ComponentProps<typeof SessionCapsule>> = {},
) {
  return render(
    <SessionCapsule
      tab={tab}
      stage="prepare"
      currentView={{ type: "raw" }}
      {...props}
    />,
  );
}

describe("SessionCapsule", () => {
  beforeEach(() => {
    mocks.sessionMode = "inactive";
    mocks.live = {
      sessionId: null,
      seconds: 0,
      elapsedOffsetSeconds: 0,
      amplitude: { mic: 0, speaker: 0 },
      muted: false,
      pause: null,
    };
    mocks.isMainWebviewWindow = true;
    mocks.rawMd = "";
    mocks.enhancedContent = undefined;
    mocks.enhancedNotes = [];
    mocks.enhancing = false;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("starts listening from the capsule", () => {
    renderCapsule();

    fireEvent.click(screen.getByRole("button", { name: /Begin listening/ }));

    expect(mocks.startListening).toHaveBeenCalledTimes(1);
  });

  it("starts listening on this note with Ctrl+Shift+N while preparing", () => {
    const view = renderCapsule();

    expect(startPreparedNoteFromShortcut()).toBe(true);
    expect(mocks.startListening).toHaveBeenCalledTimes(1);

    view.rerender(
      <SessionCapsule tab={tab} stage="listen" currentView={{ type: "raw" }} />,
    );
    expect(startPreparedNoteFromShortcut()).toBe(false);
  });

  it("leaves Ctrl+Shift+N to the global shortcut for inactive tabs", () => {
    renderCapsule({ tab: { ...tab, active: false } });

    expect(startPreparedNoteFromShortcut()).toBe(false);
  });

  it("goes back with Cancel", () => {
    renderCapsule();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mocks.leaveOverlayTab).toHaveBeenCalledTimes(1);
  });

  it("stops listening and shows the live timer", () => {
    mocks.sessionMode = "active";
    mocks.live = {
      sessionId: "session-1",
      seconds: 65,
      elapsedOffsetSeconds: 0,
      amplitude: { mic: 0.2, speaker: 0.1 },
      muted: false,
      pause: null,
    };
    renderCapsule({ stage: "listen" });

    expect(screen.getByRole("timer").textContent).toBe("01:05");
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));

    expect(mocks.stopListening).toHaveBeenCalledTimes(1);
  });

  // Issue 353 : pause, reprise et « Terminer » pendant la pause.
  it("pauses the listening and counts the time listened before a resume", () => {
    mocks.sessionMode = "active";
    mocks.live = {
      ...mocks.live,
      sessionId: "session-1",
      seconds: 5,
      elapsedOffsetSeconds: 60,
    };
    renderCapsule({ stage: "listen" });

    expect(screen.getByRole("timer").textContent).toBe("01:05");
    fireEvent.click(screen.getByRole("button", { name: "Pause listening" }));

    expect(mocks.pauseListening).toHaveBeenCalledTimes(1);
    expect(mocks.stopListening).not.toHaveBeenCalled();
  });

  it("resumes or finishes a paused listening", () => {
    mocks.live = {
      ...mocks.live,
      pause: { sessionId: "session-1", elapsedSeconds: 125, phase: "paused" },
    };
    renderCapsule({ stage: "listen" });

    expect(screen.getByRole("status").textContent).toBe("Paused");
    expect(screen.getByRole("timer").textContent).toBe("02:05");
    fireEvent.click(screen.getByRole("button", { name: "Resume listening" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));

    expect(mocks.startListening).toHaveBeenCalledTimes(1);
    expect(mocks.finishPausedListening).toHaveBeenCalledWith("session-1");
    expect(mocks.stopListening).not.toHaveBeenCalled();
  });

  it("delegates pause, resume and finish to the main window from standalone windows", () => {
    mocks.isMainWebviewWindow = false;
    mocks.sessionMode = "active";
    mocks.live = { ...mocks.live, sessionId: "session-1" };
    const view = renderCapsule({ stage: "listen", standaloneWindow: true });
    fireEvent.click(screen.getByRole("button", { name: "Pause listening" }));

    mocks.sessionMode = "inactive";
    mocks.live = {
      ...mocks.live,
      sessionId: null,
      pause: { sessionId: "session-1", elapsedSeconds: 3, phase: "paused" },
    };
    view.rerender(
      <SessionCapsule
        tab={tab}
        stage="listen"
        currentView={{ type: "raw" }}
        standaloneWindow
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Resume listening" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));

    expect(mocks.requestMainListenerControl.mock.calls).toEqual([
      ["pause", "session-1"],
      ["resume", "session-1"],
      ["finish", "session-1"],
    ]);
    expect(mocks.pauseListening).not.toHaveBeenCalled();
    expect(mocks.finishPausedListening).not.toHaveBeenCalled();
  });

  it("offers to resume or summarize a note left without a summary", () => {
    mocks.rawMd = "mes notes";
    renderCapsule({ stage: "synthesis" });

    fireEvent.click(screen.getByRole("button", { name: "Resume listening" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Generate the summary" }),
    );

    expect(mocks.startListening).toHaveBeenCalledTimes(1);
    expect(mocks.generateSummary).toHaveBeenCalledTimes(1);
  });

  // Le choix dépend de l'existence d'un compte rendu, pas de l'onglet affiché.
  it("keeps Ask the note on a note with a summary shown on its raw notes", () => {
    mocks.rawMd = "mes notes";
    mocks.enhancedNotes = [{ id: "note-1", content: "## Décisions" }];
    renderCapsule({ stage: "synthesis", currentView: { type: "raw" } });

    expect(
      screen.queryByRole("button", { name: "Generate the summary" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Resume listening" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: /Ask the note/ })).not.toBeNull();
  });

  it("offers to resume or summarize a transcribed note on its empty summary tab", () => {
    // Note transcrite sans compte rendu : la vue affichée est l'onglet du
    // compte rendu par défaut, encore vide, et aucune ligne n'est enregistrée.
    renderCapsule({
      stage: "synthesis",
      currentView: { type: "enhanced", id: "summary-session-1" },
    });

    expect(
      screen.getByRole("button", { name: "Generate the summary" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Resume listening" }),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Ask the note/ })).toBeNull();
  });

  it("does not count an empty summary document as a summary", () => {
    mocks.enhancedNotes = [{ id: "note-1", content: "" }];
    renderCapsule({ stage: "synthesis", currentView: { type: "raw" } });

    expect(
      screen.getByRole("button", { name: "Generate the summary" }),
    ).not.toBeNull();
  });

  it("does not offer to generate a summary while one is being written", () => {
    mocks.enhancing = true;
    renderCapsule({ stage: "synthesis", currentView: { type: "raw" } });

    expect(
      screen.queryByRole("button", { name: "Generate the summary" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: /Ask the note/ })).not.toBeNull();
  });

  it("delegates start and stop to the main window from standalone windows", () => {
    mocks.isMainWebviewWindow = false;
    const view = renderCapsule({ standaloneWindow: true });

    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Begin listening/ }));
    expect(mocks.requestMainListenerControl).toHaveBeenCalledWith(
      "start",
      "session-1",
    );

    view.rerender(
      <SessionCapsule
        tab={tab}
        stage="listen"
        currentView={{ type: "raw" }}
        standaloneWindow
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(mocks.requestMainListenerControl).toHaveBeenCalledWith(
      "stop",
      "session-1",
    );
    expect(mocks.startListening).not.toHaveBeenCalled();
    expect(mocks.stopListening).not.toHaveBeenCalled();
  });

  it("asks the note through the existing chat", () => {
    mocks.enhancedNotes = [{ id: "note-1", content: "## Décisions" }];
    renderCapsule({
      stage: "synthesis",
      currentView: { type: "enhanced", id: "note-1" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Ask the note/ }));

    expect(mocks.sendChatEvent).toHaveBeenCalledWith({ type: "OPEN" });
  });

  it("copies the summary shown in the document", () => {
    mocks.enhancedContent = "## Décisions";
    mocks.rawMd = "mes notes";
    renderCapsule({
      stage: "synthesis",
      currentView: { type: "enhanced", id: "note-1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(mocks.copyTextToClipboard).toHaveBeenCalledWith(
      "## Décisions",
      expect.any(Object),
    );
  });

  it("disables Copy when the note is empty", () => {
    renderCapsule({ stage: "synthesis" });

    expect(
      (screen.getByRole("button", { name: "Copy" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("opens the existing export dialog", async () => {
    renderCapsule({
      stage: "synthesis",
      currentView: { type: "enhanced", id: "note-1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(await screen.findByRole("dialog")).not.toBeNull();
    expect(mocks.exportModal).toHaveBeenLastCalledWith(
      expect.objectContaining({
        currentView: { type: "enhanced", id: "note-1" },
        open: true,
      }),
    );
  });
});
