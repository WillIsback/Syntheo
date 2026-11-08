import { afterEach, describe, expect, it } from "vitest";

import { preventFileDropNavigation } from "./prevent-file-drop-navigation";

function dragEvent(type: "dragover" | "drop", types: string[]) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: { types, dropEffect: "copy" },
  });
  return event;
}

describe("preventFileDropNavigation", () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it("stops a file dropped outside any drop zone from navigating the window", () => {
    dispose = preventFileDropNavigation();

    const dragOver = dragEvent("dragover", ["Files"]);
    document.body.dispatchEvent(dragOver);
    const drop = dragEvent("drop", ["Files"]);
    document.body.dispatchEvent(drop);

    expect(dragOver.defaultPrevented).toBe(true);
    expect(dragOver.dataTransfer?.dropEffect).toBe("none");
    expect(drop.defaultPrevented).toBe(true);
  });

  it("leaves drop zones and in-app drags (note mentions) alone", () => {
    dispose = preventFileDropNavigation();

    const zone = document.createElement("div");
    zone.addEventListener("dragover", (event) => event.preventDefault());
    document.body.appendChild(zone);
    const handled = dragEvent("dragover", ["Files"]);
    zone.dispatchEvent(handled);
    zone.remove();

    const mention = dragEvent("dragover", ["application/x-syntheo-session"]);
    document.body.dispatchEvent(mention);

    expect(handled.dataTransfer?.dropEffect).toBe("copy");
    expect(mention.defaultPrevented).toBe(false);
  });
});
