import { t } from "@lingui/core/macro";

import { toast } from "@syntheo/ui/components/ui/toast";

import { requestMainAutoEnhance } from "~/ai/task-window-sync";
import { getEnhancerService, type AutoEnhanceMode } from "~/services/enhancer";
import { dispatchMeetingCompleted } from "~/store/zustand/listener/general-live";
import { listenerStore } from "~/store/zustand/listener/instance";

// Pause de l'écoute (issue 353). Chaque capture mise en pause enregistre son
// transcript mais garde pour plus tard la synthèse qu'elle aurait demandée :
// elle ne part qu'à « Terminer ». Tenue en mémoire seulement : quitter
// l'application pendant la pause termine la session sans synthèse.
const deferredSummaries = new Map<string, AutoEnhanceMode>();

const SUMMARY_MODE_STRENGTH: Record<AutoEnhanceMode, number> = {
  if_empty: 0,
  refresh: 1,
  regenerate: 2,
};

export function strongerSummaryMode(
  left: AutoEnhanceMode,
  right: AutoEnhanceMode | undefined,
): AutoEnhanceMode {
  return right && SUMMARY_MODE_STRENGTH[right] > SUMMARY_MODE_STRENGTH[left]
    ? right
    : left;
}

export function deferPausedSummary(sessionId: string, mode: AutoEnhanceMode) {
  deferredSummaries.set(
    sessionId,
    strongerSummaryMode(mode, deferredSummaries.get(sessionId)),
  );
}

export function takePausedSummary(
  sessionId: string,
): AutoEnhanceMode | undefined {
  const mode = deferredSummaries.get(sessionId);
  deferredSummaries.delete(sessionId);
  return mode;
}

/**
 * « Terminer » pendant la pause : la réunion se termine sans nouvelle capture,
 * puis la synthèse gardée pendant la pause est demandée. Retourne `false` si
 * `sessionId` n'est pas en pause.
 */
export async function finishPausedListening(
  sessionId: string,
  store: Pick<typeof listenerStore, "getState"> = listenerStore,
): Promise<boolean> {
  if (!store.getState().takePausedSession(sessionId)) {
    return false;
  }

  const mode = takePausedSummary(sessionId);
  if (mode) {
    try {
      const service = getEnhancerService();
      if (service) {
        await service.requestAutoEnhance(sessionId, mode);
      } else {
        await requestMainAutoEnhance(sessionId, mode);
      }
    } catch (error) {
      console.error("[listener] failed to schedule summary", error);
      toast.error(
        t`The transcript was saved, but Syntheo could not start the summary. Try generating it again.`,
        { id: "post-capture-summary-failed" },
      );
    }
  }
  dispatchMeetingCompleted(sessionId);
  return true;
}

/** Session en pause dans cette fenêtre, s'il y en a une. */
export function getPausedSessionId(
  store: Pick<typeof listenerStore, "getState"> = listenerStore,
): string | null {
  return store.getState().live.pause?.sessionId ?? null;
}
