import type { Node as PMNode } from "prosemirror-model";
import {
  EditorState,
  Selection,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { describe, expect, it } from "vitest";

import { buildInputRules, buildKeymap } from "./keymap";
import { schema } from "./schema";

// Fabriques de documents d'entrée.
const p = (text?: string, isCode = false) =>
  schema.node(
    "paragraph",
    null,
    text === undefined
      ? []
      : [schema.text(text, isCode ? [schema.marks.code.create()] : undefined)],
  );
const doc = (...content: PMNode[]) => schema.node("doc", null, content);
const li = (...paragraphs: PMNode[]) =>
  schema.node("listItem", null, paragraphs);
const bulletList = (...texts: string[]) =>
  schema.node(
    "bulletList",
    null,
    texts.map((text) => li(p(text))),
  );
const taskItem = (id: number, done: boolean, ...paragraphs: PMNode[]) =>
  schema.node(
    "taskItem",
    {
      status: done ? "done" : "todo",
      checked: done,
      taskId: `task-${id}`,
      taskItemId: `task-item-${id}`,
    },
    paragraphs,
  );
const taskList = (...items: PMNode[]) => schema.node("taskList", null, items);
const createParagraphDoc = (text: string, isCode = false) =>
  doc(p(text, isCode));

// Fabriques du JSON attendu.
const pJSON = (text?: string, marks?: string[]) => ({
  type: "paragraph",
  ...(text !== undefined && {
    content: [
      {
        type: "text",
        text,
        ...(marks && { marks: marks.map((type) => ({ type })) }),
      },
    ],
  }),
});
const listJSON = (type: string, texts: string[], attrs?: object) => ({
  type,
  ...(attrs && { attrs }),
  content: texts.map((text) => ({ type: "listItem", content: [pJSON(text)] })),
});
const taskItemJSON = (id: number | null, done: boolean, text?: string) => ({
  type: "taskItem",
  attrs: {
    status: done ? "done" : "todo",
    checked: done,
    taskId: id === null ? expect.any(String) : `task-${id}`,
    taskItemId: id === null ? expect.any(String) : `task-item-${id}`,
  },
  content: [pJSON(text)],
});
const taskListJSON = (...items: object[]) => ({
  type: "taskList",
  content: items,
});
const docJSON = (...content: object[]) => ({ type: "doc", content });

type TextInputHandler = (
  view: EditorView,
  from: number,
  to: number,
  text: string,
  deflt: () => Transaction,
) => boolean | void;

// Vue minimale qui applique les transactions à un état local.
function createHarness(
  source: PMNode,
  {
    pos,
    inputRules = false,
    keymap = false,
    endOfTextblock = false,
  }: {
    pos?: number;
    inputRules?: boolean;
    keymap?: boolean;
    endOfTextblock?: boolean;
  },
) {
  const rules = inputRules ? buildInputRules() : null;
  const keys = keymap ? buildKeymap() : null;
  let state = EditorState.create({
    schema,
    doc: source,
    selection:
      pos === undefined
        ? Selection.atEnd(source)
        : TextSelection.create(source, pos),
    plugins: [rules, keys].filter((plugin) => plugin !== null),
  });
  const view = {
    composing: false,
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = state.apply(tr);
    },
    endOfTextblock: () => endOfTextblock,
  } as Pick<
    EditorView,
    "composing" | "dispatch" | "endOfTextblock" | "state"
  > as EditorView;

  return {
    get state() {
      return state;
    },
    type: (text: string) =>
      (rules?.props.handleTextInput as TextInputHandler | undefined)?.(
        view,
        state.selection.from,
        state.selection.to,
        text,
        () =>
          state.tr.insertText(text, state.selection.from, state.selection.to),
      ),
    press: (key: string, init?: KeyboardEventInit) =>
      keys?.props.handleKeyDown?.(
        view,
        new KeyboardEvent("keydown", { key, ...init }),
      ),
  };
}

function runTextInput(source: PMNode, text: string, pos?: number) {
  const harness = createHarness(source, { pos, inputRules: true });
  const handled = harness.type(text);
  return { handled, state: harness.state };
}

function runKeyDown(
  source: PMNode,
  key: string,
  { pos, init }: { pos?: number; init?: KeyboardEventInit } = {},
) {
  const harness = createHarness(source, { pos, keymap: true });
  const handled = harness.press(key, init);
  return { handled, state: harness.state };
}

function runBackspaceAtTextStart(
  source: PMNode,
  text: string,
  endOfTextblock = false,
) {
  const harness = createHarness(source, {
    pos: getTextStartPos(source, text),
    keymap: true,
    endOfTextblock,
  });
  expect(harness.press("Backspace")).toBe(true);
  return { state: harness.state };
}

function runInputThenBackspace(
  source: PMNode,
  text: string,
  init?: KeyboardEventInit,
) {
  const harness = createHarness(source, { inputRules: true, keymap: true });
  harness.type(text);
  const handled = harness.press("Backspace", init);
  return { handled, state: harness.state };
}

function getTextStartPos(source: PMNode, text: string) {
  let textPos = -1;

  source.descendants((node, pos) => {
    if (node.isText && node.text === text) {
      textPos = pos;
      return false;
    }

    return undefined;
  });

  if (textPos === -1) {
    throw new Error(`Missing text node: ${text}`);
  }

  return textPos;
}

const expectInsideTaskParagraph = (state: EditorState) => {
  expect(state.selection.$from.parent.type.name).toBe("paragraph");
  expect(state.selection.$from.node(-1).type.name).toBe("taskItem");
};

describe("buildInputRules", () => {
  it.each([
    { marker: "[]", done: false },
    { marker: "[x]", done: true },
    { marker: "[X]", done: true },
  ])(
    "creates a task item (done: $done) when typing $marker followed by space",
    ({ marker, done }) => {
      const { handled, state } = runTextInput(doc(p(marker)), " ");

      expect(handled).toBe(true);
      expect(state.doc.toJSON()).toEqual(
        docJSON(taskListJSON(taskItemJSON(null, done))),
      );
    },
  );

  it("keeps the cursor inside the new task before another paragraph", () => {
    const { state } = runTextInput(doc(p("[]"), p()), " ", 3);

    expectInsideTaskParagraph(state);
    expect(state.tr.insertText("My task").doc.firstChild?.textContent).toBe(
      "My task",
    );
  });

  it("keeps text typed after the marker inside the new task item", () => {
    const { handled, state } = runTextInput(doc(p("[]rest")), " ", 3);

    expect(handled).toBe(true);
    expect(state.doc.toJSON()).toEqual(
      docJSON(taskListJSON(taskItemJSON(null, false, "rest"))),
    );
  });

  it("converts a bullet list item into a task item and keeps the rest of the list", () => {
    const { handled, state } = runTextInput(doc(bulletList("one", "[]")), " ");

    expect(handled).toBe(true);
    expect(state.doc.toJSON()).toEqual(
      docJSON(
        listJSON("bulletList", ["one"]),
        taskListJSON(taskItemJSON(null, false)),
      ),
    );
    expectInsideTaskParagraph(state);
  });

  it("converts an ordered list item into a task item", () => {
    const source = doc(
      schema.node("orderedList", { start: 5 }, [
        li(p("one")),
        li(p("[]")),
        li(p("two")),
      ]),
    );
    const { handled, state } = runTextInput(
      source,
      " ",
      getTextStartPos(source, "[]") + 2,
    );

    expect(handled).toBe(true);
    expect(state.doc.toJSON()).toEqual(
      docJSON(
        listJSON("orderedList", ["one"], { start: 5 }),
        taskListJSON(taskItemJSON(null, false)),
        listJSON("orderedList", ["two"], { start: 7 }),
      ),
    );
  });

  it("merges a converted list item into adjacent task lists", () => {
    const source = doc(
      taskList(taskItem(1, false, p("first"))),
      bulletList("[]"),
      taskList(taskItem(2, true, p("last"))),
    );
    const { handled, state } = runTextInput(
      source,
      " ",
      getTextStartPos(source, "[]") + 2,
    );

    expect(handled).toBe(true);
    expect(state.doc.toJSON()).toEqual(
      docJSON(
        taskListJSON(
          taskItemJSON(1, false, "first"),
          taskItemJSON(null, false),
          taskItemJSON(2, true, "last"),
        ),
      ),
    );
  });

  it.each([
    {
      name: "a marker in a non-leading list item paragraph",
      source: doc(schema.node("bulletList", null, [li(p("one"), p("[]"))])),
      input: " ",
    },
    {
      name: "underline markup inside a code span",
      source: createParagraphDoc("<u>hi</u", true),
      input: ">",
    },
    {
      name: "bold markup inside a code span",
      source: createParagraphDoc("**hi*", true),
      input: "*",
    },
    {
      name: "an unknown emoji shortcode",
      source: createParagraphDoc("a :nosuchshortcode"),
      input: ":",
    },
    {
      name: "replacement shorthands in code blocks",
      source: doc(schema.node("codeBlock", null, [schema.text("-")])),
      input: ">",
    },
  ])("leaves $name as literal text", ({ source, input }) => {
    const { handled, state } = runTextInput(source, input);

    expect(handled).not.toBe(true);
    expect(state.doc.toJSON()).toEqual(source.toJSON());
  });

  it.each([
    {
      mark: "code",
      text: "use `code",
      input: "`",
      expected: [
        { type: "text", text: "use " },
        { type: "text", text: "code", marks: [{ type: "code" }] },
      ],
    },
    {
      mark: "bold",
      text: "__bold_",
      input: "_",
      expected: pJSON("bold", ["bold"]).content,
    },
    {
      mark: "underline",
      text: "<u>hi</u",
      input: ">",
      expected: pJSON("hi", ["underline"]).content,
    },
  ])("marks wrapped text as $mark", ({ text, input, expected }) => {
    const { handled, state } = runTextInput(createParagraphDoc(text), input);

    expect(handled).toBe(true);
    expect(state.doc.toJSON()).toEqual(
      docJSON({ type: "paragraph", content: expected }),
    );
  });

  it.each([
    {
      shorthand: "known emoji shortcode",
      text: "launch :rocket",
      input: ":",
      expected: "launch 🚀",
    },
    {
      shorthand: "typed arrow shorthand",
      text: "-",
      input: ">",
      expected: "→",
    },
    {
      shorthand: "double dash after a word",
      text: "wait-",
      input: "-",
      expected: "wait—",
    },
    {
      shorthand: "typed copyright shorthand",
      text: "(c",
      input: ")",
      expected: "©",
    },
  ])("replaces $shorthand", ({ text, input, expected }) => {
    const { handled, state } = runTextInput(createParagraphDoc(text), input);

    expect(handled).toBe(true);
    expect(state.doc.toJSON()).toEqual(createParagraphDoc(expected).toJSON());
  });

  it("leaves a third dash alone so --- can still become a horizontal rule", () => {
    const { handled, state } = runTextInput(createParagraphDoc("--"), "-");

    expect(handled).toBeFalsy();
    expect(state.doc.toJSON()).toEqual(docJSON(pJSON("--")));
  });

  it("turns --- followed by a space into a horizontal rule", () => {
    const { handled, state } = runTextInput(createParagraphDoc("---"), " ");

    expect(handled).toBe(true);
    expect(state.doc.toJSON()).toEqual(
      docJSON({ type: "horizontalRule" }, pJSON()),
    );
  });
});

describe("buildKeymap", () => {
  it("does not handle Shift+Enter as a hard break shortcut", () => {
    const source = createParagraphDoc("hello");
    const { handled, state } = runKeyDown(source, "Enter", {
      init: { shiftKey: true },
    });

    expect(handled).not.toBe(true);
    expect(state.doc.toJSON()).toEqual(source.toJSON());
  });

  it("merges task item text backward without changing the list structure", () => {
    const { state } = runBackspaceAtTextStart(
      doc(taskList(taskItem(1, false, p("one")), taskItem(2, false, p("two")))),
      "two",
    );

    expect(state.doc.toJSON()).toEqual(
      docJSON(taskListJSON(taskItemJSON(1, false, "onetwo"))),
    );
  });

  it("lifts the first task item to a paragraph instead of merging into a previous bullet list", () => {
    const { state } = runBackspaceAtTextStart(
      doc(bulletList("one"), taskList(taskItem(1, false, p("two")))),
      "two",
    );

    expect(state.doc.toJSON()).toEqual(
      docJSON(listJSON("bulletList", ["one"]), pJSON("two")),
    );
  });

  it("lifts the first task item to a paragraph when the list starts the doc", () => {
    const { state } = runBackspaceAtTextStart(
      doc(
        taskList(taskItem(1, false, p("two")), taskItem(2, false, p("three"))),
      ),
      "two",
    );

    expect(state.doc.toJSON()).toEqual(
      docJSON(pJSON("two"), taskListJSON(taskItemJSON(2, false, "three"))),
    );
  });

  it("joins later task item paragraphs within the same task item", () => {
    const { state } = runBackspaceAtTextStart(
      doc(
        taskList(
          taskItem(1, false, p("one")),
          taskItem(2, false, p("two"), p("three")),
        ),
      ),
      "three",
      true,
    );

    expect(state.doc.toJSON()).toEqual(
      docJSON(
        taskListJSON(
          taskItemJSON(1, false, "one"),
          taskItemJSON(2, false, "twothree"),
        ),
      ),
    );
  });

  it("splits a done task item into a fresh todo item on Enter", () => {
    const source = doc(taskList(taskItem(1, true, p("done"))));
    const { handled, state } = runKeyDown(source, "Enter", {
      pos: getTextStartPos(source, "done") + "done".length,
    });

    expect(handled).toBe(true);
    const json = state.doc.toJSON();
    expect(json.content?.[0]?.type).toBe("taskList");
    const items = json.content?.[0]?.content ?? [];
    expect(items).toHaveLength(2);
    expect(items[0]?.attrs).toMatchObject(taskItemJSON(1, true).attrs);
    expect(items[1]?.attrs).toMatchObject({ status: "todo", checked: false });
    expect(items[1]?.attrs?.taskId).not.toBe("task-1");
    expect(items[1]?.attrs?.taskItemId).not.toBe("task-item-1");
    expect(state.selection.$from.node(-1).type.name).toBe("taskItem");
  });

  it("inserts an empty paragraph above the list on Enter at the start of the first task item", () => {
    const source = doc(taskList(taskItem(1, false, p("task"))));
    const { handled, state } = runKeyDown(source, "Enter", {
      pos: getTextStartPos(source, "task"),
    });

    expect(handled).toBe(true);
    expect(state.doc.toJSON()).toEqual(
      docJSON(pJSON(), taskListJSON(taskItemJSON(1, false, "task"))),
    );
    expect(state.selection.$from.parent.type.name).toBe("paragraph");
    expect(state.selection.$from.depth).toBe(1);
  });

  it.each([
    {
      position: "at the start of the first bullet item",
      text: "one",
      expected: ["paragraph", "bulletList"],
      items: 2,
    },
    {
      position: "mid-list",
      text: "two",
      expected: ["bulletList"],
      items: 3,
    },
  ])(
    "handles Enter $position without losing list items",
    ({ text, expected, items }) => {
      const source = doc(bulletList("one", "two"));
      const { handled, state } = runKeyDown(source, "Enter", {
        pos: getTextStartPos(source, text),
      });

      expect(handled).toBe(true);
      const json = state.doc.toJSON();
      expect(json.content?.map((node: { type: string }) => node.type)).toEqual(
        expected,
      );
      // En tête de liste, un paragraphe s'ouvre au-dessus ; ailleurs, l'item
      // est scindé.
      expect(json.content?.[expected.length - 1]?.content).toHaveLength(items);
    },
  );

  it("restores the marker text when Backspace follows the task conversion", () => {
    const { state } = runInputThenBackspace(doc(p("[]")), " ");

    expect(state.doc.toJSON()).toEqual(docJSON(pJSON("[] ")));
  });

  it("does not undo the input rule on modified Backspace chords", () => {
    const { handled, state } = runInputThenBackspace(
      createParagraphDoc("a -"),
      ">",
      { ctrlKey: true },
    );

    // A modified Backspace deletes backward instead of restoring the "-";
    // nothing in the chain claimed it, so the arrow stays for the browser's
    // own word-deletion to remove.
    expect(handled).toBeFalsy();
    expect(state.doc.firstChild?.textContent).toBe("a →");
  });
});
