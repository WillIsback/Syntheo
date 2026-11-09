import { useRef } from "react";

import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import { isLockedFlag } from "~/lock/flag";
import { useAppLock } from "~/lock/store";
import { useSession } from "~/session/queries";
import { useLatestRef } from "~/shared/hooks/useLatestRef";
import { type Tab, useTabs } from "~/store/zustand/tabs";
import { useListener } from "~/stt/contexts";
import { useStartListeningState } from "~/stt/useStartListening";

// Starts listening once for a note opened with `autoStart` (new note that
// records right away, microphone notification). The flag is cleared as soon as
// the attempt is made, abandoned, or times out.
export function SessionAutoStart({ sessionId }: { sessionId: string }) {
  const canStartLiveSession = useListener((state) =>
    state.canStartLiveSession(sessionId),
  );
  const recordingActive = useListener(
    (state) => state.live.status === "active",
  );
  const session = useSession(sessionId);
  const revealed = useAppLock((state) =>
    Boolean(state.revealedNoteIds[sessionId]),
  );
  const locked = isLockedFlag(session?.locked) && !revealed;

  if (recordingActive || (session && locked)) {
    return <AbandonedSessionAutoStart sessionId={sessionId} />;
  }

  return canStartLiveSession && session ? (
    <ReadySessionAutoStart sessionId={sessionId} />
  ) : (
    <PendingSessionAutoStart sessionId={sessionId} />
  );
}

function AbandonedSessionAutoStart({ sessionId }: { sessionId: string }) {
  useMountEffect(() => {
    clearPendingAutoStart(sessionId);
  });

  return null;
}

function PendingSessionAutoStart({ sessionId }: { sessionId: string }) {
  useMountEffect(() => {
    const timeout = setTimeout(() => clearPendingAutoStart(sessionId), 30_000);
    return () => clearTimeout(timeout);
  });

  return null;
}

function ReadySessionAutoStart({ sessionId }: { sessionId: string }) {
  const { connectionReady, startListening } = useStartListeningState(
    sessionId,
    { automatic: true },
  );
  const attemptedRef = useRef(false);

  useMountEffect(() => {
    const timeout = setTimeout(() => clearPendingAutoStart(sessionId), 30_000);
    return () => clearTimeout(timeout);
  });

  return connectionReady ? (
    <StartSessionAutoStart
      attemptedRef={attemptedRef}
      sessionId={sessionId}
      startListening={startListening}
    />
  ) : null;
}

function StartSessionAutoStart({
  attemptedRef,
  sessionId,
  startListening,
}: {
  attemptedRef: { current: boolean };
  sessionId: string;
  startListening: () => Promise<void>;
}) {
  const startListeningRef = useLatestRef(startListening);

  useMountEffect(() => {
    if (attemptedRef.current) {
      return;
    }
    attemptedRef.current = true;
    clearPendingAutoStart(sessionId);
    void startListeningRef.current().catch((error) => {
      console.error("[listener] failed to auto-start session", error);
    });
  });

  return null;
}

function clearPendingAutoStart(sessionId: string) {
  const tabsState = useTabs.getState();
  const currentTab = tabsState.tabs.find(
    (candidate): candidate is Extract<Tab, { type: "sessions" }> =>
      candidate.type === "sessions" && candidate.id === sessionId,
  );
  if (!currentTab?.state.autoStart) {
    return;
  }

  tabsState.updateSessionTabState(currentTab, {
    ...currentTab.state,
    autoStart: null,
  });
}
