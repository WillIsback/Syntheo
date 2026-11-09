import { useMemo } from "react";

import type { RenderTranscriptRequest } from "@syntheo/plugin-transcription";

import {
  useRenderedTranscriptData,
  useTranscriptTimelineMetadata,
} from "./data-hooks";
import { useStableSegments } from "./segment-hooks";
import { SegmentsList } from "./segments-list";

import { type RenderLabelContext, type Segment } from "~/stt/live-segment";
import { mergeRenderedAndLiveSegments } from "~/stt/live-segment-merge";
import {
  applyRenderRequestIdentitiesToSegments,
  mergeAdjacentSpeakerSegments,
} from "~/stt/live-segment-runs";
import { useResolvedSpeakerSegments } from "~/stt/useResolvedSpeakerSegments";

export function RenderTranscript({
  scrollElement,
  isLastTranscript,
  shouldScrollToEnd,
  transcriptId,
  currentActive,
  captureGeneration = 0,
  liveSegments,
  currentMs,
  seek,
  startPlayback,
  audioExists,
  editMode = false,
}: {
  scrollElement: HTMLDivElement | null;
  isLastTranscript: boolean;
  shouldScrollToEnd: boolean;
  transcriptId: string;
  currentActive: boolean;
  captureGeneration?: number;
  liveSegments: Segment[];
  currentMs: number;
  seek: (sec: number) => void;
  startPlayback: () => void;
  audioExists: boolean;
  editMode?: boolean;
}) {
  return (
    <PersistedTranscript
      scrollElement={scrollElement}
      transcriptId={transcriptId}
      currentActive={currentActive}
      captureGeneration={captureGeneration}
      liveSegments={liveSegments}
      shouldScrollToEnd={isLastTranscript && shouldScrollToEnd}
      currentMs={currentMs}
      seek={seek}
      startPlayback={startPlayback}
      audioExists={audioExists}
      editMode={editMode}
    />
  );
}

function PersistedTranscript({
  scrollElement,
  transcriptId,
  currentActive,
  captureGeneration,
  liveSegments,
  shouldScrollToEnd,
  currentMs,
  seek,
  startPlayback,
  audioExists,
  editMode,
}: {
  scrollElement: HTMLDivElement | null;
  transcriptId: string;
  currentActive: boolean;
  captureGeneration: number;
  liveSegments: Segment[];
  shouldScrollToEnd: boolean;
  currentMs: number;
  seek: (sec: number) => void;
  startPlayback: () => void;
  audioExists: boolean;
  editMode: boolean;
}) {
  const {
    maxSpeakerNumber,
    request,
    segments: storedSegments,
  } = useRenderedTranscriptData(transcriptId, currentActive, captureGeneration);
  const mergedSegments = useMemo(() => {
    if (!currentActive) {
      // Settled transcripts are already merged and labeled by the native
      // render; merging again would join segments the speaker-context
      // labeler intentionally split across intervals.
      return mergeRenderedAndLiveSegments(storedSegments, liveSegments, null);
    }
    return mergeAdjacentSpeakerSegments(
      applyRenderRequestIdentitiesToSegments(
        mergeRenderedAndLiveSegments(storedSegments, liveSegments, request),
        request,
      ),
    );
  }, [currentActive, liveSegments, request, storedSegments]);

  return (
    <TranscriptSegments
      segments={mergedSegments}
      scrollElement={scrollElement}
      transcriptId={transcriptId}
      currentActive={currentActive}
      shouldScrollToEnd={shouldScrollToEnd}
      currentMs={currentMs}
      seek={seek}
      startPlayback={startPlayback}
      audioExists={audioExists}
      maxSpeakerNumber={maxSpeakerNumber}
      request={request}
      editMode={editMode}
    />
  );
}

function TranscriptSegments({
  segments: rawSegments,
  scrollElement,
  transcriptId,
  currentActive,
  shouldScrollToEnd,
  currentMs,
  seek,
  startPlayback,
  audioExists,
  maxSpeakerNumber,
  request,
  editMode,
}: {
  segments: Segment[];
  scrollElement: HTMLDivElement | null;
  transcriptId: string;
  currentActive: boolean;
  shouldScrollToEnd: boolean;
  currentMs: number;
  seek: (sec: number) => void;
  startPlayback: () => void;
  audioExists: boolean;
  maxSpeakerNumber?: number;
  request: RenderTranscriptRequest | null;
  editMode: boolean;
}) {
  const resolvedSegments = useResolvedSpeakerSegments(
    rawSegments,
    currentActive ? request : null,
  );
  const segments = useStableSegments(resolvedSegments);
  const { offsetMs, sessionId } = useTranscriptTimelineMetadata(
    transcriptId,
    !currentActive,
  );
  const labelContext = useMemo<RenderLabelContext | undefined>(() => {
    if (!request) return undefined;

    const names = new Map(
      request.humans.map((human) => [human.human_id, human.name]),
    );
    return {
      getSelfHumanId: () =>
        request.speaker_context
          ? undefined
          : (request.self_human_id ?? undefined),
      getHumanName: (humanId) => names.get(humanId),
      getParticipantHumanIds: () =>
        request.speaker_context ? [] : request.participant_human_ids,
    };
  }, [request]);

  if (segments.length === 0) {
    return null;
  }

  return (
    <SegmentsList
      segments={segments}
      scrollElement={scrollElement}
      transcriptId={transcriptId}
      sessionId={sessionId}
      labelContext={labelContext}
      offsetMs={offsetMs}
      shouldScrollToEnd={shouldScrollToEnd}
      currentMs={currentMs}
      seek={seek}
      startPlayback={startPlayback}
      audioExists={audioExists}
      maxSpeakerNumber={request?.speaker_context ? undefined : maxSpeakerNumber}
      editMode={editMode}
    />
  );
}
