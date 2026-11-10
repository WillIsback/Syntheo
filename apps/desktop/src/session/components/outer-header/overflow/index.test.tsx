import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OverflowButton } from "./index";

import { openFloatingMeetingPanel } from "~/meeting-float/host";
import type { EditorView } from "~/store/zustand/tabs/schema";

const {
  uploadAudioMock,
  uploadTranscriptMock,
  audioImportAvailability,
  currentNoteContent,
  useHasTranscriptMock,
  useListenerMock,
  useConfigValueMock,
  platformMock,
  windowShowMock,
} = vi.hoisted(() => ({
  uploadAudioMock: vi.fn(),
  uploadTranscriptMock: vi.fn(),
  audioImportAvailability: {
    value: { status: "ready" } as { status: "ready" | "unsupported" },
  },
  currentNoteContent: { value: "" },
  useHasTranscriptMock: vi.fn(),
  useListenerMock: vi.fn(),
  useConfigValueMock: vi.fn(),
  platformMock: vi.fn(() => "macos"),
  windowShowMock: vi.fn(() => Promise.resolve({ status: "ok", data: null })),
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: platformMock,
}));

vi.mock("@syntheo/ui/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@syntheo/ui/components/ui/dropdown-menu", () => ({
  appFloatingMenuPanelClassName: "overflow-hidden p-1.5",
  AppFloatingPanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  DropdownMenuPortal: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubTrigger: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
      <span aria-hidden>›</span>
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

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

vi.mock("./always-on-top", () => ({
  AlwaysOnTop: () => <button type="button">Always on Top</button>,
}));

vi.mock("./delete", () => ({
  DeleteNote: () => <button type="button">Delete note</button>,
}));

vi.mock("./lock-note", () => ({
  LockNote: () => <button type="button">Lock Note</button>,
}));

vi.mock("../metadata", () => ({
  MetadataPanelContent: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="meeting-info-popover">{sessionId}</div>
  ),
}));

vi.mock("~/session/components/version-history-dialog", () => ({
  VersionHistoryDialog: () => null,
}));

vi.mock("~/meeting-float/host", () => ({
  openFloatingMeetingPanel: vi.fn(),
}));

vi.mock("@syntheo/plugin-windows", () => ({
  commands: {
    windowShow: windowShowMock,
  },
}));

vi.mock("~/session/components/shared", () => ({
  useCurrentNoteHasContent: () => currentNoteContent.value.trim().length > 0,
  useHasTranscript: useHasTranscriptMock,
}));

vi.mock("~/shared/config", () => ({
  useConfigValue: useConfigValueMock,
}));

vi.mock("~/stt/contexts", () => ({
  useListener: useListenerMock,
}));

vi.mock("~/stt/useUploadFile", () => ({
  useUploadFile: vi.fn(() => ({
    audioImportAvailability: audioImportAvailability.value,
    uploadAudio: uploadAudioMock,
    uploadTranscript: uploadTranscriptMock,
  })),
}));

type Scenario = {
  transcript?: boolean;
  content?: string;
  mode?: string;
  floatingPanel?: boolean;
  platform?: string;
};

const ACTIONS = [
  "Upload audio",
  "Upload transcript",
  "Open floating panel",
  "Open in New Window",
  "Delete note",
] as const;

// Entrées toujours présentes, quel que soit l'état de la note.
const PERMANENT = [
  "Meeting info",
  "Version history",
  "Always on Top",
  "Lock Note",
  "Delete note",
] as const;

function arrange({
  transcript = true,
  content = "",
  mode = "inactive",
  floatingPanel = false,
  platform = "macos",
}: Scenario) {
  useHasTranscriptMock.mockReturnValue(transcript);
  currentNoteContent.value = content;
  useConfigValueMock.mockReturnValue(floatingPanel);
  platformMock.mockReturnValue(platform);
  useListenerMock.mockImplementation((selector) =>
    selector({ getSessionMode: () => mode, stop: vi.fn() }),
  );
}

function renderOverflow(
  props: Partial<React.ComponentProps<typeof OverflowButton>> = {},
) {
  return render(
    <OverflowButton
      sessionId="session-1"
      currentView={{ type: "enhanced", id: "note-1" } as EditorView}
      {...props}
    />,
  );
}

function visibleActions() {
  return ACTIONS.filter((name) => screen.queryByRole("button", { name }));
}

// Lit le menu dans l'ordre : « — » pour un séparateur, sinon le libellé.
function menuOutline(container: HTMLElement) {
  return [...container.querySelectorAll("button, hr")]
    .filter((el) => el.getAttribute("aria-label") !== "More")
    .map((el) =>
      el.tagName === "HR" ? "—" : (el.textContent ?? "").replace("›", ""),
    );
}

function expectTidySeparators(outline: string[]) {
  expect(outline[0]).not.toBe("—");
  expect(outline[outline.length - 1]).not.toBe("—");
  outline.forEach((entry, index) => {
    if (entry === "—") expect(outline[index + 1]).not.toBe("—");
  });
}

describe("OverflowButton", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    arrange({});
  });

  it.each<
    [
      string,
      Scenario,
      Partial<React.ComponentProps<typeof OverflowButton>>,
      string[],
    ]
  >([
    [
      "empty note without a recording",
      { transcript: false },
      {},
      [
        "Upload audio",
        "Upload transcript",
        "Open in New Window",
        "Delete note",
      ],
    ],
    [
      "note with content",
      { transcript: false, content: "Existing content" },
      {},
      ["Open in New Window", "Delete note"],
    ],
    [
      "transcript without a recording",
      {},
      {},
      ["Open in New Window", "Delete note"],
    ],
    [
      "active listening",
      { transcript: false, mode: "active", floatingPanel: true },
      {},
      ["Open floating panel", "Open in New Window", "Delete note"],
    ],
    [
      "finalizing",
      { mode: "finalizing", floatingPanel: true },
      {},
      ["Open in New Window", "Delete note"],
    ],
    [
      "batch transcription",
      { mode: "running_batch" },
      {},
      ["Open in New Window", "Delete note"],
    ],
    ["standalone window", {}, { standaloneWindow: true }, ["Delete note"]],
  ])("offers the right actions for %s", (_label, scenario, props, expected) => {
    arrange(scenario);
    const { container } = renderOverflow(props);

    expect(visibleActions()).toEqual(expected);
    for (const name of PERMANENT) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expectTidySeparators(menuOutline(container));
  });

  // La capsule porte déjà l'écoute et l'export (Ctrl+P compris) : le menu
  // « Plus » ne les répète plus (issue 458).
  it.each<[string, Scenario]>([
    ["an empty note", { transcript: false }],
    ["a transcript", {}],
    ["active listening", { mode: "active", floatingPanel: true }],
  ])("leaves listening and export to the capsule for %s", (_l, scenario) => {
    arrange(scenario);
    renderOverflow();

    expect(screen.queryByRole("button", { name: /listening/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /export/i })).toBeNull();
  });

  it("groups the remaining entries between single separators", () => {
    arrange({ transcript: false });
    automationMocks.workflows = [READY_WORKFLOW];
    const { container } = renderOverflow();

    expect(menuOutline(container)).toEqual([
      "Meeting info",
      "Version history",
      "—",
      "Upload audio",
      "Upload transcript",
      "—",
      expect.stringContaining("Weekly recap"),
      "—",
      "Open in New Window",
      "Always on Top",
      "—",
      "Lock Note",
      "Delete note",
    ]);
    automationMocks.workflows = [];
  });

  it("uploads audio and transcripts into an empty note", () => {
    arrange({ transcript: false });
    renderOverflow();

    fireEvent.click(screen.getByRole("button", { name: "Upload audio" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload transcript" }));

    expect(uploadAudioMock).toHaveBeenCalledTimes(1);
    expect(uploadTranscriptMock).toHaveBeenCalledTimes(1);
  });

  it("greys out audio upload with an explanation for a model that can't transcribe a file", () => {
    audioImportAvailability.value = { status: "unsupported" };
    arrange({ transcript: false });
    renderOverflow();

    const upload = screen.getByRole("button", { name: "Upload audio" });
    expect(upload.getAttribute("aria-disabled")).toBe("true");
    expect(upload.getAttribute("title")).toBe(
      "This model can't transcribe a file. Choose another transcription model.",
    );

    // Toujours cliquable : le clic affiche l'explication et le lien réglages.
    fireEvent.click(upload);
    expect(uploadAudioMock).toHaveBeenCalledTimes(1);
    audioImportAvailability.value = { status: "ready" };
  });

  it.each(["macos", "linux"])(
    "opens the floating panel while actively listening on %s",
    (platform) => {
      arrange({ mode: "active", floatingPanel: true, platform });
      renderOverflow();

      fireEvent.click(
        screen.getByRole("button", { name: "Open floating panel" }),
      );

      expect(openFloatingMeetingPanel).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "session-1", enabled: true }),
      );
    },
  );

  it("opens the current note in a standalone window", () => {
    renderOverflow();

    fireEvent.click(screen.getByRole("button", { name: "Open in New Window" }));

    expect(windowShowMock).toHaveBeenCalledWith({
      type: "note",
      value: "session-1",
    });
  });

  it("runs a ready automation on this note from the ⋯ menu", () => {
    automationMocks.workflows = [READY_WORKFLOW];

    renderOverflow();

    expect(screen.getByText("Run an automation")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Weekly recap/ }));

    expect(automationMocks.runWorkflowOnNote).toHaveBeenCalledWith(
      "wf-hand",
      "session-1",
    );
    automationMocks.workflows = [];
  });

  it("hides the automation group while nothing is ready", () => {
    automationMocks.workflows = [{ ...READY_WORKFLOW, steps: [] }];

    renderOverflow();

    expect(screen.queryByText("Run an automation")).toBeNull();
    automationMocks.workflows = [];
  });
});
