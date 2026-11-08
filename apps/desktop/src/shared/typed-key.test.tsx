import { cleanup, render } from "@testing-library/react";
import { useHotkeys } from "react-hotkeys-hook";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getShortcut } from "./shortcuts";
import { ignoreUnlessTyped, matchesTypedKey } from "./typed-key";

// Vrai react-hotkeys-hook (non simulé) : on vérifie le comportement réel des
// touches physiques AZERTY et QWERTY.
function SettingsShortcut({ onOpen }: { onOpen: () => void }) {
  const def = getShortcut("settings");
  useHotkeys(def.hotkeys ?? "", onOpen, {
    preventDefault: true,
    ignoreEventWhen: ignoreUnlessTyped(def.typedKey),
  });
  return null;
}

function press(init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    ...init,
  });
  document.dispatchEvent(event);
  document.dispatchEvent(
    new KeyboardEvent("keyup", { bubbles: true, ...init }),
  );
  return event;
}

describe("matchesTypedKey", () => {
  it("compare le caractère tapé, pas la touche physique", () => {
    expect(matchesTypedKey({ key: "," }, ",")).toBe(true);
    expect(matchesTypedKey({ key: ";" }, ",")).toBe(false);
    expect(matchesTypedKey({ key: "N" }, "n")).toBe(true);
  });

  it("n'ignore rien sans caractère attendu", () => {
    expect(ignoreUnlessTyped(undefined)).toBeUndefined();
  });
});

describe("Ctrl+, avec react-hotkeys-hook", () => {
  afterEach(() => cleanup());

  it("ouvre les paramètres en QWERTY (code Comma, caractère « , »)", () => {
    const onOpen = vi.fn();
    render(<SettingsShortcut onOpen={onOpen} />);

    const event = press({ key: ",", code: "Comma" });

    expect(onOpen).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("ouvre les paramètres en AZERTY (code KeyM, caractère « , »)", () => {
    const onOpen = vi.fn();
    render(<SettingsShortcut onOpen={onOpen} />);

    const event = press({ key: ",", code: "KeyM" });

    expect(onOpen).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignore Ctrl+; en AZERTY (code Comma, caractère « ; »)", () => {
    const onOpen = vi.fn();
    render(<SettingsShortcut onOpen={onOpen} />);

    const event = press({ key: ";", code: "Comma" });

    expect(onOpen).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignore Ctrl+M en QWERTY (code KeyM, caractère « m »)", () => {
    const onOpen = vi.fn();
    render(<SettingsShortcut onOpen={onOpen} />);

    const event = press({ key: "m", code: "KeyM" });

    expect(onOpen).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
