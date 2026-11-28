import { beforeEach, describe, expect, test, vi } from "vitest";

import { resolveSubtitleSpeakerHumans } from "./subtitle-import-speakers";

const { executeMock, createHumanMock, addSessionParticipantMock } = vi.hoisted(
  () => ({
    executeMock: vi.fn(),
    createHumanMock: vi.fn(),
    addSessionParticipantMock: vi.fn(),
  }),
);

vi.mock("~/db", () => ({
  liveQueryClient: { execute: executeMock },
}));

vi.mock("~/contacts/queries", () => ({
  createHuman: createHumanMock,
}));

vi.mock("~/session/queries", () => ({
  addSessionParticipant: addSessionParticipantMock,
}));

describe("resolveSubtitleSpeakerHumans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addSessionParticipantMock.mockResolvedValue(undefined);
  });

  test("reuses participants and contacts by name, creates the others", async () => {
    executeMock.mockResolvedValue([
      { id: "participant-alice", name: "Alice", is_participant: 1 },
      { id: "contact-alice", name: "alice", is_participant: 0 },
      { id: "contact-bruno", name: " Bruno ", is_participant: 0 },
    ]);
    createHumanMock.mockResolvedValue("new-chloe");

    const result = await resolveSubtitleSpeakerHumans({
      sessionId: "session-1",
      ownerUserId: "user-1",
      speakers: [
        { name: "Alice", speakerIndex: 0, anchorWordId: "word-1" },
        { name: "Bruno", speakerIndex: 1, anchorWordId: "word-2" },
        { name: "Chloé", speakerIndex: 2, anchorWordId: "word-3" },
      ],
    });

    expect(result).toEqual(
      new Map([
        ["alice", "participant-alice"],
        ["bruno", "contact-bruno"],
        ["chloé", "new-chloe"],
      ]),
    );
    expect(createHumanMock).toHaveBeenCalledTimes(1);
    expect(createHumanMock).toHaveBeenCalledWith({
      ownerUserId: "user-1",
      name: "Chloé",
      entryPoint: "speaker_assignment",
    });
    expect(addSessionParticipantMock.mock.calls).toEqual([
      ["session-1", "contact-bruno"],
      ["session-1", "new-chloe"],
    ]);
  });

  test("leaves a voice unlinked when its contact cannot be created", async () => {
    executeMock.mockResolvedValue([]);
    createHumanMock.mockRejectedValue(new Error("locked"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await resolveSubtitleSpeakerHumans({
      sessionId: "session-1",
      ownerUserId: "user-1",
      speakers: [{ name: "Alice", speakerIndex: 0, anchorWordId: "word-1" }],
    });

    expect(result.size).toBe(0);
    expect(addSessionParticipantMock).not.toHaveBeenCalled();
  });

  test("does not query contacts without voices", async () => {
    const result = await resolveSubtitleSpeakerHumans({
      sessionId: "session-1",
      ownerUserId: "user-1",
      speakers: [],
    });

    expect(result.size).toBe(0);
    expect(executeMock).not.toHaveBeenCalled();
  });
});
