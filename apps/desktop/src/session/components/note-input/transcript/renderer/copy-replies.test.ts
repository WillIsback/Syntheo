import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  copySelectedReplies,
  formatRepliesForClipboard,
  orderSelectedReplies,
} from "./copy-replies";
import type { TranscriptWordSelection } from "./selection";

const { copyTextToClipboard } = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(async () => true),
}));

vi.mock("~/session/components/note-input/header-shared", () => ({
  copyTextToClipboard,
}));

function reply(text: string, speakerLabel?: string): TranscriptWordSelection {
  return { text, speakerLabel, startMs: 0, groups: [] };
}

const ORDER = ["t:1", "t:2", "t:3"];
const ENTRIES = new Map([
  ["t:1", reply("on garde la date du 27 ?", "You")],
  ["t:2", reply(" oui, à condition d'avoir la recette lundi. ", "Claire")],
  ["t:3", reply("Parfait.", "Speaker 3")],
]);

describe("formatRepliesForClipboard", () => {
  it("puts the speaker ahead of each reply, one paragraph per reply", () => {
    expect(formatRepliesForClipboard([...ENTRIES.values()].slice(0, 2))).toBe(
      "You: on garde la date du 27 ?\n\n" +
        "Claire: oui, à condition d'avoir la recette lundi.",
    );
  });

  it("keeps a reply without a known speaker and skips empty ones", () => {
    expect(formatRepliesForClipboard([reply("Bonjour"), reply("  ")])).toBe(
      "Bonjour",
    );
  });
});

describe("orderSelectedReplies", () => {
  it("follows the transcript order, not the order of the clicks", () => {
    const selected = new Map([
      ["t:3", reply("old", "Speaker 3")],
      ["t:1", reply("old", "You")],
    ]);

    expect(
      orderSelectedReplies(selected, ORDER, ENTRIES).map((r) => r.text),
    ).toEqual(["on garde la date du 27 ?", "Parfait."]);
  });

  it("keeps an entry the transcript no longer lists, at the end", () => {
    const selected = new Map([
      ["gone", reply("Removed meanwhile", "Claire")],
      ["t:2", ENTRIES.get("t:2")!],
    ]);

    expect(
      orderSelectedReplies(selected, ORDER, ENTRIES).map((r) => r.text),
    ).toEqual([ENTRIES.get("t:2")!.text, "Removed meanwhile"]);
  });
});

describe("copySelectedReplies", () => {
  beforeEach(() => copyTextToClipboard.mockClear());

  it("copies a partial selection and counts the replies", async () => {
    const selected = new Map([
      ["t:2", ENTRIES.get("t:2")!],
      ["t:3", ENTRIES.get("t:3")!],
    ]);

    await copySelectedReplies(selected, ORDER, ENTRIES);

    expect(copyTextToClipboard).toHaveBeenCalledWith(
      "Claire: oui, à condition d'avoir la recette lundi.\n\n" +
        "Speaker 3: Parfait.",
      expect.objectContaining({ success: "2 replies copied" }),
    );
  });

  it("names a single reply in the singular", async () => {
    await copySelectedReplies(
      new Map([["t:1", ENTRIES.get("t:1")!]]),
      ORDER,
      ENTRIES,
    );

    expect(copyTextToClipboard).toHaveBeenCalledWith(
      "You: on garde la date du 27 ?",
      expect.objectContaining({ success: "1 reply copied" }),
    );
  });

  it("copies the whole transcript when every reply is selected", async () => {
    await copySelectedReplies(new Map(ENTRIES), ORDER, ENTRIES);

    const [text, messages] = copyTextToClipboard.mock.calls[0] as unknown as [
      string,
      { success: string },
    ];
    expect(text.split("\n\n")).toHaveLength(3);
    expect(text.startsWith("You: on garde")).toBe(true);
    expect(messages.success).toBe("Transcript copied");
  });
});
