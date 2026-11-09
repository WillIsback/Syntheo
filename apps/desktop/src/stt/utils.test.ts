import { describe, expect, it } from "vitest";

import type { LiveTranscriptDelta } from "@syntheo/plugin-transcription";

import {
  legacyHint,
  liveDelta,
  liveWord,
  providerHint,
  segmentHint,
  speakerHint,
  type StoredHint,
  word,
} from "./test-fixtures";
import type { SpeakerHintWithId, WordWithId } from "./types";
import {
  createTranscriptAccumulator,
  findSpeakerAssignmentAnchorWordId,
  mergeTranscriptSegmentAssignments,
  updateTranscriptHints,
  upsertSpeakerAssignment,
} from "./utils";

import type { SegmentKey } from "~/stt/live-segment";

const TRANSCRIPT = "transcript-1";

function createStore(row: { words?: unknown[]; hints?: unknown[] } = {}) {
  const transcript = {
    words: JSON.stringify(row.words ?? []),
    speaker_hints: JSON.stringify(row.hints ?? []),
  };
  const getCellCalls: string[] = [];

  return {
    getCellCalls,
    readCell: (cellId: "words" | "speaker_hints") => transcript[cellId],
    getCell: (
      tableId: "transcripts",
      rowId: string,
      cellId: "words" | "speaker_hints",
    ) => {
      if (tableId !== "transcripts" || rowId !== TRANSCRIPT) {
        return undefined;
      }
      getCellCalls.push(cellId);
      return transcript[cellId];
    },
    setCell: (
      tableId: "transcripts",
      rowId: string,
      cellId: "words" | "speaker_hints",
      value: string,
    ) => {
      if (tableId !== "transcripts" || rowId !== TRANSCRIPT) {
        return;
      }
      transcript[cellId] = value;
    },
  };
}

type Store = ReturnType<typeof createStore>;

const storedHints = (store: Store): StoredHint[] =>
  JSON.parse(store.readCell("speaker_hints"));
const userAssignments = (store: Store) =>
  storedHints(store).filter((hint) => hint.type === "user_speaker_assignment");

function remoteSpeakerKey(
  speakerIndex: number | null,
  speakerHumanId: string | null = null,
): SegmentKey {
  return {
    channel: "RemoteParty",
    speaker_index: speakerIndex,
    speaker_human_id: speakerHumanId,
  } as SegmentKey;
}

function accumulate(
  store: Store,
  deltas: LiveTranscriptDelta[],
  initial?: { words: WordWithId[]; hints: SpeakerHintWithId[] },
) {
  const accumulator = createTranscriptAccumulator(store, TRANSCRIPT, initial);
  for (const delta of deltas) accumulator.applyLiveDelta(delta);
  accumulator.dispose();
}

const helloThere = [word("word-1", 0), word("word-2", 100)];

describe("TranscriptAccumulator", () => {
  it("applies live deltas without rereading newly-created transcript JSON", () => {
    const store = createStore();
    accumulate(
      store,
      [
        liveDelta([liveWord("word-1", 100, 200, 0, 1, "hello")]),
        liveDelta(
          [liveWord("word-2", 100, 220, 0, undefined, "hello")],
          ["word-1"],
        ),
      ],
      { words: [], hints: [] },
    );

    expect(store.getCellCalls).toEqual([]);
    expect(JSON.parse(store.readCell("words"))).toEqual([
      word("word-2", 100, 220, 0, "hello"),
    ]);
    expect(storedHints(store)).toEqual([]);
  });

  it.each([
    {
      name: "keeps segment word ids current when a scoped word is replaced",
      delta: liveDelta([liveWord("word-2b", 100, 220)], ["word-2"]),
      expected: segmentHint("word-1", "human-1", ["word-1", "word-2b"]),
    },
    {
      name: "moves a segment assignment anchor when the anchor word is replaced",
      delta: liveDelta(
        [liveWord("word-1b", 0, 110), liveWord("word-2b", 110, 220)],
        ["word-1", "word-2"],
      ),
      expected: segmentHint("word-1b", "human-1", ["word-1b", "word-2b"]),
    },
  ])("$name", ({ delta, expected }) => {
    const store = createStore();
    accumulate(store, [delta], {
      words: helloThere,
      hints: [segmentHint("word-1", "human-1", ["word-1", "word-2"])],
    });
    expect(storedHints(store)).toEqual([expected]);
  });

  it.each([false, true])(
    "does not expand an unindexed assignment as live words arrive (replacement: %s)",
    (replace) => {
      const store = createStore({ words: [word("selected", 0, 100, 2)] });
      upsertSpeakerAssignment(
        store,
        TRANSCRIPT,
        { channel: "MixedCapture", speaker_index: null },
        "alice",
        "selected",
        { mode: "segment", wordIds: ["selected"] },
      );
      accumulate(store, [
        liveDelta(
          [
            ...(replace ? [liveWord("replacement", 0, 100, 2)] : []),
            liveWord("other", 100, 200, 2),
          ],
          replace ? ["selected"] : [],
        ),
      ]);

      expect(JSON.parse(storedHints(store)[0]!.value).word_ids).toEqual([
        replace ? "replacement" : "selected",
      ]);
    },
  );

  it("keeps reconstructed indexed word selections fixed during live persistence", () => {
    const words = ["first", "other", "last"].map((id, index) =>
      word(id, index * 100, index * 100 + 100, 1),
    );
    const store = createStore({
      words,
      hints: words.map((stored) => providerHint(stored.id, 1, 0)),
    });
    upsertSpeakerAssignment(
      store,
      TRANSCRIPT,
      remoteSpeakerKey(0),
      "alice",
      "first",
      { mode: "segment", wordIds: ["first", "last"], extendToAdjacent: false },
    );
    accumulate(store, [liveDelta([liveWord("appended", 300, 400, 1, 0)])]);

    expect(JSON.parse(userAssignments(store)[0]!.value).word_ids).toEqual([
      "first",
      "last",
    ]);
  });

  const continuingSegment = {
    words: helloThere,
    hints: [
      providerHint("word-1", 0, 2),
      providerHint("word-2", 0, 2),
      segmentHint("word-1", "human-1", ["word-1", "word-2"]),
    ],
  };

  it("adds appended live words to a continuing segment assignment", () => {
    const store = createStore();
    accumulate(
      store,
      [liveDelta([liveWord("word-3", 200, 300, 0, 2)])],
      continuingSegment,
    );

    expect(storedHints(store)).toEqual([
      providerHint("word-1", 0, 2),
      segmentHint("word-1", "human-1", ["word-1", "word-2", "word-3"]),
      providerHint("word-2", 0, 2),
      providerHint("word-3", 0, 2),
    ]);
  });

  it("does not add unrelated words from the same live delta to a segment assignment", () => {
    const store = createStore();
    accumulate(
      store,
      [
        liveDelta([
          liveWord("word-3", 200, 300, 0, 2),
          liveWord("word-4", 300, 400, 0, 3),
          liveWord("word-5", 400, 500, 0, 2),
        ]),
      ],
      continuingSegment,
    );

    const assignment = storedHints(store).find(
      (hint) => hint.id === "word-1:user_speaker_assignment:segment",
    );
    expect(JSON.parse(assignment!.value).word_ids).toEqual([
      "word-1",
      "word-2",
      "word-3",
    ]);
  });

  it("appends batch chunks without reparsing stored words and hints", () => {
    const existing = word("existing-word", 0);
    const store = createStore({ words: [existing] });
    const accumulator = createTranscriptAccumulator(store, TRANSCRIPT);

    accumulator.appendWordsAndHints([word("word-1", 100)], []);
    accumulator.appendWordsAndHints([word("word-2", 200)], []);
    accumulator.dispose();

    expect(store.getCellCalls).toEqual(["words", "speaker_hints"]);
    expect(JSON.parse(store.readCell("words"))).toEqual([
      existing,
      word("word-1", 100),
      word("word-2", 200),
    ]);
  });

  it("preserves live speaker assignments made while an accumulator is active", () => {
    const store = createStore();
    const accumulator = createTranscriptAccumulator(store, TRANSCRIPT, {
      words: [],
      hints: [],
    });

    accumulator.applyLiveDelta(liveDelta([liveWord("word-1", 0, 100, 1, 2)]));
    upsertSpeakerAssignment(
      store,
      TRANSCRIPT,
      remoteSpeakerKey(2),
      "human-1",
      "word-1",
    );
    accumulator.applyLiveDelta(liveDelta([liveWord("word-2", 100, 200, 1, 2)]));
    accumulator.dispose();

    expect(storedHints(store)).toEqual([
      providerHint("word-1", 1, 2),
      speakerHint("word-1", "human-1", 1, 2),
      providerHint("word-2", 1, 2),
    ]);
  });

  it("preserves a live speaker assignment while its anchor word is persisted", () => {
    const assignment = speakerHint("word-1", "human-1", 1, 2);
    const store = createStore({ hints: [assignment] });
    accumulate(store, [liveDelta([liveWord("word-1", 0, 100, 1, 2)])]);

    expect(storedHints(store)).toEqual([
      assignment,
      providerHint("word-1", 1, 2),
    ]);
  });

  it("does not restore externally removed speaker assignments from the accumulator cache", () => {
    const store = createStore();
    const accumulator = createTranscriptAccumulator(store, TRANSCRIPT, {
      words: [],
      hints: [],
    });

    accumulator.applyLiveDelta(liveDelta([liveWord("word-1", 0, 100, 1, 2)]));
    upsertSpeakerAssignment(
      store,
      TRANSCRIPT,
      remoteSpeakerKey(2),
      "human-1",
      "word-1",
    );
    accumulator.applyLiveDelta(liveDelta([liveWord("word-2", 100, 200, 1, 2)]));
    updateTranscriptHints(
      store,
      TRANSCRIPT,
      storedHints(store).filter(
        (hint) => hint.type !== "user_speaker_assignment",
      ) as SpeakerHintWithId[],
    );
    accumulator.applyLiveDelta(liveDelta([liveWord("word-3", 200, 300, 1, 2)]));
    accumulator.dispose();

    expect(storedHints(store)).toEqual([
      providerHint("word-1", 1, 2),
      providerHint("word-2", 1, 2),
      providerHint("word-3", 1, 2),
    ]);
  });
});

describe("findSpeakerAssignmentAnchorWordId", () => {
  it("finds the matching speaker in a resumed transcript", () => {
    expect(
      findSpeakerAssignmentAnchorWordId(
        [
          word("speaker-1-word", 0, 100, 1),
          word("speaker-2-word", 100, 200, 1),
        ],
        [
          providerHint("speaker-1-word", 1, 1),
          providerHint("speaker-2-word", 1, 2),
        ] as SpeakerHintWithId[],
        remoteSpeakerKey(2),
      ),
    ).toBe("speaker-2-word");
  });
});

describe("upsertSpeakerAssignment", () => {
  it.each(["DirectMic", "RemoteParty", "MixedCapture"] as const)(
    "limits an unindexed %s assignment to the selected words",
    (channel) => {
      const store = createStore();
      upsertSpeakerAssignment(
        store,
        TRANSCRIPT,
        { channel, speaker_index: null, speaker_human_id: null },
        "alice",
        "word-1",
        { mode: "all", wordIds: ["word-1", "word-2"] },
      );

      const hints = storedHints(store);
      expect(hints).toHaveLength(1);
      expect(JSON.parse(hints[0]!.value)).toEqual({
        human_id: "alice",
        scope: "segment",
        word_ids: ["word-1", "word-2"],
        extend_to_adjacent: false,
      });
    },
  );

  it.each(["segment", "all"] as const)(
    "preserves untouched word overrides when assigning %s scope",
    (mode) => {
      const store = createStore({
        words: [word("word-1", 0, 100, 1), word("word-2", 100, 200, 1)],
        hints: [
          providerHint("word-1", 1, 0),
          providerHint("word-2", 1, 1),
          segmentHint("word-1", "alice", ["word-1", "word-2"]),
        ],
      });

      upsertSpeakerAssignment(
        store,
        TRANSCRIPT,
        remoteSpeakerKey(0),
        "bob",
        "word-1",
        { mode, wordIds: ["word-1"] },
      );

      expect(storedHints(store)).toContainEqual(
        segmentHint("word-2", "alice", ["word-2"]),
      );
      expect(userAssignments(store)).toHaveLength(2);
    },
  );

  it("matches the rendered channel and latest provider index when replacing word overrides", () => {
    const store = createStore({
      words: [word("word-1", 0, 100, 1)],
      hints: [
        providerHint("word-1", 1, 0, "old-provider"),
        providerHint("word-1", 2, 7, "new-provider"),
        segmentHint("word-1", "alice", ["word-1"], "override"),
      ],
    });

    upsertSpeakerAssignment(
      store,
      TRANSCRIPT,
      { channel: "MixedCapture", speaker_index: 7 },
      "bob",
      "word-1",
    );

    const assignments = userAssignments(store);
    expect(assignments).toHaveLength(1);
    expect(JSON.parse(assignments[0]!.value)).toEqual({
      human_id: "bob",
      scope: "speaker",
      channel: 2,
      speaker_index: 7,
    });
    expect(JSON.parse(store.readCell("words"))[0].channel).toBe(1);
  });

  // Attribution d'un locuteur entier (canal distant, index 2) par « bob ».
  it.each([
    {
      name: "removes a conflicting automatic assignment",
      words: [word("word-1", 0, 100, 1)],
      hints: [
        providerHint("word-1", 1, 2),
        legacyHint("word-1", "alice", "automatic_speaker_assignment"),
      ],
      anchor: "word-1",
      expected: [
        providerHint("word-1", 1, 2),
        speakerHint("word-1", "bob", 1, 2),
      ],
    },
    {
      name: "removes a stale channel-wide assignment",
      words: [word("old-word", 0, 100, 1), word("new-word", 100, 200, 1)],
      hints: [legacyHint("old-word", "alice"), providerHint("new-word", 1, 2)],
      anchor: "new-word",
      expected: [
        providerHint("new-word", 1, 2),
        speakerHint("new-word", "bob", 1, 2),
      ],
    },
    {
      name: "keeps other speaker assignments on the same channel",
      words: [
        word("speaker-1-word", 0, 100, 1),
        word("speaker-2-word-old", 100, 200, 1),
        word("speaker-2-word-new", 200, 300, 1),
      ],
      hints: [
        providerHint("speaker-1-word", 1, 1),
        legacyHint("speaker-1-word", "alice"),
        providerHint("speaker-2-word-old", 1, 2),
        legacyHint("speaker-2-word-old", "carol"),
        providerHint("speaker-2-word-new", 1, 2),
      ],
      anchor: "speaker-2-word-new",
      expected: [
        providerHint("speaker-1-word", 1, 1),
        legacyHint("speaker-1-word", "alice"),
        providerHint("speaker-2-word-old", 1, 2),
        providerHint("speaker-2-word-new", 1, 2),
        speakerHint("speaker-2-word-new", "bob", 1, 2),
      ],
    },
    {
      name: "removes segment overrides when assigning the full matching speaker",
      words: [word("word-1", 0, 100, 1)],
      hints: [
        providerHint("word-1", 1, 2),
        segmentHint("word-1", "alice", ["word-1"]),
      ],
      anchor: "word-1",
      expected: [
        providerHint("word-1", 1, 2),
        speakerHint("word-1", "bob", 1, 2),
      ],
    },
    {
      name: "keeps segment overrides without speaker identity",
      words: [word("word-1", 0, 100, 1), word("word-2", 100, 200, 1)],
      hints: [
        providerHint("word-1", 1, 2),
        segmentHint("word-2", "alice", ["word-2"]),
      ],
      anchor: "word-1",
      expected: [
        providerHint("word-1", 1, 2),
        segmentHint("word-2", "alice", ["word-2"]),
        speakerHint("word-1", "bob", 1, 2),
      ],
    },
  ])("$name", ({ words, hints, anchor, expected }) => {
    const store = createStore({ words, hints });
    upsertSpeakerAssignment(
      store,
      TRANSCRIPT,
      remoteSpeakerKey(2),
      "bob",
      anchor,
    );
    expect(storedHints(store)).toEqual(expected);
  });

  it("stores segment-only assignments with the selected word ids", () => {
    const store = createStore({
      words: [word("word-1", 0), word("word-2", 100)],
      hints: [providerHint("word-1", 0, 2), providerHint("word-2", 0, 2)],
    });

    upsertSpeakerAssignment(
      store,
      TRANSCRIPT,
      {
        channel: "DirectMic",
        speaker_index: 2,
        speaker_human_id: null,
      } as SegmentKey,
      "john",
      "word-1",
      { mode: "segment", wordIds: ["word-1", "word-2"] },
    );

    expect(storedHints(store)).toEqual([
      providerHint("word-1", 0, 2),
      providerHint("word-2", 0, 2),
      segmentHint("word-1", "john", ["word-1", "word-2"]),
    ]);
  });

  it("keeps full speaker assignment when adding a segment override", () => {
    const store = createStore({
      words: [word("word-1", 0, 100, 1)],
      hints: [providerHint("word-1", 1, 2), legacyHint("word-1", "alice")],
    });

    upsertSpeakerAssignment(
      store,
      TRANSCRIPT,
      remoteSpeakerKey(2),
      "bob",
      "word-1",
      { mode: "segment", wordIds: ["word-1"] },
    );

    expect(storedHints(store)).toEqual([
      providerHint("word-1", 1, 2),
      legacyHint("word-1", "alice"),
      segmentHint("word-1", "bob", ["word-1"]),
    ]);
  });
});

describe("mergeTranscriptSegmentAssignments", () => {
  const mergeWords = [
    word("word-1", 0, 100, 1),
    word("word-2", 150, 250, 1),
    word("word-3", 400, 500, 1),
  ];

  it("assigns contiguous words to the target human", () => {
    const store = createStore({
      words: mergeWords.slice(0, 2),
      hints: [providerHint("word-1", 1, 0), providerHint("word-2", 1, 1)],
    });

    mergeTranscriptSegmentAssignments(
      store,
      TRANSCRIPT,
      remoteSpeakerKey(0, "alice"),
      ["word-1", "word-2"],
    );

    expect(storedHints(store)).toEqual([
      providerHint("word-1", 1, 0),
      providerHint("word-2", 1, 1),
      segmentHint("word-1", "alice", ["word-1", "word-2"]),
    ]);
  });

  it("unifies unlabeled speaker indexes and drops overlapping segment assignments", () => {
    const store = createStore({
      words: mergeWords,
      hints: [
        providerHint("word-1", 1, 0),
        providerHint("word-2", 1, 1),
        providerHint("word-3", 1, 1),
        segmentHint("word-2", "bob", ["word-2"]),
        speakerHint("word-3", "carol", 1, 1),
      ],
    });

    mergeTranscriptSegmentAssignments(store, TRANSCRIPT, remoteSpeakerKey(0), [
      "word-1",
      "word-2",
    ]);

    expect(storedHints(store)).toEqual([
      providerHint("word-1", 1, 0),
      providerHint("word-2", 1, 0),
      providerHint("word-3", 1, 1),
      speakerHint("word-3", "carol", 1, 1),
    ]);
  });
});
