import { useCallback, useRef } from "react";

import { createCaptureLifecycleSession } from "./capture-lifecycle-session";
import { useListener } from "./contexts";
import { canRunBatchTranscription, useRunBatch } from "./useRunBatch";
import { useSTTConnection } from "./useSTTConnection";

import { useSession, useSessionTranscriptExistence } from "~/session/queries";
import type { CaptureLifecycleMarker } from "~/stt/capture-lifecycle-storage";
import { useSessionParticipantHumanIds } from "~/stt/queries";

export {
  getAudioDurationMs,
  getPostCaptureAction,
  getPostCaptureRepairReasons,
  type PostCaptureRepairReason,
} from "./capture-lifecycle-helpers";

export function useCaptureLifecycle(sessionId: string) {
  const session = useSession(sessionId);
  const transcriptExistence = useSessionTranscriptExistence(sessionId);
  const participantHumanIds = useSessionParticipantHumanIds(sessionId);
  const {
    conn,
    isReady: connectionReady,
    isLoading: connectionLoading,
  } = useSTTConnection();
  const runBatch = useRunBatch(sessionId);
  const setBatchTranscriptionPending = useListener(
    (state) => state.setBatchTranscriptionPending,
  );

  const runBatchRef = useRef(runBatch);
  const canRunBatchRef = useRef(canRunBatchTranscription(conn));
  const stopMeetingChatCaptureRef = useRef<(() => Promise<void>) | null>(null);
  runBatchRef.current = runBatch;
  canRunBatchRef.current = canRunBatchTranscription(conn);

  const stopMeetingChatTasks = useCallback(async () => {
    const stop = stopMeetingChatCaptureRef.current;
    if (!stop) {
      return;
    }
    await stop();
    if (stopMeetingChatCaptureRef.current === stop) {
      stopMeetingChatCaptureRef.current = null;
    }
  }, []);
  const setStopMeetingChatCapture = useCallback(
    (stop: (() => Promise<void>) | null) => {
      stopMeetingChatCaptureRef.current = stop;
    },
    [],
  );

  const createCaptureLifecycle = useCallback(
    (
      recoveredMarker?: CaptureLifecycleMarker,
      startedAutomatically = false,
      pendingMarker?: CaptureLifecycleMarker,
    ) =>
      createCaptureLifecycleSession(
        {
          sessionId,
          sessionTitle: session?.title,
          sessionRawMd: session?.raw_md,
          sessionUserId: session?.user_id,
          connProvider: conn?.provider,
          connModel: conn?.model,
          transcriptExistence,
          runBatchRef,
          canRunBatchRef,
          setBatchTranscriptionPending,
          stopMeetingChatTasks,
        },
        recoveredMarker,
        startedAutomatically,
        pendingMarker,
      ),
    [
      conn?.model,
      conn?.provider,
      participantHumanIds,
      session?.raw_md,
      session?.user_id,
      sessionId,
      setBatchTranscriptionPending,
      stopMeetingChatTasks,
      transcriptExistence,
    ],
  );

  return {
    conn,
    connectionLoading,
    connectionReady,
    createCaptureLifecycle,
    session,
    setStopMeetingChatCapture,
    stopMeetingChatTasks,
  };
}
