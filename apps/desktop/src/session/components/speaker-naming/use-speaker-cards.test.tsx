import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useSpeakerCards } from "./use-speaker-cards";

const mocks = vi.hoisted(() => ({
  renderTranscriptSegments: vi.fn(),
}));

vi.mock(
  "~/session/components/note-input/transcript/render-request-hooks",
  () => ({
    useSessionTranscriptRenderData: (sessionId: string) =>
      sessionId
        ? {
            request: {
              humans: [],
              participant_human_ids: [],
              self_human_id: "owner",
              transcripts: [
                { started_at: 1, words: [{ id: "a1" }], assignments: [] },
                { started_at: 2, words: [{ id: "b1" }], assignments: [] },
              ],
            },
            transcriptRows: [
              { transcriptId: "before-pause", row: {} },
              { transcriptId: "after-pause", row: {} },
            ],
          }
        : { request: null, transcriptRows: [] },
  }),
);

vi.mock("~/stt/render-transcript", () => ({
  getRenderTranscriptRequestKey: (request: {
    transcripts: Array<{ started_at: number }>;
  }) => String(request.transcripts[0]?.started_at),
  renderTranscriptSegments: mocks.renderTranscriptSegments,
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

function segment(wordId: string, text: string) {
  return {
    id: wordId,
    key: { channel: "MixedCapture", speaker_index: 0, speaker_human_id: null },
    speaker_label: "Speaker 1",
    start_ms: 0,
    end_ms: 1,
    text,
    words: [{ id: wordId, text, start_ms: 0, end_ms: 1 }],
  };
}

describe("useSpeakerCards", () => {
  it("renders each capture on its own, like the transcript", async () => {
    mocks.renderTranscriptSegments.mockImplementation(
      async (request: { transcripts: Array<{ started_at: number }> }) =>
        request.transcripts[0]?.started_at === 1
          ? [segment("a1", "Avant la pause.")]
          : [segment("b1", "Après la pause.")],
    );

    const { result } = renderHook(() => useSpeakerCards("session-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(mocks.renderTranscriptSegments).toHaveBeenCalledTimes(2);
    for (const [request] of mocks.renderTranscriptSegments.mock.calls) {
      expect(request.transcripts).toHaveLength(1);
      expect(request.self_human_id).toBe("owner");
    }
    expect(
      result.current.cards.map((card) => [card.transcriptId, card.part]),
    ).toEqual([
      ["before-pause", 1],
      ["after-pause", 2],
    ]);
  });

  it("does nothing while disabled", () => {
    mocks.renderTranscriptSegments.mockClear();
    const { result } = renderHook(() => useSpeakerCards("session-1", false), {
      wrapper,
    });

    expect(result.current).toEqual({ cards: [], ready: false });
    expect(mocks.renderTranscriptSegments).not.toHaveBeenCalled();
  });
});
