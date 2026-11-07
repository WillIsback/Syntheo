import { DOMSerializer, type Node as PMNode } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { afterEach, describe, expect, it } from "vitest";

import { schema } from "../note/schema";
import { serializeClipboardText } from "./clipboard";
import { createDerivedInk, type DerivedInkRange } from "./derived-ink";

function makeDoc() {
  return schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("Alpha. Beta.")]),
  ]);
}

function inked(view: EditorView) {
  return [...view.dom.querySelectorAll(".ink-test")].map((n) => n.textContent);
}

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

describe("createDerivedInk", () => {
  it("decorates the computed ranges without touching the document", () => {
    const ink = createDerivedInk<DerivedInkRange[]>({
      className: "ink-test",
      data: [{ from: 1, to: 7 }],
      compute: (_doc, ranges) => ranges,
    });
    const doc = makeDoc();
    const before = JSON.stringify(doc.toJSON());
    view = new EditorView(document.createElement("div"), {
      state: EditorState.create({ doc, plugins: [ink.plugin] }),
    });

    expect(inked(view)).toEqual(["Alpha."]);
    expect(JSON.stringify(view.state.doc.toJSON())).toBe(before);

    // Copier : texte brut et HTML viennent du document, pas des décorations.
    const slice = view.state.doc.slice(0, view.state.doc.content.size);
    expect(serializeClipboardText(slice)).toBe("Alpha. Beta.");
    const html = document.createElement("div");
    html.appendChild(
      DOMSerializer.fromSchema(schema).serializeFragment(slice.content),
    );
    expect(html.innerHTML).not.toContain("ink-test");

    ink.setData([{ from: 8, to: 13 }]);
    expect(inked(view)).toEqual(["Beta."]);
    expect(JSON.stringify(view.state.doc.toJSON())).toBe(before);
  });

  it("recomputes after an edit and ignores ranges outside the document", () => {
    const seen: PMNode[] = [];
    const ink = createDerivedInk({
      className: "ink-test",
      data: null,
      compute: (doc) => {
        seen.push(doc);
        return [
          { from: 1, to: 7 },
          { from: 50, to: 60 },
        ];
      },
    });
    view = new EditorView(document.createElement("div"), {
      state: EditorState.create({ doc: makeDoc(), plugins: [ink.plugin] }),
    });

    view.dispatch(view.state.tr.insertText("!", 13));

    expect(seen.at(-1)?.textContent).toBe("Alpha. Beta.!");
    expect(view.dom.querySelectorAll(".ink-test")).toHaveLength(1);
  });

  it("applies data set before the view exists once it mounts", async () => {
    const ink = createDerivedInk<DerivedInkRange[]>({
      className: "ink-test",
      data: [],
      compute: (_doc, ranges) => ranges,
    });
    const state = EditorState.create({ doc: makeDoc(), plugins: [ink.plugin] });
    ink.setData([{ from: 1, to: 7 }]);
    view = new EditorView(document.createElement("div"), { state });
    await Promise.resolve();

    expect(inked(view)).toEqual(["Alpha."]);

    view.destroy();
    view = null;
    expect(() => ink.setData([])).not.toThrow();
  });
});
