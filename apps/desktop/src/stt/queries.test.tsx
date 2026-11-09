import { renderHook } from "@testing-library/react";
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  legacyHint,
  liveDelta,
  liveWord,
  providerHint,
  speakerHint,
  word,
} from "./test-fixtures";

type Statement = { sql: string; params: unknown[] };

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  executeTransaction: vi.fn((_statements: Statement[]) =>
    Promise.resolve(_statements.map(() => 1)),
  ),
  promoteVoiceprintCandidates: vi.fn().mockResolvedValue({ status: "ok" }),
  humanRows: [] as Array<Record<string, unknown>>,
  participantRows: [] as Array<Record<string, unknown>>,
  queryOptions: [] as Array<{
    sql: string;
    params?: unknown[];
    enabled?: boolean;
  }>,
  transcriptRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@syntheo/plugin-transcription", () => ({
  commands: { promoteVoiceprintCandidates: mocks.promoteVoiceprintCandidates },
}));

vi.mock("~/db", () => ({
  executeTransaction: mocks.executeTransaction,
  liveQueryClient: { execute: mocks.execute },
  useLiveQuery: (options: {
    sql: string;
    params?: unknown[];
    enabled?: boolean;
    mapRows?: (rows: Array<Record<string, unknown>>) => unknown;
  }) => {
    mocks.queryOptions.push(options);
    const rows = options.sql.includes("FROM session_participants")
      ? mocks.participantRows
      : options.sql.includes("FROM humans")
        ? mocks.humanRows
        : mocks.transcriptRows;

    return {
      data:
        options.enabled === false
          ? undefined
          : options.mapRows
            ? options.mapRows(rows)
            : rows,
    };
  },
}));

import {
  appendTranscriptWordsAndHints,
  assignSessionTranscriptSpeaker,
  assignTranscriptSpeaker,
  createLiveTranscript,
  createTranscript,
  flushLiveTranscriptDeltasToDatabase,
  getSessionParticipantHumanIds,
  getSessionTranscriptRecords,
  getTranscriptHumans,
  mergeTranscriptSegments,
  removeHumanSpeakerAssignments,
  splitTranscriptSpeaker,
  updateTranscriptSegmentText,
  useSessionParticipantHumanIds,
  useSessionTranscriptMetadata,
  useSessionTranscripts,
  useTranscript,
  useTranscriptHumans,
  useTranscriptMetadata,
} from "./queries";

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");

const transaction = (index = 0) =>
  mocks.executeTransaction.mock.calls[index]?.[0] as Statement[];
const last = <T,>(items: T[]): T | undefined => items[items.length - 1];
const firstUpdate = () => transaction()[0]!;
const jsonParam = (statement: Statement | undefined, index: number) =>
  JSON.parse(String(statement?.params[index]));

// Ligne de contenu lue avant une mise à jour optimiste.
function contentRow(
  words: unknown[],
  hints: unknown[] = [],
  extra: Record<string, unknown> = {},
) {
  return {
    words_json: JSON.stringify(words),
    speaker_hints_json: JSON.stringify(hints),
    ...extra,
  };
}

// Ligne de transcript renvoyée par la requête en direct.
function transcriptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "transcript-1",
    owner_user_id: "user-1",
    session_id: "session-1",
    started_at_ms: 1000,
    ended_at_ms: null,
    speaker_hints_json: "[]",
    ...overrides,
  };
}

// Mot unique sur le canal 1, avec son index fournisseur et, si fourni, son
// attribution à une personne.
function speakerRow(wordId: string, speakerIndex: number, humanId?: string) {
  return contentRow(
    [word(wordId, 0, 100, 1)],
    [
      providerHint(wordId, 1, speakerIndex),
      ...(humanId ? [speakerHint(wordId, humanId, 1, speakerIndex)] : []),
    ],
    { content_revision: 0, pending_deltas_json: "[]" },
  );
}

const remoteKey = (
  speakerIndex: number | null,
  speakerHumanId: string | null = null,
) => ({
  channel: "RemoteParty" as const,
  speaker_index: speakerIndex,
  speaker_human_id: speakerHumanId,
});

const channelWords = (texts: string[]) =>
  texts.map((text, index) =>
    word(`word-${index}`, index * 100, (index + 1) * 100, 1, text),
  );

describe("transcript SQLite queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.humanRows = [];
    mocks.participantRows = [];
    mocks.queryOptions = [];
    mocks.transcriptRows = [];
  });

  describe("lecture", () => {
    it("maps canonical transcript JSON into renderer records", () => {
      mocks.transcriptRows = [
        transcriptRow({
          ended_at_ms: 2000,
          words_json: JSON.stringify([word("word-1", 0, 500, 0, "Hello")]),
          speaker_hints_json: JSON.stringify([
            { word_id: "word-1", type: "provider_speaker_index", value: 0 },
          ]),
        }),
      ];

      const { result } = renderHook(() => useSessionTranscripts("session-1"));

      expect(result.current).toEqual([
        expect.objectContaining({
          id: "transcript-1",
          ownerUserId: "user-1",
          sessionId: "session-1",
          startedAt: 1000,
          endedAt: 2000,
          words: [expect.objectContaining({ id: "word-1" })],
          speakerHints: [expect.objectContaining({ word_id: "word-1" })],
        }),
      ]);
      expect(mocks.queryOptions[0]?.sql).toContain(
        "ORDER BY transcript.started_at_ms, transcript.created_at, transcript.id",
      );
    });

    it("materializes ordered live journal chunks on read", async () => {
      mocks.transcriptRows = [
        transcriptRow({
          words_json: JSON.stringify([word("word-old", 0)]),
          content_revision: 0,
          pending_deltas_json: JSON.stringify([
            liveDelta([liveWord("word-final", 0, 100)], ["word-old"]),
            liveDelta([liveWord("word-next", 100, 200)]),
          ]),
        }),
      ];

      const { result } = renderHook(() => useTranscript("transcript-1"));
      expect(result.current?.words.map((stored) => stored.id)).toEqual([
        "word-final",
        "word-next",
      ]);

      mocks.execute.mockResolvedValueOnce(mocks.transcriptRows);
      const records = await getSessionTranscriptRecords("session-1");
      expect(records[0]?.words.map((stored) => stored.id)).toEqual([
        "word-final",
        "word-next",
      ]);
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.stringContaining(
          "transcript.session_id = ? AND transcript.deleted_at IS NULL",
        ),
        ["session-1"],
      );
    });

    it("skips live journal replay for an active renderer baseline", () => {
      mocks.transcriptRows = [
        transcriptRow({
          words_json: JSON.stringify([word("word-base", 0)]),
          content_revision: 0,
          pending_deltas_json: "[]",
        }),
      ];

      const { result } = renderHook(() => useTranscript("transcript-1", false));

      expect(result.current?.words.map((stored) => stored.id)).toEqual([
        "word-base",
      ]);
      expect(mocks.queryOptions[0]?.sql).not.toContain(
        "FROM transcript_live_deltas AS delta",
      );
    });

    it("projects transcript metadata without transferring content blobs", () => {
      mocks.transcriptRows = [
        {
          id: "transcript-1",
          session_id: "session-1",
          started_at_ms: 1000,
          ended_at_ms: 2000,
          has_words: 1,
        },
      ];

      const session = renderHook(() =>
        useSessionTranscriptMetadata("session-1"),
      );
      const transcript = renderHook(() =>
        useTranscriptMetadata("transcript-1"),
      );

      expect(session.result.current).toEqual([
        {
          id: "transcript-1",
          sessionId: "session-1",
          startedAt: 1000,
          endedAt: 2000,
          hasWords: true,
        },
      ]);
      expect(transcript.result.current).toEqual(session.result.current[0]);
      for (const query of mocks.queryOptions) {
        expect(query.sql).toContain("END AS has_words");
        expect(query.sql).not.toContain("transcript.speaker_hints_json");
        expect(query.sql).not.toMatch(/transcript\.words_json,\s/);
        expect(query.sql).not.toContain(
          "json_array_length(transcript.words_json)",
        );
        expect(query.sql).toContain("FROM transcript_live_deltas AS delta");
        expect(query.sql).toContain("'$.new_words'");
        expect(query.sql).not.toContain("'$.partials'");
      }
    });

    it("skips pending transcript journals while live state is visible", () => {
      renderHook(() => useSessionTranscriptMetadata("session-1", false));
      renderHook(() => useTranscriptMetadata("transcript-1", false));

      for (const query of mocks.queryOptions) {
        expect(query.sql).not.toContain("transcript_live_deltas");
      }
    });

    it("treats non-array transcript payloads as empty without hiding the row", () => {
      mocks.transcriptRows = [
        transcriptRow({ words_json: "{}", speaker_hints_json: "null" }),
      ];

      const { result } = renderHook(() => useTranscript("transcript-1"));

      expect(result.current).toEqual(
        expect.objectContaining({
          id: "transcript-1",
          endedAt: undefined,
          words: [],
          speakerHints: [],
        }),
      );
    });
  });

  describe("participants et personnes", () => {
    it("reads distinct participant human ids", () => {
      mocks.participantRows = [
        { human_id: "human-1" },
        { human_id: "human-2" },
      ];

      const { result } = renderHook(() =>
        useSessionParticipantHumanIds("session-1"),
      );

      expect(result.current).toEqual(["human-1", "human-2"]);
      for (const fragment of [
        "deleted_at IS NULL",
        "source <> 'excluded'",
        "owner_user_id",
        "owner_participant",
        "NULLIF(lower(self_human.email), '') IS NOT NULL",
        "NULLIF(lower(owner_participant.email), '') IS NOT NULL",
        "COALESCE(NULLIF(human.email, ''), participant.email)",
      ]) {
        expect(mocks.queryOptions[0]?.sql).toContain(fragment);
      }
    });

    it("loads remote participant ids without waiting for the live query", async () => {
      mocks.execute.mockResolvedValueOnce([
        { human_id: "human-artem" },
        { human_id: "" },
      ]);

      await expect(getSessionParticipantHumanIds("session-1")).resolves.toEqual(
        ["human-artem"],
      );
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.stringContaining("source <> 'excluded'"),
        ["session-1"],
      );
    });

    it("returns no named humans without querying when there are no ids", async () => {
      await expect(getTranscriptHumans([])).resolves.toEqual([]);
      expect(mocks.execute).not.toHaveBeenCalled();
    });

    it("loads named humans with unique sorted ids", async () => {
      mocks.execute.mockResolvedValueOnce([{ id: "human-1", name: "Alice" }]);

      await expect(
        getTranscriptHumans(["human-2", "human-1", "human-2", ""]),
      ).resolves.toEqual([{ human_id: "human-1", name: "Alice" }]);
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.stringContaining("WHERE id IN (?, ?)"),
        ["human-1", "human-2"],
      );
    });

    it("keeps historical speaker names after the assigned contact is deleted", async () => {
      const db = new DatabaseSync(":memory:");
      try {
        db.exec(
          "CREATE TABLE humans (id TEXT PRIMARY KEY, name TEXT, deleted_at TEXT)",
        );
        db.prepare("INSERT INTO humans VALUES (?, ?, ?)").run(
          "artem",
          "Artem",
          "2026-09-24",
        );
        mocks.execute.mockImplementationOnce((sql: string, params: string[]) =>
          Promise.resolve(db.prepare(sql).all(...params)),
        );
        await expect(getTranscriptHumans(["artem"])).resolves.toEqual([
          { human_id: "artem", name: "Artem" },
        ]);
      } finally {
        db.close();
      }
    });

    it("deduplicates and sorts ids before loading named humans", () => {
      mocks.humanRows = [
        { id: "human-1", name: "Alice" },
        { id: "human-2", name: "Bob" },
      ];

      const { result } = renderHook(() =>
        useTranscriptHumans(["human-2", "human-1", "human-2", ""]),
      );

      expect(result.current).toEqual([
        { human_id: "human-1", name: "Alice" },
        { human_id: "human-2", name: "Bob" },
      ]);
      expect(mocks.queryOptions[0]?.params).toEqual(["human-1", "human-2"]);
    });
  });

  describe("création et journal en direct", () => {
    const newTranscript = {
      id: "transcript-new",
      sessionId: "session-1",
      ownerUserId: "user-1",
      createdAt: "2026-07-10T12:00:00.000Z",
      startedAt: 1000,
    };

    it("creates the first live transcript delta in one insert", async () => {
      await createLiveTranscript(
        {
          ...newTranscript,
          id: "transcript-1",
          source: "live_capture",
          provider: "soniox",
          model: "stt-rt-v3",
        },
        liveDelta([liveWord("word-1", 0, 500, 0, 1, "Hello")]),
      );

      const statements = transaction();
      expect(statements).toHaveLength(1);
      const insert = statements[0]!;
      expect(insert.sql).toContain("INSERT INTO transcripts");
      expect(insert.sql).toContain("session.workspace_id");
      expect(insert.sql).toContain(
        "COALESCE(NULLIF(?, ''), session.owner_user_id)",
      );
      expect(insert.params.slice(0, 8)).toEqual([
        "transcript-1",
        "user-1",
        "live_capture",
        "soniox",
        "stt-rt-v3",
        "",
        1000,
        null,
      ]);
      expect(jsonParam(insert, 9)).toEqual([
        expect.objectContaining({ id: "word-1", text: "Hello" }),
      ]);
      expect(jsonParam(insert, 10)).toEqual([
        expect.objectContaining({
          word_id: "word-1",
          type: "provider_speaker_index",
        }),
      ]);
      expect(last(insert.params)).toBe("session-1");
    });

    it.each([
      {
        name: "tombstones old session transcripts in the same transaction",
        input: { replaceSession: true },
        update: "deleted_at IS NULL",
      },
      {
        name: "appends a partial capture without tombstoning earlier ones",
        input: { replaceSession: false },
        update: null,
      },
      {
        name: "atomically replaces the live capture without a visible duplicate",
        input: { replaceTranscriptId: "transcript-current-live" },
        update: "WHERE id = ? AND session_id = ? AND deleted_at IS NULL",
      },
    ])("$name", async ({ input, update }) => {
      await createTranscript({ ...newTranscript, ...input });

      expect(mocks.executeTransaction).toHaveBeenCalledOnce();
      const statements = transaction();
      expect(statements).toHaveLength(update ? 2 : 1);
      expect(last(statements)?.sql).toContain("INSERT INTO transcripts");
      if (update) {
        expect(statements[0]?.sql).toContain("UPDATE transcripts");
        expect(statements[0]?.sql).toContain(update);
      } else {
        expect(statements[0]?.sql).not.toContain("UPDATE transcripts");
      }
      if ("replaceTranscriptId" in input) {
        expect(statements[0]?.params.slice(-2)).toEqual([
          "transcript-current-live",
          "session-1",
        ]);
      }
    });

    it("preserves a delta appended after compaction reads its snapshot", async () => {
      const firstDelta = liveDelta([liveWord("word-1", 0, 100)]);
      const appendedDelta = liveDelta([liveWord("word-2", 100, 200)]);
      let wordsJson = "[]";
      let hintsJson = "[]";
      let contentRevision = 0;
      const deltas = [{ sequence: 0, delta: firstDelta }];
      let transactionCount = 0;

      const readSnapshot = async () => [
        {
          words_json: wordsJson,
          speaker_hints_json: hintsJson,
          content_revision: contentRevision,
          pending_deltas_json: JSON.stringify(deltas.map(({ delta }) => delta)),
          max_read_sequence: last(deltas)?.sequence ?? null,
        },
      ];
      mocks.execute
        .mockImplementationOnce(readSnapshot)
        .mockImplementationOnce(readSnapshot);
      const commitSnapshot = async (statements: Statement[]) => {
        const [update, deleteReadDeltas] = statements;
        if (transactionCount === 0) {
          deltas.push({ sequence: 1, delta: appendedDelta });
        }
        wordsJson = String(update?.params[0]);
        hintsJson = String(update?.params[1]);
        contentRevision += 1;
        const maxSequence = deleteReadDeltas?.params[1];
        if (typeof maxSequence === "number") {
          for (let index = deltas.length - 1; index >= 0; index -= 1) {
            if (deltas[index]!.sequence <= maxSequence) deltas.splice(index, 1);
          }
        }
        transactionCount += 1;
        return [1, 1, 1];
      };
      mocks.executeTransaction
        .mockImplementationOnce(commitSnapshot)
        .mockImplementationOnce(commitSnapshot);

      await flushLiveTranscriptDeltasToDatabase("transcript-1");

      const firstTransaction = transaction(0);
      expect(firstTransaction[1]?.sql).toContain("sequence <= ?");
      expect(firstTransaction[1]?.sql).toContain("changes() = 1");
      expect(firstTransaction[1]?.params).toEqual(["transcript-1", 0]);
      expect(deltas).toEqual([{ sequence: 1, delta: appendedDelta }]);
      expect(firstTransaction[2]?.sql).toContain("NOT EXISTS");

      await flushLiveTranscriptDeltasToDatabase("transcript-1");

      expect(
        jsonParam(transaction(1)[0], 0).map(
          (stored: { id: string }) => stored.id,
        ),
      ).toEqual(["word-1", "word-2"]);
      expect(deltas).toEqual([]);
    });

    it("compacts pending chunks deterministically and clears the journal", async () => {
      mocks.execute.mockResolvedValueOnce([
        contentRow([word("word-old", 0)], [], {
          content_revision: 7,
          pending_deltas_json: JSON.stringify([
            liveDelta(
              [liveWord("word-final", 0, 100, 0, undefined, "Final")],
              ["word-old"],
            ),
          ]),
          max_read_sequence: 0,
        }),
      ]);

      await flushLiveTranscriptDeltasToDatabase("transcript-1");

      const statements = transaction();
      expect(jsonParam(statements[0], 0)).toEqual([
        expect.objectContaining({ id: "word-final", text: "Final" }),
      ]);
      expect(last(statements[0]!.params)).toBe(7);
      expect(statements[1]?.sql).toContain("changes() = 1");
    });
  });

  describe("modifications optimistes", () => {
    it("retries a canonical edit with a small revision token", async () => {
      const revision = { pending_deltas_json: "[]" };
      mocks.execute
        .mockResolvedValueOnce([
          contentRow([], [], { ...revision, content_revision: 3 }),
        ])
        .mockResolvedValueOnce([
          contentRow([word("external-word", 0)], [], {
            ...revision,
            content_revision: 4,
          }),
        ]);
      mocks.executeTransaction
        .mockResolvedValueOnce([0, 0])
        .mockResolvedValueOnce([1, 0]);

      await appendTranscriptWordsAndHints(
        "transcript-1",
        [word("word-2", 200, 500, 0, "Hello")],
        [],
      );

      const retryStatement = transaction(1)[0]!;
      expect(retryStatement.sql).toContain("content_revision = ?");
      expect(retryStatement.sql).not.toContain(
        "words_json = ?\n              AND",
      );
      expect(last(retryStatement.params)).toBe(4);
      expect(jsonParam(retryStatement, 0)).toEqual([
        expect.objectContaining({ id: "external-word" }),
        expect.objectContaining({ id: "word-2" }),
      ]);
    });

    it("refuses to overwrite malformed transcript JSON", async () => {
      mocks.execute.mockResolvedValueOnce([
        { words_json: "not-json", speaker_hints_json: "[]" },
      ]);

      await expect(
        appendTranscriptWordsAndHints("transcript-1", [], []),
      ).rejects.toThrow("invalid words data");
      expect(mocks.executeTransaction).not.toHaveBeenCalled();
    });

    it("persists speaker assignments through the optimistic transcript update", async () => {
      mocks.execute.mockResolvedValueOnce([
        contentRow([word("word-1", 0, 500, 1, "Hello")]),
      ]);

      await assignTranscriptSpeaker({
        transcriptId: "transcript-1",
        segmentKey: remoteKey(0),
        humanId: "human-1",
        anchorWordId: "word-1",
        mode: "all",
        wordIds: ["word-1"],
      });

      expect(jsonParam(firstUpdate(), 1)).toEqual([
        expect.objectContaining({
          word_id: "word-1",
          type: "user_speaker_assignment",
        }),
      ]);
    });

    it("persists bounded assignments without expanding to adjacent words", async () => {
      mocks.execute.mockResolvedValueOnce([speakerRow("word-2", 0)]);
      await assignTranscriptSpeaker({
        transcriptId: "transcript-1",
        segmentKey: remoteKey(0),
        humanId: "human-1",
        anchorWordId: "word-2",
        mode: "segment",
        wordIds: ["word-2"],
        extendToAdjacent: false,
      });
      const assignment = jsonParam(firstUpdate(), 1).find(
        (hint: { type: string }) => hint.type === "user_speaker_assignment",
      );
      expect(JSON.parse(assignment.value)).toMatchObject({
        word_ids: ["word-2"],
        extend_to_adjacent: false,
      });
    });

    it("persists merged unlabeled speaker indexes through the optimistic transcript update", async () => {
      mocks.execute.mockResolvedValueOnce([
        contentRow(
          [word("word-1", 0, 500, 1, "Hello"), word("word-2", 600, 900, 1)],
          [providerHint("word-1", 1, 0), providerHint("word-2", 1, 1)],
        ),
      ]);

      await mergeTranscriptSegments({
        transcriptId: "transcript-1",
        segmentKey: remoteKey(0),
        wordIds: ["word-1", "word-2"],
      });

      expect(jsonParam(firstUpdate(), 1)).toEqual([
        expect.objectContaining(providerHint("word-1", 1, 0)),
        expect.objectContaining(providerHint("word-2", 1, 0)),
      ]);
    });

    it("removes one human's assignments from every session transcript", async () => {
      mocks.execute
        .mockResolvedValueOnce([{ id: "transcript-1" }])
        .mockResolvedValueOnce([
          contentRow(
            [],
            [
              legacyHint("word-1", "human-1", undefined, "assignment-1"),
              legacyHint("word-2", "human-2", undefined, "assignment-2"),
            ],
          ),
        ]);

      await removeHumanSpeakerAssignments("session-1", "human-1");

      expect(jsonParam(firstUpdate(), 1)).toEqual([
        expect.objectContaining({ id: "assignment-2" }),
      ]);
    });
  });

  describe("attribution sur toute la session", () => {
    it("does not treat a speaker index as an identity across separate captures", async () => {
      mocks.execute
        .mockResolvedValueOnce([{ id: "transcript-1" }, { id: "transcript-2" }])
        .mockResolvedValueOnce([speakerRow("word-1", 0)]);

      await assignSessionTranscriptSpeaker({
        sessionId: "session-1",
        transcriptId: "transcript-1",
        segmentKey: remoteKey(0),
        humanId: "alice",
        anchorWordId: "word-1",
      });

      expect(mocks.execute).toHaveBeenCalledTimes(2);
      expect(mocks.executeTransaction).toHaveBeenCalledTimes(1);
      expect(firstUpdate().params[3]).toBe("transcript-1");
    });

    it("matches already identified people across resumed captures instead of reusing indexes", async () => {
      mocks.execute
        .mockResolvedValueOnce([
          { id: "transcript-1" },
          { id: "transcript-2" },
          { id: "transcript-3" },
        ])
        .mockResolvedValueOnce([speakerRow("word-1", 0, "alice")])
        .mockResolvedValueOnce([speakerRow("word-2", 7, "alice")])
        .mockResolvedValueOnce([speakerRow("word-3", 0, "bob")]);

      await assignSessionTranscriptSpeaker({
        sessionId: "session-1",
        transcriptId: "transcript-1",
        segmentKey: remoteKey(0, "alice"),
        humanId: "carol",
        anchorWordId: "word-1",
      });

      const updates = mocks.executeTransaction.mock.calls.map(
        ([statements]) => statements[0]!,
      );
      expect(updates.map((statement) => statement.params[3])).toEqual([
        "transcript-1",
        "transcript-2",
      ]);
      expect(JSON.parse(jsonParam(updates[1], 1).at(-1).value)).toEqual({
        human_id: "carol",
        scope: "segment",
        word_ids: ["word-2"],
        extend_to_adjacent: false,
      });
    });

    it("keeps selected words when Apply to all has no speaker index", async () => {
      mocks.execute
        .mockResolvedValueOnce([{ id: "transcript-1" }])
        .mockResolvedValueOnce([
          contentRow(
            [word("word-1", 0, 100, 2), word("word-2", 100, 200, 2)],
            [],
            {
              content_revision: 0,
              pending_deltas_json: "[]",
            },
          ),
        ]);

      await assignSessionTranscriptSpeaker({
        sessionId: "session-1",
        transcriptId: "transcript-1",
        segmentKey: {
          channel: "MixedCapture",
          speaker_index: null,
          speaker_human_id: null,
        },
        humanId: "alice",
        anchorWordId: "word-1",
        wordIds: ["word-1", "word-2"],
      });

      expect(JSON.parse(jsonParam(firstUpdate(), 1)[0].value)).toEqual({
        human_id: "alice",
        scope: "segment",
        word_ids: ["word-1", "word-2"],
        extend_to_adjacent: false,
      });
      expect(mocks.promoteVoiceprintCandidates).not.toHaveBeenCalled();
    });

    it("rejects a stale source transcript instead of changing other captures", async () => {
      mocks.execute.mockResolvedValueOnce([{ id: "transcript-2" }]);
      await expect(
        assignSessionTranscriptSpeaker({
          sessionId: "session-1",
          transcriptId: "transcript-1",
          segmentKey: remoteKey(0, "alice"),
          humanId: "bob",
          anchorWordId: "word-1",
        }),
      ).rejects.toThrow("no longer in session");
      expect(mocks.executeTransaction).not.toHaveBeenCalled();
    });
  });

  describe("édition du texte", () => {
    it("updates editable segment text without discarding word identity or timing", async () => {
      mocks.execute.mockResolvedValueOnce([
        contentRow([
          word("word-1", 0, 100, 1, "Hello"),
          word("word-2", 100, 200, 1, "world"),
          word("word-3", 200, 300, 1, "Again"),
        ]),
      ]);

      await updateTranscriptSegmentText({
        transcriptId: "transcript-1",
        wordIds: ["word-1", "word-2"],
        text: "Hello brave new world",
      });

      expect(jsonParam(firstUpdate(), 0)).toEqual([
        expect.objectContaining(word("word-1", 0, 100, 1, "Hello")),
        expect.objectContaining({
          id: "word-2",
          text: "brave new world",
          start_ms: 100,
          end_ms: 200,
        }),
        expect.objectContaining({ id: "word-3", text: "Again" }),
      ]);
    });

    it("clears only selected transcript words while preserving timing and speaker metadata", async () => {
      const words = channelWords(["one", "two", "three"]);
      const hints = [legacyHint("word-0", "human-1", undefined, "hint-1")];
      mocks.execute.mockResolvedValueOnce([contentRow(words, hints)]);
      await updateTranscriptSegmentText({
        transcriptId: "transcript-1",
        wordIds: ["word-0", "word-2"],
        text: "",
      });
      expect(jsonParam(firstUpdate(), 0)).toEqual([
        { ...words[0], text: "" },
        words[1],
        { ...words[2], text: "" },
      ]);
      expect(jsonParam(firstUpdate(), 1)).toEqual(hints);
    });

    async function split(texts: string[], text: string, offset: number) {
      const words = channelWords(texts);
      mocks.execute.mockResolvedValueOnce([contentRow(words)]);
      await splitTranscriptSpeaker({
        transcriptId: "transcript-1",
        segmentKey: { channel: "RemoteParty", speaker_index: 1 },
        wordIds: ["word-0", "word-1", "word-2"],
        text,
        offset,
        humanId: "human-2",
      });
      return {
        words,
        saved: jsonParam(firstUpdate(), 0),
        hints: jsonParam(firstUpdate(), 1),
      };
    }

    it.each([
      [6, ["word-1", "word-2"]],
      [8, ["word-2"]],
    ])(
      "changes only the text after cursor offset %s",
      async (offset, followingIds) => {
        const { words, saved, hints } = await split(
          ["Hello", "world", "again", "untouched"],
          "Hello world again",
          offset,
        );
        expect(saved.at(-1)).toEqual(words[3]);
        expect(saved[0]).toEqual(words[0]);
        const assignment = JSON.parse(hints.at(-1).value);
        expect(assignment).toMatchObject({
          human_id: "human-2",
          scope: "segment",
          extend_to_adjacent: false,
        });
        expect(assignment.word_ids).toEqual(
          expect.arrayContaining(followingIds),
        );
        expect(assignment.word_ids).not.toContain("word-0");
        if (offset === 8) {
          expect(saved[1]).toMatchObject({
            id: "word-1",
            text: "wo",
            start_ms: 100,
            end_ms: 140,
          });
          expect(saved[2]).toMatchObject({
            text: "rld",
            start_ms: 140,
            end_ms: 200,
          });
          expect(assignment.word_ids).toEqual([saved[2].id, "word-2"]);
        }
      },
    );

    it("ignores trailing whitespace when splitting inside the final word", async () => {
      const { saved } = await split(
        ["Hello", "world", "again"],
        "Hello world again  ",
        15,
      );
      expect(saved[2]).toMatchObject({
        id: "word-2",
        text: "aga",
        start_ms: 200,
        end_ms: 260,
      });
      expect(saved[3]).toMatchObject({
        text: "in",
        start_ms: 260,
        end_ms: 300,
      });
    });
  });
});
