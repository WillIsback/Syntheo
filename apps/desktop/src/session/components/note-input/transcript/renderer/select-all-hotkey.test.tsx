import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { copySelectedReplies } from "./copy-replies";
import { useSelectAllRepliesHotkey } from "./select-all-hotkey";
import type { TranscriptWordSelection } from "./selection";

const { copyTextToClipboard } = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(async () => true),
}));

vi.mock("~/session/components/note-input/header-shared", () => ({
  copyTextToClipboard,
}));

const reply = (
  text: string,
  speakerLabel: string,
): TranscriptWordSelection => ({
  text,
  speakerLabel,
  startMs: 0,
  groups: [],
});
const ORDER = ["t:1", "t:2", "t:3"];
const ENTRIES = new Map([
  ["t:1", reply("On garde le 27 ?", "You")],
  ["t:2", reply("Oui.", "Claire")],
  ["t:3", reply("Parfait.", "Speaker 3")],
]);

let selected = new Map<string, TranscriptWordSelection>();

function Margin() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  useSelectAllRepliesHotkey({
    containerRef,
    collectAll: () => ({ order: ORDER, entries: ENTRIES }),
    onSelect: (entries) => {
      selected = entries;
      setCount(entries.size);
    },
  });
  return (
    <>
      <div ref={containerRef} tabIndex={-1} data-testid="margin">
        <p data-testid="reply">On garde le 27 ?</p>
        <div data-transcript-editor contentEditable data-testid="editor">
          Oui.
        </div>
      </div>
      <input data-testid="elsewhere" />
      <output data-testid="count">{count}</output>
    </>
  );
}

function pressSelectAll(target: Element, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "a",
    code: "KeyA",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  fireEvent(target, event);
  fireEvent.keyUp(target, { key: init.key ?? "a", code: init.code ?? "KeyA" });
  return event;
}

describe("Ctrl+A in the transcript margin (issue 458)", () => {
  afterEach(() => {
    cleanup();
    selected = new Map();
    copyTextToClipboard.mockClear();
  });

  it("selects every reply, in order, instead of the whole window", () => {
    render(<Margin />);

    const event = pressSelectAll(screen.getByTestId("reply"));

    expect(event.defaultPrevented).toBe(true);
    expect([...selected.keys()]).toEqual(ORDER);
    expect(screen.getByTestId("count").textContent).toBe("3");
  });

  it("works with Cmd+A on macOS and the AZERTY A key", () => {
    render(<Margin />);

    // AZERTY : la touche A est à l'emplacement physique Q.
    pressSelectAll(screen.getByTestId("margin"), {
      ctrlKey: false,
      metaKey: true,
      code: "KeyQ",
    });

    expect(selected.size).toBe(3);
  });

  it("ignores Ctrl+Q on AZERTY, which shares the physical A key", () => {
    render(<Margin />);

    const event = pressSelectAll(screen.getByTestId("reply"), { key: "q" });

    expect(event.defaultPrevented).toBe(false);
    expect(selected.size).toBe(0);
  });

  it.each(["editor", "elsewhere"])(
    "keeps the native Ctrl+A in %s",
    (testId) => {
      render(<Margin />);

      const event = pressSelectAll(screen.getByTestId(testId));

      expect(event.defaultPrevented).toBe(false);
      expect(selected.size).toBe(0);
    },
  );

  it("then copies the whole transcript with its speakers", async () => {
    render(<Margin />);
    pressSelectAll(screen.getByTestId("reply"));

    await copySelectedReplies(selected, ORDER, ENTRIES);

    expect(copyTextToClipboard).toHaveBeenCalledWith(
      "You: On garde le 27 ?\n\nClaire: Oui.\n\nSpeaker 3: Parfait.",
      expect.objectContaining({ success: "Transcript copied" }),
    );
  });
});
