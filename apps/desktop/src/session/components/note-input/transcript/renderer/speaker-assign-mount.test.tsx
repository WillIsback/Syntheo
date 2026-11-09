import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SpeakerAssignPopover } from "./speaker-assign";

import type { Segment } from "~/stt/live-segment";

// Popover Radix réel, seulement espionné : on vérifie que ni la racine
// Popover (contexte Popper) ni le contenu ne sont montés tant que l'étiquette
// n'est pas ouverte (issue 445).

const { popoverRootRenders } = vi.hoisted(() => ({
  popoverRootRenders: { count: 0 },
}));

vi.mock("@syntheo/ui/components/ui/popover", async () => {
  const actual = await vi.importActual<
    typeof import("@syntheo/ui/components/ui/popover")
  >("@syntheo/ui/components/ui/popover");
  const Popover = (props: Parameters<typeof actual.Popover>[0]) => {
    popoverRootRenders.count += 1;
    return <actual.Popover {...props} />;
  };
  return { ...actual, Popover };
});

vi.mock("~/contacts/queries", () => ({
  createHuman: vi.fn(),
  useHumans: () => [{ id: "human-1", name: "Alice", email: "" }],
}));

vi.mock("~/session/queries", () => ({
  addSessionParticipant: vi.fn(),
  useSession: () => ({ user_id: "user-1" }),
  useSessionParticipants: () => [],
}));

vi.mock("~/stt/queries", () => ({
  assignSessionTranscriptSpeaker: vi.fn(),
  assignTranscriptSpeaker: vi.fn(),
}));

beforeEach(() => {
  cleanup();
  popoverRootRenders.count = 0;
});

describe("SpeakerAssignPopover (montage à la demande)", () => {
  it("ne monte le Popover qu'à l'ouverture et rend le focus à la fermeture", async () => {
    const segment = createSegment();
    const { rerender } = render(
      <SpeakerAssignPopover
        segment={segment}
        transcriptId="transcript-1"
        sessionId="session-1"
        color="red"
        label="Speaker 2"
      />,
    );
    const rerenderLabel = () =>
      rerender(
        <SpeakerAssignPopover
          segment={segment}
          transcriptId="transcript-1"
          sessionId="session-1"
          color="blue"
          label="Speaker 2"
        />,
      );

    const trigger = screen.getByRole("button", { name: "Speaker 2" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(popoverRootRenders.count).toBe(0);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      document.querySelector("[data-radix-popper-content-wrapper]"),
    ).toBeNull();

    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(popoverRootRenders.count).toBeGreaterThan(0);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(dialog.id);
    expect(
      document.querySelector("[data-radix-popper-content-wrapper]"),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Alice" })).toBeTruthy();

    act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Escape",
      });
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(
      document.querySelector("[data-radix-popper-content-wrapper]"),
    ).toBeNull();

    // Une fois fermé, la racine est démontée : plus aucun rendu Popper.
    const rendersAfterClose = popoverRootRenders.count;
    rerenderLabel();
    expect(popoverRootRenders.count).toBe(rendersAfterClose);
  });

  it("referme le Popover au second clic sur l'étiquette", async () => {
    render(
      <SpeakerAssignPopover
        segment={createSegment()}
        transcriptId="transcript-1"
        sessionId="session-1"
        color="red"
        label="Speaker 2"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Speaker 2" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog");

    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});

function createSegment(): Segment {
  return {
    id: "segment-1",
    key: {
      channel: "RemoteParty",
      speaker_index: 2,
      speaker_human_id: null,
    },
    start_ms: 0,
    end_ms: 100,
    text: "hello",
    words: [
      {
        id: "word-1",
        text: "hello",
        start_ms: 0,
        end_ms: 100,
        channel: "RemoteParty",
        is_final: true,
      },
    ],
  } as Segment;
}
