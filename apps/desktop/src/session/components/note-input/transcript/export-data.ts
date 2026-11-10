import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { TranscriptItem } from "@syntheo/plugin-export";
import type { RenderTranscriptRequest } from "@syntheo/plugin-transcription";

import { TRANSCRIPT_RENDER_CACHE_TIME_MS } from "./cache";
import { useSessionTranscriptRenderData } from "./render-request-hooks";

import {
  getRenderTranscriptRequestKey,
  renderTranscriptSegments,
} from "~/stt/render-transcript";

type TranscriptExportSegment = TranscriptItem & {
  start_ms: number;
  end_ms: number;
};

async function buildTranscriptExportSegments(
  request: RenderTranscriptRequest,
): Promise<TranscriptExportSegment[]> {
  const segments = await renderTranscriptSegments(request);

  return segments.map((segment) => ({
    text: segment.text,
    start_ms: segment.start_ms,
    end_ms: segment.end_ms,
    speaker: segment.speaker_label,
  }));
}

export function useTranscriptExportSegments(sessionId: string): {
  data: TranscriptExportSegment[];
  isLoading: boolean;
} {
  const { request } = useSessionTranscriptRenderData(sessionId);
  const requestKey = useMemo(
    () => getRenderTranscriptRequestKey(request),
    [request],
  );

  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- requestKey is the canonical hash of the complete render request.
  const { data = [], isLoading } = useQuery({
    queryKey: ["transcript-export-segments", sessionId, requestKey],
    queryFn: async () => {
      if (!request) {
        return [];
      }
      return buildTranscriptExportSegments(request);
    },
    enabled: !!request,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: TRANSCRIPT_RENDER_CACHE_TIME_MS,
  });

  return { data, isLoading };
}
