import { t } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";

// Issue 531 : en début d'import, le débit du premier passage (×3,9) était
// extrapolé tel quel alors que les reconnexions du flux temps réel (limite de
// session toutes les 2 à 4 min) ramènent le débit réel vers ×2,2.

/** Aucune estimation avant 30 s de transcription… */
export const ESTIMATE_MIN_ELAPSED_MS = 30_000;
/** …ni avant 5 % de l'audio traité. */
export const ESTIMATE_MIN_PROGRESS = 0.05;
/** Constante de temps de la moyenne exponentielle du débit. */
const THROUGHPUT_TIME_CONSTANT_MS = 300_000;
/**
 * Une reprise de l'avancement après une pause plus longue signale une
 * reconnexion mesurée : son coût est alors dans les moyennes.
 */
const STALL_MS = 8_000;
/**
 * Tant qu'aucune pause n'a été mesurée, le coût des reconnexions à venir est
 * inconnu : le débit observé est minoré (×3,9 au départ, ×2,2 à l'arrivée sur
 * l'alpha 0.7.0-6, soit un rapport de 0,56).
 */
const PRE_STALL_PRUDENCE = 0.6;

/** Mesures du débit d'une transcription, mises à jour à chaque seconde. */
export type BatchThroughput = {
  startedAtMs: number;
  startFraction: number;
  lastAtMs: number;
  fraction: number;
  /** Dernière hausse de l'avancement ; `null` avant la première. */
  lastProgressAtMs: number | null;
  /** Moyenne exponentielle du débit, en fraction par milliseconde. */
  rate: number | null;
  stallSeen: boolean;
};

export type BatchEstimate = {
  remainingSeconds: number;
  // `null` quand la durée de l'audio est inconnue.
  speedFactor: number | null;
};

export function startBatchThroughput(
  startedAtMs: number,
  startFraction = 0,
): BatchThroughput {
  return {
    startedAtMs,
    startFraction,
    lastAtMs: startedAtMs,
    fraction: startFraction,
    // Un avancement déjà entamé progressait à l'origine ; à zéro, l'attente
    // de la connexion et du premier passage n'est pas une reconnexion.
    lastProgressAtMs: startFraction > 0 ? startedAtMs : null,
    rate: null,
    stallSeen: false,
  };
}

export function observeBatchThroughput(
  state: BatchThroughput,
  nowMs: number,
  fraction: number,
): BatchThroughput {
  const dt = nowMs - state.lastAtMs;
  if (dt <= 0) {
    return state;
  }
  // Un passage rejoué après une reconnexion peut faire reculer l'avancement :
  // on repart de la nouvelle valeur sans compter de débit négatif.
  const progressed = Math.max(0, fraction - state.fraction);
  let { rate, lastProgressAtMs, stallSeen } = state;

  if (progressed > 0) {
    if (lastProgressAtMs !== null && nowMs - lastProgressAtMs >= STALL_MS) {
      stallSeen = true;
    }
    lastProgressAtMs = nowMs;
  }

  if (rate === null) {
    // La moyenne lissée part du premier passage ; la latence de démarrage
    // (connexion, premier passage) reste dans la moyenne depuis le début.
    if (progressed > 0) {
      rate = progressed / dt;
    }
  } else {
    const alpha = 1 - Math.exp(-dt / THROUGHPUT_TIME_CONSTANT_MS);
    rate += alpha * (progressed / dt - rate);
  }

  return {
    ...state,
    lastAtMs: nowMs,
    fraction,
    lastProgressAtMs,
    rate,
    stallSeen,
  };
}

/**
 * Durée restante et accélération (durée audio traitée / temps réel), `null`
 * tant que les mesures ne suffisent pas. Le débit retenu est le plus prudent
 * de la moyenne lissée et de la moyenne depuis le début, minoré tant
 * qu'aucune reconnexion n'a été mesurée.
 */
export function estimateBatchProgress(
  state: BatchThroughput,
  nowMs: number,
  audioSeconds: number | null,
): BatchEstimate | null {
  const elapsedMs = nowMs - state.startedAtMs;
  const progressed = state.fraction - state.startFraction;
  if (
    state.fraction >= 1 ||
    state.rate === null ||
    elapsedMs < ESTIMATE_MIN_ELAPSED_MS ||
    progressed < ESTIMATE_MIN_PROGRESS
  ) {
    return null;
  }
  let rate = Math.min(state.rate, progressed / elapsedMs);
  if (!state.stallSeen) {
    rate *= PRE_STALL_PRUDENCE;
  }
  if (!(rate > 0)) {
    return null;
  }
  return {
    remainingSeconds: (1 - state.fraction) / rate / 1000,
    speedFactor:
      audioSeconds !== null && audioSeconds > 0
        ? rate * 1000 * audioSeconds
        : null,
  };
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
 * Suit l'avancement d'une transcription pour en estimer la fin (issues 463,
 * 526 et 531). Les mesures et l'estimation se recalculent chaque seconde :
 * l'estimation évolue aussi entre deux annonces de progression. Sans
 * `startedAtMs`, l'origine est la première progression observée.
 */
export function useBatchEstimate({
  active,
  fraction,
  startedAtMs,
  audioSeconds = null,
}: {
  active: boolean;
  fraction: number;
  startedAtMs?: number;
  audioSeconds?: number | null;
}): BatchEstimate | null {
  const latest = useRef({ fraction, audioSeconds });
  const tracker = useRef<BatchThroughput | null>(null);
  const [estimate, setEstimate] = useState<BatchEstimate | null>(null);

  useEffect(() => {
    latest.current = { fraction, audioSeconds };
    if (!active) {
      tracker.current = null;
    } else if (
      startedAtMs !== undefined &&
      tracker.current?.startedAtMs !== startedAtMs
    ) {
      tracker.current = startBatchThroughput(startedAtMs);
    } else if (startedAtMs === undefined) {
      tracker.current ??= startBatchThroughput(Date.now(), fraction);
    }
  }, [active, audioSeconds, fraction, startedAtMs]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const id = setInterval(() => {
      const current = tracker.current;
      if (!current) {
        setEstimate(null);
        return;
      }
      const nowMs = Date.now();
      const next = observeBatchThroughput(
        current,
        nowMs,
        latest.current.fraction,
      );
      tracker.current = next;
      setEstimate(
        estimateBatchProgress(next, nowMs, latest.current.audioSeconds),
      );
    }, TICK_MS);
    return () => {
      clearInterval(id);
      setEstimate(null);
    };
  }, [active]);

  return active ? estimate : null;
}

/** Durée restante seule, pour l'onglet Transcription. */
export function useRemainingSeconds(fraction: number | undefined) {
  const active = typeof fraction === "number" && fraction > 0;
  const estimate = useBatchEstimate({ active, fraction: fraction ?? 0 });
  return estimate?.remainingSeconds ?? null;
}
