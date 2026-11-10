import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NoteInput } from ".";

import type { LivingDocumentProps } from "~/session/components/living-document";
import type { EditorView } from "~/store/zustand/tabs/schema";

const hoisted = vi.hoisted(() => ({
  editorTabs: [{ type: "raw" }, { type: "transcript" }] as EditorView[],
  hotkeys: [] as Array<{ keys: string; callback: () => void }>,
  hasProseMirror: true,
  focusAtTrailingEmptyLine: vi.fn(),
  livingDocumentProps: [] as LivingDocumentProps[],
  onBeforeTabChange: vi.fn(),
  registerCanonicalSessionEditor: vi.fn(),
  searchVisible: false,
  unregisterCanonicalSessionEditor: vi.fn(),
}));

// Le document vivant est remplacé par un double qui expose ses props : un
// éditeur (ProseMirror ou contrôles seuls) dans le conteneur cliquable.
vi.mock("~/session/components/living-document", () => ({
  LivingDocument: (props: LivingDocumentProps) => {
    hoisted.livingDocumentProps.push(props);
    return (
      <div data-testid="document" onMouseDown={props.onContainerMouseDown}>
        <button type="button">Retry summary</button>
        {hoisted.hasProseMirror ? (
          <div className="ProseMirror" data-testid="mock-prosemirror" />
        ) : null}
      </div>
    );
  },
}));

vi.mock("./search/bar", () => ({
  SearchBar: () => <div data-testid="search-bar" />,
}));

vi.mock("./search/context", () => ({
  useSearch: () =>
    hoisted.searchVisible
      ? {
          isVisible: true,
          close: vi.fn(),
        }
      : null,
}));

vi.mock("~/session/editor-activity", () => ({
  registerCanonicalSessionEditor: hoisted.registerCanonicalSessionEditor,
  unregisterCanonicalSessionEditor: hoisted.unregisterCanonicalSessionEditor,
}));

vi.mock("~/shared/hooks/useScrollPreservation", () => ({
  useScrollPreservation: () => ({
    onBeforeTabChange: hoisted.onBeforeTabChange,
    scrollRef: { current: null },
  }),
}));

vi.mock("react-hotkeys-hook", () => ({
  useHotkeys: (keys: string, callback: () => void) => {
    hoisted.hotkeys.push({ keys, callback });
  },
}));

function lastDocumentProps() {
  return hoisted.livingDocumentProps[hoisted.livingDocumentProps.length - 1]!;
}

// Monte un éditeur factice dans la ref transmise au document vivant.
function mountEditor() {
  (lastDocumentProps().editorRef as { current: unknown }).current = {
    view: null,
    flushPendingChanges: () => {},
    commands: { focusAtTrailingEmptyLine: hoisted.focusAtTrailingEmptyLine },
  };
}

function renderNoteInput({
  currentTab = { type: "raw" },
  handleTabChange = vi.fn(),
  transcriptEditMode = false,
}: {
  currentTab?: EditorView;
  handleTabChange?: (view: EditorView) => void;
  transcriptEditMode?: boolean;
} = {}) {
  return {
    handleTabChange,
    ...render(
      <NoteInput
        tab={{
          active: true,
          id: "session-1",
          pinned: false,
          slotId: "slot-1",
          state: { autoStart: null, view: currentTab },
          type: "sessions",
        }}
        rawMd="stored memo"
        sessionTitle="Stored title"
        editorTabs={hoisted.editorTabs}
        currentTab={currentTab}
        handleTabChange={handleTabChange}
        sessionMode="inactive"
        stage="synthesis"
        transcriptEditMode={transcriptEditMode}
      />,
    ),
  };
}

describe("NoteInput", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    hoisted.editorTabs = [{ type: "raw" }, { type: "transcript" }];
    hoisted.hotkeys = [];
    hoisted.hasProseMirror = true;
    hoisted.focusAtTrailingEmptyLine.mockClear();
    hoisted.livingDocumentProps = [];
    hoisted.onBeforeTabChange.mockClear();
    hoisted.registerCanonicalSessionEditor.mockClear();
    hoisted.searchVisible = false;
    hoisted.unregisterCanonicalSessionEditor.mockClear();
  });

  it("leaves the selected view to the parent tab state", () => {
    const { handleTabChange } = renderNoteInput();

    lastDocumentProps().onSelectView({ type: "transcript" });
    expect(handleTabChange).toHaveBeenCalledWith({ type: "transcript" });
    expect(lastDocumentProps().currentTab).toEqual({ type: "raw" });

    // La vue déjà affichée ne repasse pas par le parent.
    lastDocumentProps().onSelectView({ type: "raw" });
    expect(handleTabChange).toHaveBeenCalledOnce();
  });

  it.each([
    ["mod+pagedown", { type: "transcript" }],
    ["mod+pageup", { type: "enhanced", id: "summary-1" }],
  ])("switches note views with %s", (keys, expected) => {
    hoisted.editorTabs = [
      { type: "enhanced", id: "summary-1" },
      { type: "raw" },
      { type: "transcript" },
    ];
    const { handleTabChange } = renderNoteInput();

    hoisted.hotkeys
      .find((hotkey) =>
        hotkey.keys
          .split(",")
          .map((key) => key.trim())
          .includes(keys),
      )
      ?.callback();

    expect(handleTabChange).toHaveBeenCalledWith(expected);
    expect(hoisted.onBeforeTabChange).toHaveBeenCalledOnce();
  });

  // Ctrl+Alt+←/→ fait pivoter l'écran avec certains pilotes Intel (issue 397).
  it("no longer binds Ctrl+Alt+arrows to note views", () => {
    renderNoteInput();

    const boundKeys = hoisted.hotkeys.flatMap((hotkey) =>
      hotkey.keys.split(",").map((key) => key.trim()),
    );

    expect(boundKeys).toEqual(
      expect.arrayContaining(["mod+pageup", "mod+pagedown"]),
    );
    expect(boundKeys).not.toContain("mod+alt+left");
    expect(boundKeys).not.toContain("mod+alt+right");
  });

  it("passes the parent-selected view and hydrated content to the document", () => {
    const currentTab = { type: "transcript" } satisfies EditorView;
    renderNoteInput({ currentTab, transcriptEditMode: true });

    expect(lastDocumentProps()).toMatchObject({
      currentTab,
      rawMd: "stored memo",
      sessionTitle: "Stored title",
      stage: "synthesis",
      transcriptEditMode: true,
    });
  });

  it("tracks the mounted editor until its view is disposed", () => {
    renderNoteInput();
    const view = { hasFocus: () => true } as never;

    lastDocumentProps().onViewReady(view);
    expect(hoisted.registerCanonicalSessionEditor).toHaveBeenCalledWith(
      "session-1",
      view,
      expect.any(Function),
    );

    lastDocumentProps().onViewDisposed(view);
    expect(hoisted.unregisterCanonicalSessionEditor).toHaveBeenCalledWith(
      "session-1",
      view,
    );
  });

  it("focuses the trailing body line when blank editor space is clicked", () => {
    renderNoteInput();
    mountEditor();

    fireEvent.mouseDown(screen.getByTestId("document"), { button: 0 });

    expect(hoisted.focusAtTrailingEmptyLine).toHaveBeenCalledTimes(1);
  });

  it("lets ProseMirror handle clicks inside the document", () => {
    renderNoteInput();
    mountEditor();

    fireEvent.mouseDown(screen.getByTestId("mock-prosemirror"), { button: 0 });

    expect(hoisted.focusAtTrailingEmptyLine).not.toHaveBeenCalled();
  });

  it("preserves controls when the summary has no editor", () => {
    hoisted.hasProseMirror = false;
    renderNoteInput();
    mountEditor();

    const wasNotCancelled = fireEvent.mouseDown(
      screen.getByRole("button", { name: "Retry summary" }),
      { button: 0 },
    );

    expect(wasNotCancelled).toBe(true);
    expect(hoisted.focusAtTrailingEmptyLine).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "shows the transcript search bar only when find is open (%s)",
    (searchVisible) => {
      hoisted.searchVisible = searchVisible;

      renderNoteInput({ currentTab: { type: "transcript" } });

      expect(screen.queryByTestId("search-bar") !== null).toBe(searchVisible);
    },
  );
});
