import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  LiveTranscriptDelta,
  LiveTranscriptSegment,
} from "@syntheo/plugin-transcription";

import {
  createLiveTranscriptBatcher,
  flushLiveTranscriptBatches,
  LIVE_TRANSCRIPT_BATCH_MAX_PREVIEW_DELTAS,
  LIVE_TRANSCRIPT_BATCH_WINDOW_MS,
  type LiveTranscriptBatch,
  type LiveTranscriptBatcher,
} from "./live-transcript-batch";

// Regroupement des mises à jour de transcription en direct (issue 444).

const segment = (id: string, text = id): LiveTranscriptSegment =>
  ({
    id,
    key: { channel: "DirectMic" },
    start_ms: 0,
    end_ms: 1_000,
    text,
    words: [],
  }) as unknown as LiveTranscriptSegment;

const previewDelta = (partial: string): LiveTranscriptDelta => ({
  new_words: [],
  replaced_ids: [],
  partials: [
    { text: partial, start_ms: 0, end_ms: 100, channel: 0 },
  ] as LiveTranscriptDelta["partials"],
});

let applied: LiveTranscriptBatch[];
let batcher: LiveTranscriptBatcher;

beforeEach(() => {
  vi.useFakeTimers();
  applied = [];
  batcher = createLiveTranscriptBatcher((batch) => applied.push(batch));
});

afterEach(() => {
  batcher.dispose();
  vi.useRealTimers();
});

describe("fusion des deltas de segments", () => {
  test("ajout puis remplacement d'un même segment : le dernier l'emporte", () => {
    batcher.addSegmentDelta({
      upserts: [segment("a", "bon")],
      removed_ids: [],
    });
    batcher.addSegmentDelta({
      upserts: [segment("a", "bonjour")],
      removed_ids: [],
    });
    batcher.flush();

    expect(applied).toHaveLength(1);
    expect(applied[0]!.segmentDelta).toEqual({
      upserts: [segment("a", "bonjour")],
      removed_ids: [],
    });
  });

  test("ajout puis suppression = suppression", () => {
    batcher.addSegmentDelta({ upserts: [segment("a")], removed_ids: [] });
    batcher.addSegmentDelta({ upserts: [], removed_ids: ["a"] });
    batcher.flush();

    expect(applied[0]!.segmentDelta).toEqual({
      upserts: [],
      removed_ids: ["a"],
    });
  });

  test("suppression puis ajout = ajout", () => {
    batcher.addSegmentDelta({ upserts: [], removed_ids: ["a"] });
    batcher.addSegmentDelta({
      upserts: [segment("a", "revenu")],
      removed_ids: [],
    });
    batcher.flush();

    expect(applied[0]!.segmentDelta).toEqual({
      upserts: [segment("a", "revenu")],
      removed_ids: [],
    });
  });

  test("dans un delta, la suppression précède l'ajout du même segment", () => {
    batcher.addSegmentDelta({
      upserts: [segment("a", "réécrit")],
      removed_ids: ["a"],
    });
    batcher.flush();

    expect(applied[0]!.segmentDelta).toEqual({
      upserts: [segment("a", "réécrit")],
      removed_ids: [],
    });
  });

  test("garde l'ordre de la dernière opération sur chaque segment", () => {
    batcher.addSegmentDelta({
      upserts: [segment("a"), segment("b")],
      removed_ids: ["x"],
    });
    batcher.addSegmentDelta({ upserts: [segment("c")], removed_ids: ["y"] });
    batcher.addSegmentDelta({ upserts: [segment("a", "a2")], removed_ids: [] });
    batcher.flush();

    expect(applied[0]!.segmentDelta).toEqual({
      upserts: [segment("b"), segment("c"), segment("a", "a2")],
      removed_ids: ["x", "y"],
    });
  });
});

describe("fenêtre de regroupement", () => {
  test("un seul lot par fenêtre de 100 ms, aperçus dans l'ordre de réception", () => {
    batcher.addPreviewDelta(previewDelta("un"));
    batcher.addSegmentDelta({ upserts: [segment("a")], removed_ids: [] });
    vi.advanceTimersByTime(50);
    batcher.addPreviewDelta(previewDelta("deux"));
    batcher.addPreviewDelta(previewDelta("trois"));
    vi.advanceTimersByTime(LIVE_TRANSCRIPT_BATCH_WINDOW_MS - 51);
    expect(applied).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(applied).toHaveLength(1);
    expect(
      applied[0]!.previewDeltas.map((delta) => delta.partials[0]!.text),
    ).toEqual(["un", "deux", "trois"]);
    expect(applied[0]!.segmentDelta?.upserts).toEqual([segment("a")]);
  });

  test("la latence ajoutée ne dépasse pas la fenêtre", () => {
    batcher.addPreviewDelta(previewDelta("mot"));
    vi.advanceTimersByTime(LIVE_TRANSCRIPT_BATCH_WINDOW_MS);
    expect(applied).toHaveLength(1);
  });

  test("vingt deltas par seconde donnent au plus dix lots par seconde", () => {
    for (let elapsed = 0; elapsed < 1_000; elapsed += 50) {
      batcher.addPreviewDelta(previewDelta(`p${elapsed}`));
      batcher.addSegmentDelta({
        upserts: [segment(`s${elapsed}`)],
        removed_ids: [],
      });
      vi.advanceTimersByTime(50);
    }
    batcher.flush();

    expect(applied.length).toBeLessThanOrEqual(10);
    // Rien de perdu ni de réordonné.
    expect(
      applied.flatMap((batch) =>
        batch.previewDeltas.map((delta) => delta.partials[0]!.text),
      ),
    ).toEqual(Array.from({ length: 20 }, (_, index) => `p${index * 50}`));
    expect(
      applied.flatMap((batch) =>
        batch.segmentDelta?.upserts.map((upsert) => upsert.id),
      ),
    ).toEqual(Array.from({ length: 20 }, (_, index) => `s${index * 50}`));
  });

  test("n'applique rien quand rien n'attend", () => {
    batcher.addSegmentDelta({ upserts: [], removed_ids: [] });
    vi.advanceTimersByTime(LIVE_TRANSCRIPT_BATCH_WINDOW_MS * 2);
    batcher.flush();
    expect(applied).toHaveLength(0);
  });

  test("applique le lot sans attendre au-delà du plafond d'aperçus", () => {
    for (
      let index = 0;
      index < LIVE_TRANSCRIPT_BATCH_MAX_PREVIEW_DELTAS;
      index++
    )
      batcher.addPreviewDelta(previewDelta(`p${index}`));

    expect(applied).toHaveLength(1);
    expect(applied[0]!.previewDeltas).toHaveLength(
      LIVE_TRANSCRIPT_BATCH_MAX_PREVIEW_DELTAS,
    );
  });
});

describe("vidage immédiat", () => {
  test("flushLiveTranscriptBatches vide tous les lots en attente", () => {
    const other: LiveTranscriptBatch[] = [];
    const otherBatcher = createLiveTranscriptBatcher((batch) =>
      other.push(batch),
    );
    batcher.addPreviewDelta(previewDelta("a"));
    otherBatcher.addSegmentDelta({ upserts: [segment("b")], removed_ids: [] });

    flushLiveTranscriptBatches();

    expect(applied).toHaveLength(1);
    expect(other).toHaveLength(1);
    // La minuterie est annulée : pas de second lot vide.
    vi.advanceTimersByTime(LIVE_TRANSCRIPT_BATCH_WINDOW_MS);
    expect(applied).toHaveLength(1);
    otherBatcher.dispose();
  });

  test("dispose vide le lot puis n'accepte plus rien", () => {
    batcher.addPreviewDelta(previewDelta("dernier"));
    batcher.dispose();
    expect(applied).toHaveLength(1);

    batcher.addPreviewDelta(previewDelta("trop tard"));
    flushLiveTranscriptBatches();
    vi.advanceTimersByTime(LIVE_TRANSCRIPT_BATCH_WINDOW_MS);
    expect(applied).toHaveLength(1);
  });
});
