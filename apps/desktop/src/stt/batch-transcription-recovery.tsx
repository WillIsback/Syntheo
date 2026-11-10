import { useEffect, useRef, useState } from "react";

import type { TranscriptionSession } from "@syntheo/plugin-transcription";
import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import { getEnhancerService } from "~/services/enhancer";
import { useSession } from "~/session/queries";
import {
  acknowledgeCompletedBatch,
  recoverRunningBatchSessions,
} from "~/store/zustand/listener/general-batch";
import { listenerStore } from "~/store/zustand/listener/instance";
import { notifyResumedImportAbandoned } from "~/stt/audio-import-feedback";
import { parseBatchResumeContext } from "~/stt/batch-resume-context";
import { isStoppedTranscriptionError, useRunBatch } from "~/stt/useRunBatch";

export function BatchTranscriptionRecovery() {
  const [resumable, setResumable] = useState<TranscriptionSession[]>([]);

  useMountEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;

    void recoverRunningBatchSessions(listenerStore.getState, (sessions) => {
      if (active) setResumable(sessions);
    })
      .then((dispose) => {
        if (!active) {
          dispose();
          return;
        }
        stop = dispose;
      })
      .catch((error) => {
        console.error("[listener] failed to recover batch sessions", error);
      });

    return () => {
      active = false;
      stop?.();
    };
  });

  return (
    <>
      {resumable.map((session) => (
        <ResumeBatchTranscription key={session.session_id} session={session} />
      ))}
    </>
  );
}

function ResumeBatchTranscription({
  session,
}: {
  session: TranscriptionSession;
}) {
  const sessionId = session.session_id;
  const record = useSession(sessionId);
  const runBatch = useRunBatch(sessionId);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !record) return;
    const context = parseBatchResumeContext(session.resume_context);
    if (!context || !session.provider || !session.model) return;
    started.current = true;

    void runBatch(session.file_path, {
      promotion: { scope: context.promotion },
      resume: { provider: session.provider, model: session.model },
    })
      .then(() =>
        getEnhancerService()?.queueAutoEnhanceIfSummaryEmpty(sessionId),
      )
      .catch(async (error) => {
        if (isStoppedTranscriptionError(error)) return;
        const message = error instanceof Error ? error.message : String(error);
        console.error("[listener] failed to resume batch transcription", {
          sessionId,
          error: message,
        });
        // Issue 531 : le résultat gardé côté natif n'est plus repris à chaque
        // lancement. La note affiche l'échec, sans relance comme l'onglet
        // Transcription, et un toast le signale une fois.
        listenerStore.getState().handleBatchFailed(sessionId, message);
        await acknowledgeCompletedBatch(sessionId);
        notifyResumedImportAbandoned({
          sessionId,
          name: fileName(session.file_path) ?? (record.title || null),
          error,
        });
      });
  }, [record, runBatch, session, sessionId]);

  return null;
}

function fileName(path: string): string | null {
  return path.split(/[\\/]/).pop() || null;
}
