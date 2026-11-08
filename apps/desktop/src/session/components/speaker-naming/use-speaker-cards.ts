import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { buildSpeakerCards, type SpeakerCard } from "./speakers";

import { useSessionTranscriptRenderData } from "~/session/components/note-input/transcript/render-request-hooks";
import type { Segment } from "~/stt/live-segment";
import {
  getRenderTranscriptRequestKey,
  renderTranscriptSegments,
} from "~/stt/render-transcript";

const EMPTY_CARDS: SpeakerCard[] = [];

/**
 * Les locuteurs anonymes de la note, une carte par capture : chaque capture
 * est rendue seule, comme dans la transcription, pour que « Locuteur N »
 * désigne ici la même personne que là-bas.
 */
export function useSpeakerCards(
  sessionId: string,
  enabled = true,
): { cards: SpeakerCard[]; ready: boolean } {
  const { request, transcriptRows } = useSessionTranscriptRenderData(
    enabled ? sessionId : "",
  );

  const captures = useMemo(
    () =>
      request
        ? request.transcripts.map((transcript, index) => {
            const captureRequest = { ...request, transcripts: [transcript] };
            return {
              transcriptId: transcriptRows[index]?.transcriptId ?? "",
              request: captureRequest,
              key: getRenderTranscriptRequestKey(captureRequest),
            };
          })
        : [],
    [request, transcriptRows],
  );

  const rendered = useQueries({
    queries: captures.map((capture) => ({
      queryKey: [
        "speaker-naming-segments",
        capture.transcriptId,
        capture.key,
      ] as const,
      queryFn: () => renderTranscriptSegments(capture.request),
      enabled: Boolean(capture.transcriptId),
      staleTime: Number.POSITIVE_INFINITY,
    })),
    combine: (results) => ({
      ready: results.every((result) => result.isSuccess),
      segments: results.map((result) => (result.data ?? []) as Segment[]),
    }),
  });

  const ready = rendered.ready && captures.length > 0;
  const cards = useMemo(
    () =>
      ready
        ? buildSpeakerCards(
            captures.map((capture, index) => ({
              transcriptId: capture.transcriptId,
              segments: rendered.segments[index] ?? [],
            })),
          )
        : EMPTY_CARDS,
    [captures, ready, rendered.segments],
  );

  return { cards, ready };
}
