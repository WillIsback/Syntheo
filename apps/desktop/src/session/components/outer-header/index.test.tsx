import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EditorView } from "~/store/zustand/tabs/schema";

vi.mock("../title-input", () => ({
  TitleInput: () => <input aria-label="Session title" placeholder="Untitled" />,
}));

vi.mock("~/session/queries", () => ({
  useSession: () => ({ folder_id: "" }),
  useFolderIcons: () => ({}),
  useFolderPaths: () => [],
  useUpdateSession: () => vi.fn(),
}));

vi.mock("./overflow", () => ({
  OverflowButton: () => <button type="button">More</button>,
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: vi.fn((selector: (state: unknown) => unknown) => selector({})),
}));

import { OuterHeader } from "./index";

function renderHeader(withTab = false) {
  const view = { type: "raw" } as EditorView;
  return render(
    <OuterHeader
      sessionId="session-1"
      currentView={view}
      tab={
        withTab
          ? {
              active: true,
              id: "session-1",
              pinned: false,
              slotId: "slot-1",
              state: { autoStart: null, view },
              type: "sessions",
            }
          : undefined
      }
    />,
  );
}

describe("OuterHeader", () => {
  afterEach(() => {
    cleanup();
  });

  // Commencer / terminer l'écoute passent par la capsule (document vivant) :
  // sans calendrier (issue 465), l'en-tête n'a plus d'action de réunion.
  it("only keeps the folder picker and the overflow menu", () => {
    renderHeader();

    expect(screen.getByRole("button", { name: "More" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Join & record" })).toBeNull();
    expect(screen.queryByText(/starts in/)).toBeNull();
  });

  // Le titre est maintenant en tête du document (serif 40px), plus dans
  // l'en-tête.
  it("never shows the title input in the header", () => {
    renderHeader(true);

    expect(screen.queryByRole("textbox", { name: "Session title" })).toBeNull();
  });
});
