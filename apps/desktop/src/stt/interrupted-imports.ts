import {
  clearImportPending,
  INTERRUPTED_IMPORT_CODE,
  listPendingImports,
  recordTranscriptionFailure,
} from "~/session/transcription-failure";
import { notifyImportInterrupted } from "~/stt/audio-import-feedback";

/**
 * Au lancement (issue 714) : une note marquée « import en cours » que le
 * natif ne reprend pas a perdu son import à la fermeture de Syntheo. L'échec
 * est gardé dans la note (code « interrupted »), le marqueur retiré, et un
 * avis s'affiche une seule fois.
 */
export async function recoverInterruptedImports(
  isStillRunning: (sessionId: string) => boolean,
): Promise<void> {
  for (const { sessionId, fileName } of await listPendingImports()) {
    if (isStillRunning(sessionId)) continue;
    await recordTranscriptionFailure(
      sessionId,
      new Error("audio import interrupted"),
      INTERRUPTED_IMPORT_CODE,
    );
    await clearImportPending(sessionId);
    notifyImportInterrupted({ sessionId, name: fileName });
  }
}
