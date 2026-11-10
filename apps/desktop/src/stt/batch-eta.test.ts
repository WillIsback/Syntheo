import { describe, expect, test } from "vitest";

import {
  type BatchEstimate,
  estimateBatchProgress,
  formatRemainingTime,
  observeBatchThroughput,
  startBatchThroughput,
} from "./batch-eta";

const AUDIO_SECONDS = 3_600;

type Phase = { seconds: number; speed: number };

/**
 * Rejoue une transcription seconde par seconde, comme le tic de la capsule :
 * chaque phase avance à `speed` secondes d'audio par seconde (0 pendant une
 * connexion ou une reconnexion). Rend l'estimation de chaque seconde et la
 * durée réelle de la transcription.
 */
function replay(phases: Phase[], audioSeconds = AUDIO_SECONDS) {
  let state = startBatchThroughput(0);
  let processed = 0;
  let second = 0;
  const estimates: (BatchEstimate | null)[] = [];
  outer: while (true) {
    for (const phase of phases) {
      for (let i = 0; i < phase.seconds; i++) {
        second += 1;
        processed = Math.min(audioSeconds, processed + phase.speed);
        state = observeBatchThroughput(
          state,
          second * 1000,
          processed / audioSeconds,
        );
        estimates[second] = estimateBatchProgress(
          state,
          second * 1000,
          audioSeconds,
        );
        if (processed >= audioSeconds) break outer;
      }
    }
  }
  return { estimates, totalSeconds: second };
}

// Relevé de l'alpha 0.7.0-6 : ~10 s de connexion, ×3,9 entre deux
// reconnexions toutes les 2 à 3 min, chacune coûtant près de 2 min (renvoi
// de l'audio non finalisé compris) : ×2,2 sur l'ensemble.
const SESSION: Phase[] = [
  { seconds: 10, speed: 0 },
  { seconds: 150, speed: 3.9 },
  { seconds: 110, speed: 0 },
];
const RECONNECTING: Phase[] = [
  ...SESSION,
  ...Array.from({ length: 20 }, () => SESSION.slice(1)).flat(),
];

describe("estimateBatchProgress", () => {
  test("waits for 30 s of transcription and 5 % of the audio", () => {
    const { estimates } = replay(RECONNECTING);
    // 5 % d'une heure à ×3,9 après 10 s de connexion : ~56 s.
    expect(estimates.slice(1, 56).every((e) => e === null)).toBe(true);
    expect(estimates[60]).not.toBeNull();

    // Un audio court atteint vite 5 %, pas les 30 s.
    const short = replay([{ seconds: 100, speed: 4 }], 120);
    expect(short.estimates.slice(1, 30).every((e) => e === null)).toBe(true);
  });

  test("stays cautious about the speed before the first reconnection", () => {
    const { estimates, totalSeconds } = replay(RECONNECTING);
    const actualSpeed = AUDIO_SECONDS / totalSeconds;
    expect(actualSpeed).toBeGreaterThan(2);
    expect(actualSpeed).toBeLessThan(2.4);

    // Avant : « ×3,9 » affiché au départ. Désormais au plus ~×2,4.
    for (const second of [60, 120, 180]) {
      const speed = estimates[second]?.speedFactor ?? 0;
      expect(speed).toBeGreaterThan(1.5);
      expect(speed).toBeLessThan(2.6);
    }
  });

  test("converges on the real pace once reconnections are measured", () => {
    const { estimates, totalSeconds } = replay(RECONNECTING);
    // Après deux reconnexions, la fin estimée reste à 25 % près de la fin
    // réelle, au lieu de deux fois trop tôt.
    for (const second of [600, 900]) {
      const actual = totalSeconds - second;
      const remaining = estimates[second]?.remainingSeconds ?? 0;
      expect(Math.abs(remaining - actual) / actual).toBeLessThan(0.25);
    }
  });

  test("smooths the estimate from one second to the next", () => {
    const { estimates } = replay(RECONNECTING);
    for (let second = 600; second < 1_200; second++) {
      const now = estimates[second]?.remainingSeconds ?? 0;
      const next = estimates[second + 1]?.remainingSeconds ?? 0;
      // Au plus 3 % de saut par seconde, même pendant une reconnexion.
      expect(Math.abs(next - now) / now).toBeLessThan(0.03);
    }
  });

  test("accounts for the startup latency", () => {
    // 20 s de connexion puis ×4 sans reconnexion : à 50 s, ×2,4 réel depuis
    // le début ; la prudence s'y ajoute.
    const { estimates } = replay(
      [
        { seconds: 20, speed: 0 },
        { seconds: 2_000, speed: 4 },
      ],
      1_200,
    );
    expect(estimates[50]?.speedFactor).toBeCloseTo(4 * (30 / 50) * 0.6, 1);
  });

  test("tolerates progress going back after a reconnection", () => {
    let state = startBatchThroughput(0);
    for (let second = 1; second <= 60; second++) {
      state = observeBatchThroughput(state, second * 1000, second / 600);
    }
    state = observeBatchThroughput(state, 61_000, 0.08);
    const estimate = estimateBatchProgress(state, 61_000, 600);
    expect(estimate).not.toBeNull();
    expect(Number.isFinite(estimate?.remainingSeconds)).toBe(true);
    expect(estimate?.remainingSeconds).toBeGreaterThan(0);
  });

  test("gives the remaining time without speed when the audio duration is unknown", () => {
    let state = startBatchThroughput(0);
    for (let second = 1; second <= 60; second++) {
      state = observeBatchThroughput(state, second * 1000, second / 120);
    }
    const estimate = estimateBatchProgress(state, 60_000, null);
    expect(estimate?.remainingSeconds).toBeGreaterThan(60);
    expect(estimate?.speedFactor).toBeNull();
  });

  test("stops estimating at the end", () => {
    let state = startBatchThroughput(0);
    state = observeBatchThroughput(state, 60_000, 1);
    expect(estimateBatchProgress(state, 60_000, 600)).toBeNull();
  });

  test("treats a gap after an already started progress as a pause", () => {
    // Onglet Transcription : l'origine est la première progression vue.
    let state = startBatchThroughput(0, 0.1);
    state = observeBatchThroughput(state, 61_000, 0.2);
    // 10 % par minute, sans minoration : il reste 8 minutes.
    expect(
      estimateBatchProgress(state, 61_000, null)?.remainingSeconds,
    ).toBeCloseTo(488);
  });
});

describe("formatRemainingTime", () => {
  test.each([
    [20, "Less than a minute remaining"],
    [440, "About 7 min remaining"],
  ])("formats %d s", (seconds, expected) => {
    expect(formatRemainingTime(seconds)).toBe(expected);
  });
});
