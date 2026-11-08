import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

// Script injecté par `src-tauri/src/lib.rs` dans la version publiée (issue 376) :
// le clic droit natif n'est permis que dans les champs et l'éditeur de notes.
// Vitest s'exécute depuis apps/desktop.
const SCRIPT_PATH = join(process.cwd(), "src-tauri/src/context_menu_guard.js");

function rightClick(target: Element | Text) {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

function el(
  tag: string,
  attributes: Record<string, string> = {},
  children: (Element | string)[] = [],
) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  element.append(...children);
  return element;
}

function mount(...children: Element[]) {
  const container = el("div", {}, children);
  document.body.append(container);
  return container;
}

describe("context menu guard", () => {
  beforeAll(() => {
    // Le script vient du dépôt, pas d'une entrée utilisateur.
    // oxlint-disable-next-line no-new-func
    new Function(readFileSync(SCRIPT_PATH, "utf8"))();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("blocks the native menu outside editable elements", () => {
    const root = mount(
      el("p", { id: "text" }, ["Synthèse"]),
      el("button", { id: "button" }, ["OK"]),
      el("input", { id: "checkbox", type: "checkbox" }),
    );

    for (const id of ["text", "button", "checkbox"]) {
      expect(
        rightClick(root.querySelector(`#${id}`)!).defaultPrevented,
        id,
      ).toBe(true);
    }
    expect(rightClick(document.body).defaultPrevented).toBe(true);
  });

  it("keeps the native menu in text fields and the note editor", () => {
    const root = mount(
      el("input", { id: "plain" }),
      el("input", { id: "search", type: "search" }),
      el("input", { id: "password", type: "password" }),
      el("textarea", { id: "area" }),
      el("div", { contenteditable: "true" }, [
        el("p", { id: "editor" }, [
          "Note ",
          el("strong", { id: "bold" }, ["importante"]),
        ]),
      ]),
      el("div", { contenteditable: "" }, [
        el("span", { id: "empty-attr" }, ["x"]),
      ]),
    );

    for (const id of [
      "plain",
      "search",
      "password",
      "area",
      "editor",
      "bold",
      "empty-attr",
    ]) {
      expect(
        rightClick(root.querySelector(`#${id}`)!).defaultPrevented,
        id,
      ).toBe(false);
    }

    const textNode = root.querySelector("#editor")!.firstChild as Text;
    expect(rightClick(textNode).defaultPrevented).toBe(false);
  });

  it("blocks non-editable islands and disabled fields", () => {
    const root = mount(
      el("div", { contenteditable: "true" }, [
        el("span", { contenteditable: "false", id: "island" }, ["@Mme Martin"]),
      ]),
      el("input", { id: "disabled", disabled: "" }),
      el("textarea", { id: "disabled-area", disabled: "" }),
    );

    for (const id of ["island", "disabled", "disabled-area"]) {
      expect(
        rightClick(root.querySelector(`#${id}`)!).defaultPrevented,
        id,
      ).toBe(true);
    }
  });

  it("lets the app's own listeners receive the event", () => {
    const root = mount(el("p", { id: "text" }, ["Synthèse"]));
    const target = root.querySelector("#text")!;
    let received = 0;
    const listener = () => {
      received += 1;
    };
    target.addEventListener("contextmenu", listener);
    window.addEventListener("contextmenu", listener);

    expect(rightClick(target).defaultPrevented).toBe(true);
    expect(received).toBe(2);

    window.removeEventListener("contextmenu", listener);
  });
});
