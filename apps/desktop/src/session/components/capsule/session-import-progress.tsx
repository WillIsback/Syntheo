import { useCallback, useEffect, useState } from "react";

import { ImportProgress } from "./import-progress";

import { useBatchEstimate } from "~/stt/batch-eta";
import { useListener } from "~/stt/contexts";

// Import audio en cours pour cette note (issue 526), de la copie du fichier
// à la fin de la transcription.
export function useImportInProgress(sessionId: string) {
  return useListener((state) => sessionId in state.batchImport);
}

// Branché sur le magasin de l'écoute, comme le chrono de l'écoute : la
// capsule ne se redessine pas à chaque seconde.
export function SessionImportProgress({ sessionId }: { sessionId: string }) {
  const { fraction, startedAtMs, transcribing, audioSeconds, indeterminate } =
    useListener((state) => {
      const entry = state.batch[sessionId];
      return {
        fraction: entry?.percentage ?? 0,
        startedAtMs: entry?.startedAtMs,
        // Pendant la copie du fichier, l'avancement n'est pas celui de la
        // transcription : ni estimation ni arrêt.
        transcribing:
          entry !== undefined &&
          entry.phase !== "importing" &&
          !entry.terminalReason,
        audioSeconds: state.batchImport[sessionId]?.audioSeconds ?? null,
        indeterminate: entry?.indeterminate === true,
      };
    });
  const stopTranscription = useListener((state) => state.stopTranscription);
  const stop = useCallback(() => {
    void stopTranscription(sessionId);
  }, [sessionId, stopTranscription]);

  // Mesures relevées chaque seconde depuis le début de la transcription :
  // « Estimation… » tant qu'elles ne suffisent pas (issue 531).
  const estimate = useBatchEstimate({
    active: transcribing && startedAtMs !== undefined,
    fraction,
    startedAtMs,
    audioSeconds,
  });

  const elapsedSeconds = useElapsedSeconds(
    transcribing && indeterminate ? startedAtMs : undefined,
  );

  return (
    <ImportProgress
      progress={{
        fraction,
        estimate,
        onStop: transcribing ? stop : undefined,
        indeterminate: transcribing && indeterminate,
        elapsedSeconds,
      }}
    />
  );
}

// Temps écoulé depuis `startedAtMs`, l'horloge avançant chaque seconde ;
// 0 sans origine.
function useElapsedSeconds(startedAtMs: number | undefined) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (startedAtMs === undefined) {
      return;
    }
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [startedAtMs]);

  return startedAtMs === undefined
    ? 0
    : Math.max(0, (nowMs - startedAtMs) / 1000);
}
