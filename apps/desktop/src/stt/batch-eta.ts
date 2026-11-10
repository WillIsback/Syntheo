import { t } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";

const MIN_ELAPSED_SECONDS = 3;
const MIN_PROGRESS = 0.02;

/**
 * Durée restante d'une transcription, extrapolée de l'avancement observé
 * depuis `origin`. `null` tant que l'estimation n'aurait pas de sens.
 */
export function estimateRemainingSeconds(
  origin: { atMs: number; fraction: number },
  nowMs: number,
  fraction: number,
): number | null {
  const elapsedSeconds = (nowMs - origin.atMs) / 1000;
  const progressed = fraction - origin.fraction;
  if (
    fraction >= 1 ||
    elapsedSeconds < MIN_ELAPSED_SECONDS ||
    progressed < MIN_PROGRESS
  ) {
    return null;
  }
  return Math.max(0, (elapsedSeconds * (1 - fraction)) / progressed);
}

/**
 * Estimation de la capsule pendant un import (issue 526) : durée restante et
 * accélération (durée audio traitée / temps réel écoulé) depuis le début de
 * la transcription. `null` tant que l'estimation n'est pas fiable ;
 * `speedFactor` reste `null` si la durée de l'audio est inconnue.
 */
export function estimateImportProgress({
  startedAtMs,
  nowMs,
  fraction,
  audioSeconds,
}: {
  startedAtMs: number;
  nowMs: number;
  fraction: number;
  audioSeconds: number | null;
}): { remainingSeconds: number; speedFactor: number | null } | null {
  const remainingSeconds = estimateRemainingSeconds(
    { atMs: startedAtMs, fraction: 0 },
    nowMs,
    fraction,
  );
  if (remainingSeconds === null) {
    return null;
  }
  const elapsedSeconds = (nowMs - startedAtMs) / 1000;
  const speedFactor =
    audioSeconds !== null && audioSeconds > 0
      ? (fraction * audioSeconds) / elapsedSeconds
      : null;
  return { remainingSeconds, speedFactor };
}

export function formatRemainingTime(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) {
    return t`Less than a minute remaining`;
  }
  return t`About ${minutes} min remaining`;
}

const TICK_MS = 1_000;

/**
 * Suit l'avancement d'une transcription pour en estimer la fin (issue 463).
 * L'estimation se recalcule chaque seconde : elle décroît aussi entre deux
 * annonces de progression.
 */
export function useRemainingSeconds(fraction: number | undefined) {
  const active = typeof fraction === "number" && fraction > 0;
  const latest = useRef<number | undefined>(fraction);
  const origin = useRef<{ atMs: number; fraction: number } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    latest.current = fraction;
    if (typeof fraction !== "number" || fraction <= 0) {
      origin.current = null;
    } else {
      origin.current ??= { atMs: Date.now(), fraction };
    }
  }, [fraction]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const id = setInterval(() => {
      const current = latest.current;
      setRemaining(
        origin.current && typeof current === "number"
          ? estimateRemainingSeconds(origin.current, Date.now(), current)
          : null,
      );
    }, TICK_MS);
    return () => {
      clearInterval(id);
      setRemaining(null);
    };
  }, [active]);

  return active ? remaining : null;
}
