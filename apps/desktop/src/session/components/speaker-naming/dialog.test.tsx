import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SpeakerNamingDialog } from "./dialog";
import type { SpeakerCard } from "./speakers";
import { useSpeakerNamingStore } from "./store";

import type { SpeakerParticipantOption } from "~/session/components/note-input/transcript/renderer/speaker-participants";

const mocks = vi.hoisted(() => ({
  assignTranscriptSpeaker: vi.fn(),
  resolveHumanId: vi.fn(),
  participants: [] as SpeakerParticipantOption[],
  contacts: [] as SpeakerParticipantOption[],
}));

vi.mock("~/stt/queries", () => ({
  assignTranscriptSpeaker: mocks.assignTranscriptSpeaker,
}));

vi.mock("~/contacts/contact-avatar", () => ({ ContactImage: () => null }));
vi.mock("~/contacts/shared", () => ({ ContactFacehash: () => null }));

vi.mock(
  "~/session/components/note-input/transcript/renderer/speaker-participants",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/session/components/note-input/transcript/renderer/speaker-participants")
      >();
    return {
      ...actual,
      useSpeakerParticipants: () => ({
        participants: mocks.participants,
        eventParticipants: [],
        contacts: mocks.contacts,
        resolveHumanId: mocks.resolveHumanId,
      }),
    };
  },
);

function card(overrides: Partial<SpeakerCard> = {}): SpeakerCard {
  return {
    id: "t1:Speaker 1",
    transcriptId: "t1",
    number: "1",
    part: null,
    turns: 12,
    excerpts: [
      "Le budget de la médiathèque doit être revu.",
      "Nous ouvrirons le samedi matin.",
    ],
    targets: [
      {
        key: {
          channel: "MixedCapture",
          speaker_index: 0,
          speaker_human_id: null,
        },
        wordIds: ["w1", "w2"],
      },
    ],
    ...overrides,
  };
}

const marie: SpeakerParticipantOption = {
  id: "marie",
  name: "Marie Dupont",
  isSessionParticipant: true,
};

function renderDialog(cards: SpeakerCard[]) {
  return render(
    <SpeakerNamingDialog
      sessionId="session-1"
      cards={cards}
      open
      onOpenChange={() => {}}
    />,
  );
}

function inputs() {
  return screen.getAllByRole("combobox") as HTMLInputElement[];
}

describe("SpeakerNamingDialog", () => {
  beforeEach(() => {
    mocks.assignTranscriptSpeaker.mockReset().mockResolvedValue(undefined);
    mocks.resolveHumanId
      .mockReset()
      .mockImplementation(async (option: SpeakerParticipantOption) =>
        option.isNew ? "created-human" : option.id,
      );
    mocks.participants = [marie];
    mocks.contacts = [];
    useSpeakerNamingStore.setState({
      available: null,
      requested: null,
      named: {},
    });
  });

  afterEach(() => cleanup());

  // Le nombre d'interventions est un pluriel ICU : les tests rendent le
  // message source sans catalogue, son calcul est couvert par speakers.test.
  it("shows each speaker with two quoted excerpts", () => {
    renderDialog([card()]);

    const item = screen.getByRole("listitem", { name: "Speaker 1" });
    expect(
      within(item).getByText("“Le budget de la médiathèque doit être revu.”"),
    ).not.toBeNull();
    expect(
      within(item).getByText("“Nous ouvrirons le samedi matin.”"),
    ).not.toBeNull();
    expect(within(item).getByLabelText("Who is it?")).not.toBeNull();
  });

  it("names the capture part only when the note has several captures", () => {
    renderDialog([
      card({ id: "t2:Speaker 1", transcriptId: "t2", part: 2 }),
      card({ id: "t1:Speaker 1", part: 1, turns: 1 }),
    ]);

    expect(
      screen.getByRole("heading", { name: "Speaker 1 · part 2" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Speaker 1 · part 1" }),
    ).not.toBeNull();
  });

  it("does not mention a part for a single capture", () => {
    renderDialog([card()]);

    expect(screen.getByRole("heading", { name: "Speaker 1" })).not.toBeNull();
    expect(screen.queryByText(/part/)).toBeNull();
  });

  it("assigns the highlighted participant on Enter, in that capture only", async () => {
    renderDialog([card(), card({ id: "t1:Speaker 2", number: "2" })]);
    const [first] = inputs();
    first!.focus();
    fireEvent.change(first!, { target: { value: "mar" } });
    expect(screen.getByRole("option", { name: /Marie Dupont/ })).not.toBeNull();

    fireEvent.keyDown(first!, { key: "Enter" });

    await waitFor(() =>
      expect(mocks.assignTranscriptSpeaker).toHaveBeenCalledWith({
        transcriptId: "t1",
        segmentKey: {
          channel: "MixedCapture",
          speaker_index: 0,
          speaker_human_id: null,
        },
        humanId: "marie",
        anchorWordId: "w1",
        mode: "all",
        wordIds: ["w1", "w2"],
      }),
    );
    expect(await screen.findByText("Assigned to Marie Dupont")).not.toBeNull();
    expect(useSpeakerNamingStore.getState().named["session-1"]).toBe(true);
    // Entrée valide et passe au locuteur suivant, sans le pré-remplir.
    await waitFor(() => expect(document.activeElement).toBe(inputs()[1]));
    expect(inputs()[1]!.value).toBe("");
  });

  it("creates a new person on the fly", async () => {
    renderDialog([card()]);
    const [input] = inputs();
    input!.focus();
    fireEvent.change(input!, { target: { value: "Jean Neuf" } });

    const create = screen.getByRole("option", { name: "Create “Jean Neuf”" });
    fireEvent.click(create);

    await waitFor(() =>
      expect(mocks.resolveHumanId).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Jean Neuf", isNew: true }),
      ),
    );
    await waitFor(() =>
      expect(mocks.assignTranscriptSpeaker).toHaveBeenCalledWith(
        expect.objectContaining({ humanId: "created-human" }),
      ),
    );
    expect(await screen.findByText("Assigned to Jean Neuf")).not.toBeNull();
  });

  it("navigates suggestions with the arrow keys", async () => {
    mocks.contacts = [
      { id: "marc", name: "Marc Martin", isSessionParticipant: false },
    ];
    renderDialog([card()]);
    const [input] = inputs();
    input!.focus();
    fireEvent.change(input!, { target: { value: "mar" } });
    fireEvent.keyDown(input!, { key: "ArrowDown" });

    expect(
      screen
        .getByRole("option", { name: /Marc Martin/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.keyDown(input!, { key: "Enter" });

    await waitFor(() =>
      expect(mocks.assignTranscriptSpeaker).toHaveBeenCalledWith(
        expect.objectContaining({ humanId: "marc" }),
      ),
    );
  });

  it("ignores Enter on an empty field and lists people only on demand", () => {
    renderDialog([card()]);
    const [input] = inputs();
    input!.focus();

    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(input!, { key: "Enter" });
    expect(mocks.resolveHumanId).not.toHaveBeenCalled();

    fireEvent.keyDown(input!, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Marie Dupont/ })).not.toBeNull();
    fireEvent.keyDown(input!, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("keeps the name field as the only Tab stop of a card", () => {
    renderDialog([card(), card({ id: "t1:Speaker 2", number: "2" })]);

    for (const item of screen.getAllByRole("listitem", { name: /Speaker/ })) {
      const focusable = item.querySelectorAll(
        "input, button, a[href], [tabindex]:not([tabindex='-1'])",
      );
      expect(focusable).toHaveLength(1);
      expect(focusable[0]?.getAttribute("role")).toBe("combobox");
    }
  });

  it("assigns only the words of a speaker without index", async () => {
    renderDialog([
      card({
        targets: [
          {
            key: {
              channel: "RemoteParty",
              speaker_index: null,
              speaker_human_id: null,
            },
            wordIds: ["w7", "w8"],
          },
        ],
      }),
    ]);
    const [input] = inputs();
    input!.focus();
    fireEvent.change(input!, { target: { value: "Marie" } });
    fireEvent.keyDown(input!, { key: "Enter" });

    await waitFor(() =>
      expect(mocks.assignTranscriptSpeaker).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "segment", wordIds: ["w7", "w8"] }),
      ),
    );
  });

  it("reports a failed save without closing the panel", async () => {
    mocks.assignTranscriptSpeaker.mockRejectedValueOnce(new Error("locked"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderDialog([card()]);
    const [input] = inputs();
    input!.focus();
    fireEvent.change(input!, { target: { value: "Marie" } });
    fireEvent.keyDown(input!, { key: "Enter" });

    expect(
      await screen.findByText("The name could not be saved. Try again."),
    ).not.toBeNull();
    expect(screen.queryByText(/Assigned to/)).toBeNull();
  });
});
