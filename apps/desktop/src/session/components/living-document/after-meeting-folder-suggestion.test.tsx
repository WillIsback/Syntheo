import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AfterMeetingFolderSuggestion } from "./after-meeting-folder-suggestion";

import { resetFolderSuggestionOffersForTests } from "~/folders/suggestion/offers";

const mocks = vi.hoisted(() => ({
  folderPath: "",
  updateSession: vi.fn(async (_changes: { folder_id: string }) => {}),
  loadFolderSuggestion: vi.fn(async (_sessionId: string) => ({
    folderPath: "Clients/Atlas",
    reasons: ["title", "participants"] as ("title" | "participants")[],
    score: 3,
  })),
}));

vi.mock("~/session/queries", () => ({
  useSession: () => ({ folder_id: mocks.folderPath }),
  useUpdateSession: () => mocks.updateSession,
}));
vi.mock("~/folders/suggestion/load", () => ({
  loadFolderSuggestion: mocks.loadFolderSuggestion,
}));
vi.mock("~/session/components/folder-picker", () => ({
  FolderPickerContent: ({ suggestedPath }: { suggestedPath: string }) => (
    <div data-testid="folder-picker">{suggestedPath}</div>
  ),
}));

type Stage = "prepare" | "listen" | "synthesis";

function renderNote(stage: Stage, enabled = true, sessionId = "note-1") {
  const view = render(
    <AfterMeetingFolderSuggestion
      sessionId={sessionId}
      stage={stage}
      enabled={enabled}
    />,
  );
  return {
    ...view,
    setStage: (next: Stage) =>
      view.rerender(
        <AfterMeetingFolderSuggestion
          sessionId={sessionId}
          stage={next}
          enabled={enabled}
        />,
      ),
  };
}

const banner = () => screen.queryByText(/This meeting looks like/);

beforeEach(() => {
  mocks.folderPath = "";
  mocks.updateSession.mockClear();
  mocks.loadFolderSuggestion.mockClear();
  resetFolderSuggestionOffersForTests();
});

afterEach(cleanup);

describe("AfterMeetingFolderSuggestion", () => {
  it("offers the folder when listening stops, with its reasons", async () => {
    const { setStage } = renderNote("listen");
    expect(banner()).toBeNull();
    setStage("synthesis");

    await waitFor(() => expect(banner()).not.toBeNull());
    expect(banner()?.textContent).toBe(
      "This meeting looks like Atlas (same title / same participants)",
    );
    expect(mocks.loadFolderSuggestion).toHaveBeenCalledWith("note-1");
    // Afficher la proposition n'écrit rien.
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it("does not compute anything when a note is opened in the synthesis", async () => {
    renderNote("synthesis");
    await act(async () => {});
    expect(mocks.loadFolderSuggestion).not.toHaveBeenCalled();
    expect(banner()).toBeNull();
  });

  it("appears only once per note", async () => {
    const first = renderNote("listen");
    first.setStage("synthesis");
    await waitFor(() => expect(banner()).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Ignore" }));
    expect(banner()).toBeNull();

    // Nouvelle écoute de la même note, puis note rouverte : plus rien.
    first.setStage("listen");
    first.setStage("synthesis");
    first.unmount();
    const second = renderNote("listen");
    second.setStage("synthesis");
    await act(async () => {});
    expect(mocks.loadFolderSuggestion).toHaveBeenCalledTimes(1);
    expect(banner()).toBeNull();
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it("files the note only when « File it » is clicked", async () => {
    const { setStage } = renderNote("listen");
    setStage("synthesis");
    await waitFor(() => expect(banner()).not.toBeNull());
    expect(mocks.updateSession).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "File it" }));
    expect(mocks.updateSession).toHaveBeenCalledExactlyOnceWith({
      folder_id: "Clients/Atlas",
    });
    expect(banner()).toBeNull();
  });

  it("opens the folder picker with the suggestion on « Choose… » without filing", async () => {
    const { setStage } = renderNote("listen");
    setStage("synthesis");
    await waitFor(() => expect(banner()).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Choose…" }));
    expect((await screen.findByTestId("folder-picker")).textContent).toBe(
      "Clients/Atlas",
    );
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it("stays silent while the measured precision is below the threshold", async () => {
    const { setStage } = renderNote("listen", false);
    setStage("synthesis");
    await act(async () => {});
    expect(mocks.loadFolderSuggestion).not.toHaveBeenCalled();
    expect(banner()).toBeNull();
  });

  it("hides the offer once the note is filed elsewhere", async () => {
    const { setStage, rerender } = renderNote("listen");
    setStage("synthesis");
    await waitFor(() => expect(banner()).not.toBeNull());

    mocks.folderPath = "Interne";
    rerender(
      <AfterMeetingFolderSuggestion
        sessionId="note-1"
        stage="synthesis"
        enabled
      />,
    );
    expect(banner()).toBeNull();
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });
});
