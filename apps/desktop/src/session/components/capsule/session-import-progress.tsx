import { useCallback } from "react";

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
  const { fraction, startedAtMs, transcribing, audioSeconds } = useListener(
    (state) => {
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
      };
    },
  );
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

  return (
    <ImportProgress
      progress={{
        fraction,
        estimate,
        onStop: transcribing ? stop : undefined,
      }}
    />
  );
}
