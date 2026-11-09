import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useId } from "react";

import { Pause, Play } from "@syntheo/ui/components/icons";
import { cn } from "@syntheo/utils";

import { formatElapsed } from "~/session/components/capsule";
import { useSession } from "~/session/queries";
import { useListener } from "~/stt/contexts";
import { useLiveSeconds } from "~/stt/live-meters";
import { useStartListening } from "~/stt/useStartListening";
import {
  isMainWebviewWindow,
  requestMainListenerControl,
} from "~/stt/window-control";

/**
 * Note dont l'écoute est active ou en pause (issue 517), sinon `null` : la
 * carte « En cours » disparaît à l'arrêt, y compris pendant la finalisation.
 */
export function useHomeLiveSessionId(): string | null {
  return useListener((state) =>
    state.live.pause
      ? state.live.pause.sessionId
      : state.live.status === "active"
        ? state.live.sessionId
        : null,
  );
}

// Même chronomètre que la capsule de note : pauses exclues, et seul ce
// composant se redessine à chaque seconde.
function LiveElapsed({ sessionId }: { sessionId: string }) {
  const { t } = useLingui();
  return (
    <span
      role="timer"
      aria-label={t`Listening time`}
      className="font-mono tabular-nums"
    >
      {formatElapsed(useLiveSeconds(sessionId))}
    </span>
  );
}

const buttonBase = cn([
  "rounded-pill inline-flex items-center gap-1.5 px-3.5 py-[7px] text-[13px] font-medium",
  "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-60 motion-safe:transition-colors",
]);

// Carte « En cours » de l'accueil (issue 517), au-dessus des notes récentes :
// état, durée, titre, « Ouvrir » et « Pause » / « Reprendre ». Les actions
// d'écoute sont celles de la capsule de note (`session-capsule.tsx`).
export function HomeLiveNoteCard({
  sessionId,
  onOpen,
}: {
  sessionId: string;
  onOpen: (sessionId: string) => void;
}) {
  const { t } = useLingui();
  const labelId = useId();
  const session = useSession(sessionId);
  const title = session?.title?.trim() || t`Untitled`;

  const startListening = useStartListening(sessionId);
  const pauseListening = useListener((state) => state.pause);
  const pausePhase = useListener((state) =>
    state.live.pause?.sessionId === sessionId ? state.live.pause.phase : null,
  );
  const resuming = useListener(
    (state) =>
      pausePhase === "paused" &&
      state.live.sessionId === sessionId &&
      state.live.loading,
  );
  const paused = pausePhase !== null;

  const pause = useCallback(() => {
    if (!isMainWebviewWindow()) {
      void requestMainListenerControl("pause", sessionId);
      return;
    }
    pauseListening();
  }, [pauseListening, sessionId]);

  const resume = useCallback(() => {
    if (!isMainWebviewWindow()) {
      void requestMainListenerControl("resume", sessionId);
      return;
    }
    void startListening();
  }, [sessionId, startListening]);

  return (
    <section
      aria-labelledby={labelId}
      data-home-live-note={sessionId}
      className="border-border bg-card text-card-foreground flex flex-col gap-1.5 rounded-lg border px-4 py-3"
    >
      <p className="text-muted-foreground flex items-center gap-2 text-[12px] font-semibold tracking-[0.04em] uppercase">
        {paused ? (
          <Pause aria-hidden="true" className="size-3" />
        ) : (
          <span
            aria-hidden="true"
            data-live-dot
            className="bg-recording size-2 rounded-full motion-safe:animate-pulse"
          />
        )}
        {/* Seul l'état est annoncé : la durée défile sans être lue. */}
        <span id={labelId} role="status" aria-live="polite">
          {paused ? <Trans>Paused</Trans> : <Trans>In progress</Trans>}
        </span>
        <span aria-hidden="true">·</span>
        <LiveElapsed sessionId={sessionId} />
      </p>
      <p className="text-foreground truncate font-serif text-[18px] leading-snug font-medium">
        {title}
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onOpen(sessionId)}
          className={cn([
            buttonBase,
            "border-border text-foreground hover:bg-accent border",
          ])}
        >
          <Trans>Open</Trans>
        </button>
        {paused ? (
          <button
            type="button"
            onClick={resume}
            disabled={pausePhase === "pausing" || resuming}
            className={cn([
              buttonBase,
              "bg-primary text-primary-foreground hover:brightness-110",
            ])}
          >
            <Play aria-hidden="true" className="size-3.5" />
            <Trans>Resume</Trans>
          </button>
        ) : (
          <button
            type="button"
            onClick={pause}
            className={cn([
              buttonBase,
              "bg-primary text-primary-foreground hover:brightness-110",
            ])}
          >
            <Pause aria-hidden="true" className="size-3.5" />
            <Trans>Pause</Trans>
          </button>
        )}
      </div>
    </section>
  );
}
