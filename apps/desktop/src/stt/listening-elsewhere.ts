import { t } from "@lingui/core/macro";

import { toast } from "@syntheo/ui/components/ui/toast";

import { liveQueryClient } from "~/db";
import type { LiveState } from "~/store/zustand/listener/general-shared-state";
import { listenerStore } from "~/store/zustand/listener/instance";
import {
  resolveLiveSessionTitle,
  useLiveTitle,
} from "~/store/zustand/live-title";

// Une seule écoute à la fois (issue 516) : demander l'écoute d'une note alors
// qu'une autre écoute le dit, et propose d'aller à la note en cours ou de
// l'arrêter (arrêt normal, synthèse comprise) pour démarrer ici.

export const LISTENING_ELSEWHERE_NOTICE_ID = "listening-elsewhere";
const LISTENING_ELSEWHERE_NOTICE_DURATION_MS = 12_000;

export const getListeningElsewhereMessage = (title: string) =>
  t`Listening is already in progress on “${title}”.`;
export const getGoToListeningNoteLabel = () => t`Go to note`;
export const getStopAndStartHereLabel = () => t`Stop and start here`;

type ListenerStoreReader = Pick<typeof listenerStore, "getState">;

/** Note qui écoute en ce moment, si ce n'est pas `sessionId` (sinon `null`). */
export function getListeningElsewhereSessionId(
  live: Pick<LiveState, "status" | "sessionId">,
  sessionId?: string,
): string | null {
  if (live.status !== "active" || !live.sessionId) {
    return null;
  }
  return live.sessionId === sessionId ? null : live.sessionId;
}

/** Titre affiché d'une note : brouillon de titre en direct, sinon titre enregistré. */
export async function getListeningSessionTitle(
  sessionId: string,
): Promise<string> {
  const liveTitle = useLiveTitle.getState().titles[sessionId];
  let storeTitle: string | undefined;
  try {
    const rows = await liveQueryClient.execute<{ title: string }>(
      "SELECT title FROM sessions WHERE id = ? LIMIT 1",
      [sessionId],
    );
    storeTitle = rows[0]?.title;
  } catch (error) {
    console.error("[listener] failed to read the listening note title", error);
  }
  const title =
    liveTitle || storeTitle
      ? resolveLiveSessionTitle(liveTitle, storeTitle).trim()
      : "";
  return title || t`Untitled`;
}

type ListeningElsewhereActions = {
  openNote: (sessionId: string) => void;
  stop: () => void;
  startHere: () => Promise<void>;
};

/**
 * Démarrage refusé : si une autre note écoute, le message s'affiche et
 * `true` est retourné ; sinon (autre raison de refus) rien ne change.
 */
export async function notifyListeningElsewhere(
  sessionId: string,
  actions: ListeningElsewhereActions,
  store: ListenerStoreReader = listenerStore,
): Promise<boolean> {
  const ongoingSessionId = getListeningElsewhereSessionId(
    store.getState().live,
    sessionId,
  );
  if (!ongoingSessionId) {
    return false;
  }

  const title = await getListeningSessionTitle(ongoingSessionId);
  toast.info(getListeningElsewhereMessage(title), {
    id: LISTENING_ELSEWHERE_NOTICE_ID,
    duration: LISTENING_ELSEWHERE_NOTICE_DURATION_MS,
    action: {
      label: getGoToListeningNoteLabel(),
      onClick: () => actions.openNote(ongoingSessionId),
    },
    secondaryAction: {
      label: getStopAndStartHereLabel(),
      onClick: () => {
        // L'écoute a pu changer depuis l'affichage : on n'arrête que celle
        // annoncée, et on ne redémarre pas une note qui écoute déjà.
        const live = store.getState().live;
        if (live.status === "active" && live.sessionId === sessionId) {
          return;
        }
        if (live.status === "active" && live.sessionId === ongoingSessionId) {
          actions.stop();
        }
        void actions.startHere();
      },
    },
  });
  return true;
}
