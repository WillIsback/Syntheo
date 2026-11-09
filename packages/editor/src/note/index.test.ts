// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { redo, undo } from "prosemirror-history";
import { Node as PMNode } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { type ComponentProps, createElement, createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JSONContent, NoteEditorRef } from "./index";
import {
  createReadOnlyPlugin,
  getEditorCompositionWaitMs,
  NoteEditor,
  shouldReplaceEditorContent,
} from "./index";
import { schema } from "./schema";

const paragraphDoc = (text: string): JSONContent => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const titledDoc = (title: string, text: string): JSONContent => ({
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: title }],
    },
    { type: "paragraph", content: [{ type: "text", text }] },
  ],
});

const baseDoc = paragraphDoc("old");
const nextDoc = paragraphDoc("new");

type EditorProps = Omit<ComponentProps<typeof NoteEditor>, "ref">;

// Rend l'éditeur avec une ref ; `rerender` garde les props de départ.
function renderEditor(props: Partial<EditorProps> = {}) {
  const ref = createRef<NoteEditorRef>();
  const base = {
    initialContent: baseDoc,
    enforceTitleHeading: false,
    ...props,
  } as EditorProps;
  const rendered = render(createElement(NoteEditor, { ...base, ref }));
  return {
    ref,
    rendered,
    get view() {
      return ref.current!.view!;
    },
    ready: () => waitFor(() => expect(ref.current?.view).not.toBeNull()),
    rerender: (next: Partial<EditorProps>) =>
      rendered.rerender(
        createElement(NoteEditor, { ...base, ...next, ref } as EditorProps),
      ),
  };
}

// Rend l'éditeur et attend sa vue.
async function renderReadyEditor(props: Partial<EditorProps> = {}) {
  const editor = renderEditor(props);
  await editor.ready();
  return editor;
}

const insertText = (view: EditorView, text: string, pos = 4) =>
  act(() => {
    view.dispatch(view.state.tr.insertText(text, pos));
  });
const select = (view: EditorView, from: number, to?: number) =>
  act(() => {
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, from, to),
      ),
    );
  });
const expectUndo = (view: EditorView, command = undo) =>
  act(() => {
    expect(command(view.state, view.dispatch)).toBe(true);
  });
const mockCoords = (view: EditorView) =>
  vi.spyOn(view, "coordsAtPos").mockReturnValue({
    bottom: 20,
    left: 0,
    right: 40,
    top: 0,
  });
const advance = (ms = 500) => act(() => vi.advanceTimersByTimeAsync(ms));
const waitSettle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("shouldReplaceEditorContent", () => {
  it.each([
    { composing: true, expected: false },
    { composing: false, expected: true },
  ])(
    "replaces focused content only outside IME composition (composing: $composing)",
    ({ composing, expected }) => {
      expect(
        shouldReplaceEditorContent({
          currentContent: baseDoc,
          nextContent: nextDoc,
          hasFocus: true,
          isComposing: composing,
          syncContentWhenFocused: true,
        }),
      ).toBe(expected);
    },
  );
});

describe("getEditorCompositionWaitMs", () => {
  it.each([
    {
      name: "waits through active IME composition",
      active: true,
      endedAt: 0,
      expected: 500,
    },
    {
      name: "returns the remaining post-composition grace window",
      active: false,
      endedAt: 600,
      expected: 100,
    },
    {
      name: "returns zero after the post-composition grace window",
      active: false,
      endedAt: 499,
      expected: 0,
    },
    {
      name: "returns zero for a reset inactive composition state",
      active: false,
      endedAt: 0,
      expected: 0,
    },
  ])("$name", ({ active, endedAt, expected }) => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    expect(
      getEditorCompositionWaitMs({ composing: false }, { active, endedAt }),
    ).toBe(expected);
  });
});

describe("createReadOnlyPlugin", () => {
  it("rejects document changes while allowing selection changes", () => {
    const state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("shared")]),
      ]),
      plugins: [createReadOnlyPlugin()],
    });

    expect(
      state.applyTransaction(state.tr.insertText("blocked")).transactions,
    ).toHaveLength(0);

    const selection = TextSelection.create(state.doc, 2);
    expect(
      state.applyTransaction(state.tr.setSelection(selection)).transactions,
    ).toHaveLength(1);
  });

  it("wires the editor surface to reject document changes", async () => {
    const handleChange = vi.fn();
    const { rendered, view } = await renderReadyEditor({
      initialContent: paragraphDoc("shared"),
      enforceTitleHeading: undefined,
      handleChange,
      readOnly: true,
    });

    const surface = rendered.getByRole("document");
    expect(surface.getAttribute("contenteditable")).toBe("false");
    expect(surface.getAttribute("aria-readonly")).toBe("true");

    insertText(view, "blocked", 2);

    expect(view.state.doc.textContent).toBe("shared");
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("shows a comment-only selection toolbar in read-only documents", async () => {
    const onCommentSelection = vi.fn();
    const { view } = await renderReadyEditor({
      initialContent: paragraphDoc("shared"),
      enforceTitleHeading: undefined,
      onCommentSelection,
      readOnly: true,
    });
    mockCoords(view);
    select(view, 1, 4);

    const commentButton = await screen.findByRole("button", {
      name: "Comment",
    });
    expect(screen.getByRole("toolbar").querySelectorAll("button")).toHaveLength(
      1,
    );
    fireEvent.click(commentButton);

    expect(onCommentSelection).toHaveBeenCalledOnce();
  });

  it("hides the format toolbar during IME composition", async () => {
    const { view } = await renderReadyEditor({
      initialContent: titledDoc("t", "compose"),
      enforceTitleHeading: undefined,
    });
    mockCoords(view);
    const noToolbar = () => expect(screen.queryByRole("toolbar")).toBeNull();

    // An IME makes the DOM selection cover the composing text; the state
    // selection follows it, but that range is not a user selection.
    fireEvent.compositionStart(view.dom);
    select(view, 5, 9);
    noToolbar();

    // The composition ends and an unrelated transaction arrives before
    // ProseMirror applies the final caret; keeping the provisional range
    // means it must not release the gate.
    fireEvent.compositionEnd(view.dom);
    act(() => {
      view.dispatch(view.state.tr.setMeta("meta-only", true));
    });
    noToolbar();

    // The settle update collapses the selection to a caret, so the gate
    // releases but the toolbar still has no real selection to show for.
    select(view, 6);
    noToolbar();

    // A real selection after composition still opens the toolbar.
    select(view, 5, 9);
    await screen.findByRole("toolbar");

    // If the settle leaves the provisional range in place and no selection
    // change ever arrives, the gate still must not hold forever: after
    // ProseMirror's settle window the same range counts as a real
    // selection. Return to a caret first so the stale jsdom DOM selection
    // cannot reconcile the previous range into a deletion.
    select(view, 6);
    fireEvent.compositionStart(view.dom);
    select(view, 5, 9);
    fireEvent.compositionEnd(view.dom);
    noToolbar();
    await waitSettle();
    await screen.findByRole("toolbar");

    // A composition that starts inside the settle window must not be
    // released by the previous composition's pending timer.
    select(view, 6);
    fireEvent.compositionStart(view.dom);
    fireEvent.compositionEnd(view.dom);
    fireEvent.compositionStart(view.dom);
    select(view, 5, 9);
    await waitSettle();
    noToolbar();

    fireEvent.compositionEnd(view.dom);
    await waitSettle();
    await screen.findByRole("toolbar");
  });

  it("hides attachment mutation controls in read-only documents", async () => {
    const { rendered } = renderEditor({
      initialContent: {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: { src: "https://example.com/image.png" },
          },
          {
            type: "fileAttachment",
            attrs: {
              name: "notes.pdf",
              mimeType: "application/pdf",
              src: "https://example.com/notes.pdf",
              path: "https://example.com/notes.pdf",
            },
          },
        ],
      },
      enforceTitleHeading: undefined,
      readOnly: true,
    });

    await waitFor(() => expect(rendered.getByText("notes.pdf")).not.toBeNull());
    for (const name of [
      "Resize image from left",
      "Resize image from right",
      "Remove attachment",
    ]) {
      expect(rendered.queryByRole("button", { name })).toBeNull();
    }
  });
});

describe("browser-safe editor controls", () => {
  it("keeps newly typed lines above a floating composer", async () => {
    const ref = createRef<NoteEditorRef>();
    const scroller = document.createElement("div");
    scroller.style.position = "fixed";
    document.body.appendChild(scroller);
    const rendered = render(
      createElement(NoteEditor, {
        ref,
        initialContent: baseDoc,
        enforceTitleHeading: false,
        scrollBottomInset: 80,
      }),
      { container: scroller },
    );
    await waitFor(() => expect(ref.current?.view).not.toBeNull());
    const view = ref.current!.view!;

    const height = function (this: HTMLElement) {
      return this === scroller ? 600 : 1200;
    };
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
      height,
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      height,
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function () {
        return new DOMRect(0, 0, 800, this === scroller ? 600 : 1200);
      },
    );
    vi.spyOn(view, "coordsAtPos").mockImplementation(() => {
      const bottom =
        540 + (view.state.doc.childCount - 1) * 28 - scroller.scrollTop;
      return { top: bottom - 20, bottom, left: 12, right: 12 };
    });
    act(() => {
      view.focus();
      view.dispatch(
        view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)),
      );
    });

    for (let line = 0; line < 5; line++) {
      act(() => {
        view.dispatch(
          view.state.tr
            .split(view.state.selection.head)
            .insertText("new line")
            .scrollIntoView(),
        );
      });
      expect(
        view.coordsAtPos(view.state.selection.head).bottom,
      ).toBeLessThanOrEqual(520);
    }
    rendered.unmount();
    scroller.remove();
  });

  it("reports document changes before debounced persistence", async () => {
    const handleChange = vi.fn();
    const onDocumentChange = vi.fn();
    const { view } = await renderReadyEditor({
      handleChange,
      onDocumentChange,
    });

    insertText(view, "!");

    expect(onDocumentChange).toHaveBeenCalledOnce();
    expect(onDocumentChange.mock.calls[0]?.[0]).toMatchObject(
      paragraphDoc("old!"),
    );
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("defers serialization when no immediate listener is registered", async () => {
    const handleChange = vi.fn();
    const { view } = await renderReadyEditor({ handleChange });
    vi.useFakeTimers();
    const toJSON = vi.spyOn(PMNode.prototype, "toJSON");

    insertText(view, "!");

    expect(toJSON).not.toHaveBeenCalled();
    await advance();
    expect(
      toJSON.mock.instances.filter((node) => node.type.name === "doc"),
    ).toHaveLength(1);
    expect(handleChange).toHaveBeenCalledOnce();
    toJSON.mockRestore();
  });

  it("defers external content until focus leaves the editor", async () => {
    const { view, rerender } = await renderReadyEditor({
      handleChange: vi.fn(),
    });
    act(() => view.focus());
    expect(view.hasFocus()).toBe(true);
    const toJSON = vi.spyOn(PMNode.prototype, "toJSON");

    rerender({ initialContent: nextDoc });

    expect(view.state.doc.textContent).toBe("old");
    expect(toJSON).not.toHaveBeenCalled();

    act(() => view.dom.blur());

    expect(view.state.doc.textContent).toBe("new");
    toJSON.mockRestore();
  });

  it("keeps external content deferred while focus is in editor popups", async () => {
    const { view, rerender } = await renderReadyEditor({
      handleChange: vi.fn(),
    });
    act(() => view.focus());

    rerender({ initialContent: nextDoc });

    const popup = document.createElement("div");
    popup.dataset.editorEscapeConsumer = "";
    const popupButton = document.createElement("button");
    popup.append(popupButton);
    document.body.append(popup);

    act(() => popupButton.focus());
    expect(view.state.doc.textContent).toBe("old");

    act(() => popupButton.blur());
    expect(view.state.doc.textContent).toBe("new");
    popup.remove();
  });

  it("preserves undo history across external edits without persisting the sync", async () => {
    vi.useFakeTimers();
    const handleChange = vi.fn();
    const { view, rerender } = renderEditor({ handleChange });
    insertText(view, "!");
    await advance();
    handleChange.mockClear();

    rerender({ initialContent: nextDoc });
    expect(view.state.doc.textContent).toBe("new");
    await advance();
    expect(handleChange).not.toHaveBeenCalled();

    insertText(view, "?");
    expectUndo(view);
    expect(view.state.doc.textContent).toBe("new");
    expectUndo(view);
    expect(view.state.doc.textContent).toBe("old!");
    await advance();
    expect(handleChange).toHaveBeenLastCalledWith(view.state.doc.toJSON());
    expectUndo(view);
    expect(view.state.doc.textContent).toBe("old");
    expectUndo(view, redo);
    expectUndo(view, redo);
    expect(view.state.doc.textContent).toBe("new");
  });

  it("reports the normalized synced document without persisting appended transactions", async () => {
    vi.useFakeTimers();
    const handleChange = vi.fn();
    const onDocumentChange = vi.fn();
    const { view, rerender } = renderEditor({
      handleChange,
      onDocumentChange,
    });
    const incoming = paragraphDoc("https://example.com");

    rerender({ initialContent: incoming });

    expect(view.state.doc.firstChild?.firstChild?.marks).toEqual([
      expect.objectContaining({ type: schema.marks.link }),
    ]);
    expect(onDocumentChange).toHaveBeenCalledExactlyOnceWith(
      view.state.doc.toJSON(),
    );
    await advance();
    expect(handleChange).not.toHaveBeenCalled();

    rerender({ initialContent: structuredClone(incoming) });
    expect(onDocumentChange).toHaveBeenCalledOnce();

    insertText(view, " more", 20);
    await advance();
    expect(handleChange).toHaveBeenLastCalledWith(view.state.doc.toJSON());
    expectUndo(view);
    expect(view.state.doc.textContent).toBe("https://example.com");
    expect(view.state.doc.firstChild?.firstChild?.marks).toHaveLength(1);
    expectUndo(view);
    expect(view.state.doc.textContent).toBe("old");
  });

  it("flushes the current document through the change handler immediately", async () => {
    const handleChange = vi.fn();
    const { ref } = await renderReadyEditor({ handleChange });

    act(() => ref.current?.flushPendingChanges());

    expect(handleChange).toHaveBeenCalledOnce();
    expect(handleChange).toHaveBeenCalledWith(baseDoc);
  });

  it("persists during uninterrupted typing instead of waiting for a pause", async () => {
    const handleChange = vi.fn();
    const { view } = await renderReadyEditor({ handleChange });
    vi.useFakeTimers();

    // Keystrokes arrive faster than the debounce delay for 25s, so the
    // trailing edge never fires and only maxWait can force a write.
    for (let keystroke = 0; keystroke < 100; keystroke++) {
      insertText(view, "a");
      await advance(250);
    }

    expect(handleChange).toHaveBeenCalled();
  });

  it("cancels the original debounce after callback-changing rerenders", async () => {
    const handleChange = vi.fn();
    const taskSource = () => ({
      type: "session_raw_note" as const,
      id: "session-1",
    });
    const { ref, view, rerender } = await renderReadyEditor({
      handleChange,
      taskSource: taskSource(),
    });
    vi.useFakeTimers();

    insertText(view, " first");
    rerender({ taskSource: taskSource() });
    insertText(view, " second");
    const currentBody = view.state.doc.toJSON();

    act(() => ref.current?.flushPendingChanges());
    await advance();

    expect(handleChange).toHaveBeenCalledOnce();
    expect(handleChange).toHaveBeenCalledWith(currentBody);
  });

  it("flushes a pending change before disposing the editor", async () => {
    const events: string[] = [];
    const handleChange = vi.fn(() => events.push("persist"));
    const onViewDisposed = vi.fn(() => events.push("dispose"));
    const { rendered, view } = await renderReadyEditor({
      handleChange,
      onViewDisposed,
    });
    vi.useFakeTimers();

    insertText(view, " pending");
    const pendingBody = view.state.doc.toJSON();

    act(() => rendered.unmount());

    expect(handleChange).toHaveBeenCalledOnce();
    expect(handleChange).toHaveBeenCalledWith(pendingBody);
    expect(onViewDisposed).toHaveBeenCalledOnce();
    expect(events).toEqual(["persist", "dispose"]);

    await advance();
    expect(handleChange).toHaveBeenCalledOnce();
  });

  it("does not persist an unchanged document when disposing the editor", async () => {
    const handleChange = vi.fn();
    const { rendered } = await renderReadyEditor({ handleChange });

    act(() => rendered.unmount());

    expect(handleChange).not.toHaveBeenCalled();
  });

  it("does not mount the slash command surface when disabled", async () => {
    const { rendered, view } = await renderReadyEditor({
      initialContent: titledDoc("Title", "/"),
      enforceTitleHeading: undefined,
      showSlashCommand: false,
    });

    select(view, 9);

    expect(rendered.queryByText("Commands")).toBeNull();
  });
});
