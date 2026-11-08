import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SummarySwitcher, type SynthesisView } from "./summary-switcher";

const mocks = vi.hoisted(() => ({
  versions: [] as Array<{
    id: string;
    documentId: string;
    version: number;
    title: string;
    templateId: string;
    markdown: string;
    generatedAt: string | null;
    supersededAt: string;
  }>,
  generatedAt: "2026-11-08T14:32:00.000Z" as string | null,
  onRegenerate: vi.fn(() => Promise.resolve()),
  isGenerating: false,
  selectTemplate: vi.fn(),
  deleteEnhancedNote: vi.fn(() => Promise.resolve()),
}));

vi.mock("~/session/queries", () => ({
  deleteEnhancedNote: mocks.deleteEnhancedNote,
  useEnhancedNote: () => ({
    id: "summary-1",
    content: '{"type":"doc"}',
    generatedAt: mocks.generatedAt,
  }),
  useSummaryVersions: () => mocks.versions,
}));

vi.mock("~/session/components/note-input/enhanced-actions", () => ({
  useEnhancedNoteActions: () => ({
    isGenerating: mocks.isGenerating,
    isError: false,
    onRegenerate: mocks.onRegenerate,
  }),
}));

vi.mock("~/session/components/note-input/header-enhanced", () => ({
  useEnhancedViewTitle: (id: string) => ({
    viewTitle: id === "summary-2" ? "Point client" : "Summary",
    templateIcon: null,
  }),
  useSummaryTemplateSelection: () => mocks.selectTemplate,
}));

vi.mock("~/session/components/note-input/template-picker", () => ({
  TemplatePickerPopover: (props: {
    open?: boolean;
    trigger: React.ReactNode;
  }) => (
    <div data-testid="template-picker" data-open={String(props.open)}>
      {props.trigger}
    </div>
  ),
}));

function renderSwitcher(
  view: SynthesisView,
  overrides: Partial<Parameters<typeof SummarySwitcher>[0]> = {},
) {
  const onSelectView = vi.fn();
  const onSelectNote = vi.fn();
  render(
    <SummarySwitcher
      sessionId="session-1"
      enhancedNoteIds={["summary-1"]}
      currentNoteId="summary-1"
      onSelectNote={onSelectNote}
      view={view}
      onSelectView={onSelectView}
      {...overrides}
    />,
  );
  return { onSelectView, onSelectNote };
}

function openVersionsMenu() {
  fireEvent.keyDown(screen.getByRole("button", { name: "Summary versions" }), {
    key: "Enter",
  });
}

describe("SummarySwitcher", () => {
  beforeEach(() => {
    mocks.versions = [];
    mocks.generatedAt = "2026-11-08T14:32:00.000Z";
    mocks.isGenerating = false;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("switches between my notes and the summary", () => {
    const { onSelectView } = renderSwitcher({ kind: "summary" });

    const notes = screen.getByRole("button", { name: "My notes" });
    const summary = screen.getByRole("button", { name: "Summary · v1" });
    expect(notes.getAttribute("aria-pressed")).toBe("false");
    expect(summary.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(notes);
    expect(onSelectView).toHaveBeenCalledWith({ kind: "notes" });
  });

  it("numbers the current summary after its superseded versions", () => {
    mocks.versions = [
      {
        id: "version-2",
        documentId: "summary-1",
        version: 2,
        title: "Summary",
        templateId: "",
        markdown: "# V2",
        generatedAt: "2026-11-08T11:05:00.000Z",
        supersededAt: "2026-11-08T14:32:00.000Z",
      },
    ];
    renderSwitcher({ kind: "notes" });

    expect(
      screen
        .getByRole("button", { name: "Summary · v3" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: "My notes" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("lists versions with the current one first and opens an old one", () => {
    mocks.versions = [
      {
        id: "version-1",
        documentId: "summary-1",
        version: 1,
        title: "Summary",
        templateId: "",
        markdown: "# V1",
        generatedAt: "2026-11-08T09:00:00.000Z",
        supersededAt: "2026-11-08T14:32:00.000Z",
      },
    ];
    const { onSelectView } = renderSwitcher({ kind: "summary" });

    openVersionsMenu();

    const items = screen.getAllByRole("menuitemradio");
    expect(items[0].textContent).toContain("v2");
    expect(items[0].textContent).toContain("Current");
    expect(items[0].getAttribute("aria-checked")).toBe("true");
    expect(items[1].textContent).toContain("v1");
    expect(items[1].textContent).not.toContain("Current");

    fireEvent.click(items[1]);
    expect(onSelectView).toHaveBeenCalledWith({
      kind: "version",
      versionId: "version-1",
    });
  });

  it("shows the viewed old version in the selector", () => {
    mocks.versions = [
      {
        id: "version-1",
        documentId: "summary-1",
        version: 1,
        title: "Summary",
        templateId: "",
        markdown: "# V1",
        generatedAt: null,
        supersededAt: "2026-11-08T14:32:00.000Z",
      },
    ];
    renderSwitcher({ kind: "version", versionId: "version-1" });

    expect(screen.getByRole("button", { name: "Summary · v1" })).toBeTruthy();
  });

  it("keeps regenerating and switching summaries in the menu", () => {
    const { onSelectNote } = renderSwitcher(
      { kind: "summary" },
      { enhancedNoteIds: ["summary-1", "summary-2"] },
    );

    openVersionsMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Regenerate" }));
    expect(mocks.onRegenerate).toHaveBeenCalledWith(null);

    openVersionsMenu();
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: "Point client" }),
    );
    expect(onSelectNote).toHaveBeenCalledWith("summary-2");
  });

  it("opens the template picker from the menu", () => {
    renderSwitcher({ kind: "summary" });

    openVersionsMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Change template…" }));

    expect(
      screen.getByTestId("template-picker").getAttribute("data-open"),
    ).toBe("true");
  });

  it("renders nothing without a summary", () => {
    renderSwitcher(
      { kind: "notes" },
      { enhancedNoteIds: [], currentNoteId: null },
    );
    expect(screen.queryByRole("button", { name: "My notes" })).toBeNull();
  });
});
