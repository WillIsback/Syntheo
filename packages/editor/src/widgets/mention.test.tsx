import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  type MentionItem,
  mentionDescriptionClass,
  useMentionSearch,
} from "./mention";

function deferredSearch() {
  const pending = new Map<
    string,
    {
      resolve: (items: MentionItem[]) => void;
      reject: (error: Error) => void;
    }
  >();
  const handleSearch = (query: string) =>
    new Promise<MentionItem[]>((resolve, reject) => {
      pending.set(query, { resolve, reject });
    });
  return { pending, handleSearch };
}

function item(id: string): MentionItem {
  return { id, type: "human", label: id };
}

afterEach(cleanup);

describe("useMentionSearch", () => {
  it("ignores an older search resolving after a newer one", async () => {
    const { pending, handleSearch } = deferredSearch();
    const { result, rerender } = renderHook(
      ({ query }) => useMentionSearch(true, query, handleSearch),
      { initialProps: { query: "a" } },
    );

    rerender({ query: "ab" });
    await act(async () => {
      pending.get("ab")!.resolve([item("newer")]);
    });
    expect(result.current.items.map((i) => i.id)).toEqual(["newer"]);

    await act(async () => {
      pending.get("a")!.resolve([item("older")]);
    });
    expect(result.current.items.map((i) => i.id)).toEqual(["newer"]);
  });

  it("does not repopulate after the mention is dismissed or cleared", async () => {
    const { pending, handleSearch } = deferredSearch();
    const { result, rerender } = renderHook(
      ({ active, query }: { active: boolean; query: string | undefined }) =>
        useMentionSearch(active, query, handleSearch),
      { initialProps: { active: true, query: "a" } },
    );

    rerender({ active: false, query: undefined });
    expect(result.current.items).toEqual([]);

    await act(async () => {
      pending.get("a")!.resolve([item("stale")]);
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.selectedIndex).toBe(0);
  });
});

describe("mentionDescriptionClass", () => {
  it("garde entier le compteur des seules lignes de dossier (issue 815)", () => {
    const row = (type: string): MentionItem => ({
      id: type,
      type,
      label: "Carrelune RH",
      description: "3 réunions",
    });
    expect(mentionDescriptionClass(row("folder")).split(" ")).toContain(
      "mention-count",
    );
    for (const type of ["session", "human", "organization"]) {
      expect(mentionDescriptionClass(row(type))).toBe("mention-description");
    }
  });
});
