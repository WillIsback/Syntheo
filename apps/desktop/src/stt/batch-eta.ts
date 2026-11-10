import { t } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";

// Issue 531 : en début d'import, le débit du premier passage (×3,9) était
// extrapolé tel quel alors que les reconnexions du flux temps réel (limite de
// session toutes les 2 à 4 min) ramènent le débit réel vers ×2,2.
//
// Issue 562 : l'origine des mesures était le début de la phase, avant le
// décodage complet du fichier (~3 min 20 pour 28 min d'audio sous Windows,
// d'après le relevé de l'alpha 0.7.1-3) ; ce décodage, compté comme du temps de transcription, faisait
// afficher « ×0,3 » quand l'avancement en indiquait ×3,8. Les mesures partent
// désormais de la première progression ; un palier en cours ne fait pas
// remonter la durée restante, et la reprise qui le suit est lissée.

/** Aucune estimation avant 30 s de transcription… */
export const ESTIMATE_MIN_ELAPSED_MS = 30_000;
/** …ni avant 5 % de l'audio traité. */
export const ESTIMATE_MIN_PROGRESS = 0.05;
/**
 * Une reprise de l'avancement après une pause plus longue signale une
 * reconnexion mesurée : son coût est alors dans la moyenne.
 */
const STALL_MS = 8_000;
/**
 * Tant qu'aucune pause n'a été mesurée, le coût des reconnexions à venir est
 * inconnu : le débit observé est minoré (×3,9 au départ, ×2,2 à l'arrivée sur
 * l'alpha 0.7.0-6, soit un rapport de 0,56).
 */
const PRE_STALL_PRUDENCE = 0.6;
/**
 * Constante de temps du lissage de la fin affichée : la reprise après une
 * pause, comptée d'un coup dans la moyenne, ne fait pas sauter l'affichage.
 */
const SHOWN_END_TIME_CONSTANT_MS = 30_000;

/** Mesures du débit d'une transcription, mises à jour à chaque seconde. */
export type BatchThroughput = {
  /** Début de la phase : identifie la transcription suivie. */
  startedAtMs: number;
  /**
   * Origine des mesures : la dernière observation avant la première hausse.
   * L'attente qui précède (décodage du fichier, connexion) n'est pas du
   * temps de transcription.
   */
  originMs: number;
  startFraction: number;
  lastAtMs: number;
  fraction: number;
  /** Dernière hausse de l'avancement ; `null` avant la première. */
  lastProgressAtMs: number | null;
  stallSeen: boolean;
  /** Dernière estimation affichée (instant et fin), `null` sans estimation. */
  shown: { atMs: number; endMs: number } | null;
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
    originMs: startedAtMs,
    startFraction,
    lastAtMs: startedAtMs,
    fraction: startFraction,
    // Un avancement déjà entamé progressait à l'origine ; à zéro, l'attente
    // du décodage, de la connexion et du premier passage n'est pas une
    // reconnexion.
    lastProgressAtMs: startFraction > 0 ? startedAtMs : null,
    stallSeen: false,
    shown: null,
  };
}

export function observeBatchThroughput(
  state: BatchThroughput,
  nowMs: number,
  fraction: number,
): BatchThroughput {
  if (nowMs <= state.lastAtMs) {
    return state;
  }
  // Un passage rejoué après une reconnexion peut faire reculer l'avancement :
  // on repart de la nouvelle valeur sans compter de débit négatif.
  const progressed = fraction > state.fraction;
  if (state.lastProgressAtMs === null && !progressed) {
    // Rien n'a encore avancé : l'origine suit.
    return { ...state, originMs: nowMs, lastAtMs: nowMs, fraction };
  }
  let { lastProgressAtMs, stallSeen } = state;
  if (progressed) {
    if (lastProgressAtMs !== null && nowMs - lastProgressAtMs >= STALL_MS) {
      stallSeen = true;
    }
    lastProgressAtMs = nowMs;
  }
  return { ...state, lastAtMs: nowMs, fraction, lastProgressAtMs, stallSeen };
}

/**
 * Durée restante et accélération (durée audio traitée / temps réel) d'après
 * le débit moyen depuis la première progression, reconnexions passées
 * comprises, minoré tant qu'aucune reconnexion n'a été mesurée ; `null` tant
 * que les mesures ne suffisent pas. Pendant une pause en cours, le débit est
 * gelé : sa durée ne compte qu'à la reprise, avec l'avancement qui suit.
 */
export function estimateBatchProgress(
  state: BatchThroughput,
  nowMs: number,
  audioSeconds: number | null,
): BatchEstimate | null {
  const elapsedMs = nowMs - state.originMs;
  const progressed = state.fraction - state.startFraction;
  if (
    state.fraction >= 1 ||
    state.lastProgressAtMs === null ||
    elapsedMs < ESTIMATE_MIN_ELAPSED_MS ||
    progressed < ESTIMATE_MIN_PROGRESS
  ) {
    return null;
  }
  const pausedSinceMs =
    nowMs - state.lastProgressAtMs >= STALL_MS
      ? state.lastProgressAtMs + STALL_MS
      : nowMs;
  let rate = progressed / (pausedSinceMs - state.originMs);
  if (!state.stallSeen) {
    rate *= PRE_STALL_PRUDENCE;
  }
  if (!(rate > 0)) {
    return null;
  }
  return toEstimate(
    state.fraction,
    (1 - state.fraction) / rate / 1000,
    audioSeconds,
  );
}

/**
 * Estimation à afficher : la fin de `estimateBatchProgress` lissée dans le
 * temps. Rend l'état mis à jour avec la fin retenue.
 */
export function settleBatchEstimate(
  state: BatchThroughput,
  nowMs: number,
  audioSeconds: number | null,
): [BatchThroughput, BatchEstimate | null] {
  const raw = estimateBatchProgress(state, nowMs, audioSeconds);
  if (!raw) {
    return [state.shown ? { ...state, shown: null } : state, null];
  }
  let endMs = nowMs + raw.remainingSeconds * 1000;
  if (state.shown) {
    const alpha =
      1 - Math.exp(-(nowMs - state.shown.atMs) / SHOWN_END_TIME_CONSTANT_MS);
    endMs = state.shown.endMs + alpha * (endMs - state.shown.endMs);
  }
  return [
    { ...state, shown: { atMs: nowMs, endMs } },
    toEstimate(state.fraction, Math.max(0, endMs - nowMs) / 1000, audioSeconds),
  ];
}

// L'accélération découle de la durée restante : les deux restent cohérentes.
function toEstimate(
  fraction: number,
  remainingSeconds: number,
  audioSeconds: number | null,
): BatchEstimate {
  return {
    remainingSeconds,
    speedFactor:
      audioSeconds !== null && audioSeconds > 0 && remainingSeconds > 0
        ? ((1 - fraction) * audioSeconds) / remainingSeconds
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
 * 526, 531 et 562). Les mesures et l'estimation se recalculent chaque seconde :
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
      const [next, shown] = settleBatchEstimate(
        observeBatchThroughput(current, nowMs, latest.current.fraction),
        nowMs,
        latest.current.audioSeconds,
      );
      tracker.current = next;
      setEstimate(shown);
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
