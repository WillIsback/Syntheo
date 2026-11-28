import { describe, expect, test } from "vitest";

import {
  buildSubtitleSpeakerAssignments,
  buildSubtitleTranscript,
} from "./subtitle-import";

function build(
  tokens: Array<{
    text: string;
    start_time: number;
    end_time: number;
    speaker: string | null;
  }>,
) {
  let next = 0;
  return buildSubtitleTranscript({
    tokens,
    transcriptId: "transcript-1",
    userId: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    newId: () => `word-${++next}`,
  });
}

describe("buildSubtitleTranscript", () => {
  test("gives each voice its own speaker index (issue 785)", () => {
    const result = build([
      { text: "Bonjour.", start_time: 0, end_time: 1000, speaker: "Alice" },
      { text: "Salut.", start_time: 1000, end_time: 2000, speaker: "Bruno" },
      {
        text: "On commence.",
        start_time: 2000,
        end_time: 3000,
        speaker: "alice",
      },
    ]);

    expect(
      result.words.map((word) => [word.id, word.text, word.channel]),
    ).toEqual([
      ["word-1", "Bonjour.", 2],
      ["word-2", "Salut.", 2],
      ["word-3", "On commence.", 2],
    ]);
    expect(result.speakers).toEqual([
      { name: "Alice", speakerIndex: 0, anchorWordId: "word-1" },
      { name: "Bruno", speakerIndex: 1, anchorWordId: "word-2" },
    ]);
    expect(
      result.speakerHints.map((hint) => [
        hint.word_id,
        hint.type,
        JSON.parse(hint.value as string),
      ]),
    ).toEqual([
      ["word-1", "provider_speaker_index", { channel: 2, speaker_index: 0 }],
      ["word-2", "provider_speaker_index", { channel: 2, speaker_index: 1 }],
      ["word-3", "provider_speaker_index", { channel: 2, speaker_index: 0 }],
    ]);
  });

  test("keeps tokens without a voice as before", () => {
    const result = build([
      { text: "Bonjour.", start_time: 0, end_time: 1000, speaker: null },
    ]);

    expect(result.words).toEqual([
      {
        id: "word-1",
        transcript_id: "transcript-1",
        text: "Bonjour.",
        start_ms: 0,
        end_ms: 1000,
        channel: 2,
        user_id: "user-1",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(result.speakerHints).toEqual([]);
    expect(result.speakers).toEqual([]);
  });
});

describe("buildSubtitleSpeakerAssignments", () => {
  test("assigns each linked voice to its contact for the whole speaker", () => {
    const hints = buildSubtitleSpeakerAssignments(
      [
        { name: "Alice", speakerIndex: 0, anchorWordId: "word-1" },
        { name: "Bruno", speakerIndex: 1, anchorWordId: "word-2" },
      ],
      new Map([["alice", "human-alice"]]),
    );

    expect(
      hints.map((hint) => [
        hint.word_id,
        hint.type,
        JSON.parse(hint.value as string),
      ]),
    ).toEqual([
      [
        "word-1",
        "user_speaker_assignment",
        {
          human_id: "human-alice",
          scope: "speaker",
          channel: 2,
          speaker_index: 0,
        },
      ],
    ]);
  });
});
