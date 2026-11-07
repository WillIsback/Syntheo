import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SpeakerNamingBar } from "./bar";
import type { SpeakerCard } from "./speakers";
import {
  markSpeakerNamed,
  requestSpeakerNaming,
  useSpeakerNamingStore,
} from "./store";

const mocks = vi.hoisted(() => ({
  cards: [] as SpeakerCard[],
  ready: true,
  listening: false,
  isGenerating: false,
  onRegenerate: vi.fn(),
  dialogProps: [] as Array<{
    open: boolean;
    cards: SpeakerCard[];
    onOpenChange: (open: boolean) => void;
  }>,
}));

vi.mock("./use-speaker-cards", () => ({
  useSpeakerCards: () => ({ cards: mocks.cards, ready: mocks.ready }),
}));

vi.mock("./dialog", () => ({
  SpeakerNamingDialog: (props: (typeof mocks.dialogProps)[number]) => {
    mocks.dialogProps.push(props);
    return props.open ? (
      <div role="dialog">{props.cards.map((card) => card.id).join(",")}</div>
    ) : null;
  },
}));

vi.mock("~/session/components/note-input/enhanced-actions", () => ({
  useEnhancedNoteActions: () => ({
    isGenerating: mocks.isGenerating,
    onRegenerate: mocks.onRegenerate,
  }),
}));

vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({
      live: {
        sessionId: mocks.listening ? "session-1" : null,
        status: mocks.listening ? "active" : "inactive",
      },
    }),
}));

function card(id: string): SpeakerCard {
  return {
    id,
    transcriptId: "t1",
    number: id.slice(-1),
    part: null,
    turns: 3,
    excerpts: ["Bonjour."],
    targets: [],
  };
}

function renderBar(summaryMarkdown = "Compte rendu sans locuteur.") {
  return render(
    <SpeakerNamingBar
      sessionId="session-1"
      enhancedNoteId="note-1"
      summaryMarkdown={summaryMarkdown}
    />,
  );
}

describe("SpeakerNamingBar", () => {
  beforeEach(() => {
    mocks.cards = [];
    mocks.ready = true;
    mocks.listening = false;
    mocks.isGenerating = false;
    mocks.onRegenerate.mockReset();
    mocks.dialogProps = [];
    useSpeakerNamingStore.setState({
      available: null,
      requested: null,
      named: {},
    });
  });

  afterEach(() => cleanup());

  it("stays out of the way when every speaker has a name", () => {
    const { container } = renderBar();

    expect(container.textContent).toBe("");
    expect(useSpeakerNamingStore.getState().available).toBeNull();
  });

  it("shows a discreet reminder and opens the panel on click", () => {
    mocks.cards = [card("t1:Speaker 1"), card("t1:Speaker 2")];
    renderBar();

    expect(screen.getByText(/speakers to name/)).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Name speakers" }));

    expect(screen.getByRole("dialog").textContent).toBe(
      "t1:Speaker 1,t1:Speaker 2",
    );
  });

  it("offers the palette command while anonymous speakers remain", () => {
    mocks.cards = [card("t1:Speaker 1")];
    const { unmount } = renderBar();

    expect(useSpeakerNamingStore.getState().available).toEqual({
      sessionId: "session-1",
      count: 1,
    });
    unmount();
    expect(useSpeakerNamingStore.getState().available).toBeNull();
  });

  it("opens the panel when the palette asks for it", () => {
    mocks.cards = [card("t1:Speaker 1")];
    renderBar();

    act(() => requestSpeakerNaming("session-1"));

    expect(screen.getByRole("dialog")).not.toBeNull();
    // La demande est levée à la fermeture du panneau.
    const { onOpenChange } = mocks.dialogProps[mocks.dialogProps.length - 1]!;
    act(() => onOpenChange(false));
    expect(useSpeakerNamingStore.getState().requested).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not offer to regenerate before any name was given", () => {
    mocks.cards = [card("t1:Speaker 1")];
    renderBar("Le locuteur 1 propose un vote.");

    expect(
      screen.queryByRole("button", { name: "Regenerate summary with names" }),
    ).toBeNull();
  });

  it("offers to regenerate, never on its own, once names were given", () => {
    mocks.cards = [card("t1:Speaker 2")];
    renderBar("Le locuteur 1 propose un vote.");
    act(() => markSpeakerNamed("session-1"));

    const regenerate = screen.getByRole("button", {
      name: "Regenerate summary with names",
    });
    expect(mocks.onRegenerate).not.toHaveBeenCalled();

    fireEvent.click(regenerate);

    expect(mocks.onRegenerate).toHaveBeenCalledWith(null);
    expect(useSpeakerNamingStore.getState().named["session-1"]).toBeUndefined();
  });

  it("offers to regenerate when everyone is named but the summary is not", () => {
    renderBar("- **Speaker 2** : accord");

    expect(
      screen.getByText("The summary still mentions unnamed speakers."),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Regenerate summary with names" }),
    ).not.toBeNull();
  });

  it("hides the proposal while a summary is being generated", () => {
    mocks.isGenerating = true;
    renderBar("- **Speaker 2** : accord");

    expect(
      screen.queryByRole("button", { name: "Regenerate summary with names" }),
    ).toBeNull();
  });
});
