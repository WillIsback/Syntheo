import { LogicalPosition } from "@tauri-apps/api/dpi";
import type { SyntheticEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ popup: vi.fn(() => Promise.resolve()) }));

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: vi.fn(() => Promise.resolve({ popup: mocks.popup })) },
  MenuItem: { new: vi.fn((options: unknown) => Promise.resolve(options)) },
  PredefinedMenuItem: {
    new: vi.fn((options: unknown) => Promise.resolve(options)),
  },
}));

import { showNativeContextMenu } from "./useNativeContextMenu";

const items = [{ id: "open", text: "Open", action: () => {} }];

const preventDefault = vi.fn();

function reactEvent(nativeEvent: Event, currentTarget: Element) {
  return {
    nativeEvent,
    currentTarget,
    preventDefault,
    stopPropagation: vi.fn(),
  } as unknown as SyntheticEvent;
}

describe("showNativeContextMenu", () => {
  let row: HTMLLIElement;

  beforeEach(() => {
    mocks.popup.mockClear();
    preventDefault.mockClear();
    row = document.createElement("li");
    row.tabIndex = 0;
    row.getBoundingClientRect = () =>
      ({ left: 40, top: 100, bottom: 124, right: 240 }) as DOMRect;
    document.body.append(row);
    row.focus();
  });

  afterEach(() => {
    row.remove();
  });

  it("opens a keyboard menu under the focused element", async () => {
    await showNativeContextMenu(
      items,
      reactEvent(new KeyboardEvent("keydown", { key: "F10" }), row),
    );

    expect(mocks.popup).toHaveBeenCalledWith(new LogicalPosition(40, 124));
  });

  it("treats a contextmenu event without coordinates as a keyboard one", async () => {
    await showNativeContextMenu(
      items,
      reactEvent(new MouseEvent("contextmenu"), row),
    );

    expect(mocks.popup).toHaveBeenCalledWith(new LogicalPosition(40, 124));
  });

  it("leaves a mouse menu at the pointer", async () => {
    const event = reactEvent(
      new MouseEvent("contextmenu", { clientX: 300, clientY: 200 }),
      row,
    );

    await showNativeContextMenu(items, event);

    expect(mocks.popup).toHaveBeenCalledWith();
    expect(preventDefault).toHaveBeenCalled();
  });
});
