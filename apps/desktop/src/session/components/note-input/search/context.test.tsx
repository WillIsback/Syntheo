import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Options = { enabled?: boolean };

const hoisted = vi.hoisted(() => ({
  hotkeys: new Map<
    string,
    { callback: (event: KeyboardEvent) => void; options: Options }
  >(),
}));

vi.mock("react-hotkeys-hook", () => ({
  useHotkeys: (
    keys: string,
    callback: (event: KeyboardEvent) => void,
    options: Options,
  ) => {
    hoisted.hotkeys.set(keys, { callback, options });
  },
}));

vi.mock("./matching", () => {
  const element = () => {
    const node = document.createElement("span");
    node.scrollIntoView = vi.fn();
    return node;
  };
  return {
    findSearchContainer: () => document.body,
    getMatchingElements: () => [
      { element: element(), id: null },
      { element: element(), id: null },
      { element: element(), id: null },
    ],
  };
});

import { SearchProvider, useSearch } from "./context";

function Probe() {
  const search = useSearch();
  return (
    <div>
      <span data-testid="visible">{String(search?.isVisible)}</span>
      <span data-testid="select">{search?.selectRequest}</span>
      <span data-testid="index">{search?.currentMatchIndex}</span>
      <button type="button" onClick={() => search?.setQuery("mot")}>
        query
      </button>
    </div>
  );
}

function press(keys: string) {
  const hotkey = hoisted.hotkeys.get(keys);
  expect(hotkey, keys).toBeDefined();
  if (hotkey?.options.enabled === false) {
    return;
  }
  act(() => hotkey?.callback(new KeyboardEvent("keydown")));
}

describe("SearchProvider (issue 372)", () => {
  beforeEach(() => hoisted.hotkeys.clear());
  afterEach(() => cleanup());

  it("Ctrl+F ouvre la barre et un second appui resélectionne au lieu de fermer", () => {
    render(
      <SearchProvider>
        <Probe />
      </SearchProvider>,
    );

    press("mod+f");
    expect(screen.getByTestId("visible").textContent).toBe("true");
    expect(screen.getByTestId("select").textContent).toBe("1");

    press("mod+f");
    expect(screen.getByTestId("visible").textContent).toBe("true");
    expect(screen.getByTestId("select").textContent).toBe("2");

    press("esc");
    expect(screen.getByTestId("visible").textContent).toBe("false");
  });

  it("F3 et Maj+F3 passent à l'occurrence suivante et précédente", () => {
    render(
      <SearchProvider>
        <Probe />
      </SearchProvider>,
    );

    expect(hoisted.hotkeys.get("f3")?.options.enabled).toBe(false);

    press("mod+f");
    act(() => screen.getByRole("button", { name: "query" }).click());
    expect(hoisted.hotkeys.get("f3")?.options.enabled).toBe(true);

    press("f3");
    expect(screen.getByTestId("index").textContent).toBe("1");
    press("f3");
    expect(screen.getByTestId("index").textContent).toBe("2");
    press("shift+f3");
    expect(screen.getByTestId("index").textContent).toBe("1");
  });
});
