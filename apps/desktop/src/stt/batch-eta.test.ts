import { describe, expect, test } from "vitest";

import {
  type BatchEstimate,
  estimateBatchProgress,
  formatRemainingTime,
  observeBatchThroughput,
  settleBatchEstimate,
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
        [state, estimates[second]] = settleBatchEstimate(
          observeBatchThroughput(
            state,
            second * 1000,
            processed / audioSeconds,
          ),
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

  test("ignores the wait before the first progress", () => {
    // Issue 562 : 3 min 20 de décodage du fichier puis ×4 sans reconnexion.
    // L'attente n'est pas du temps de transcription : ×4 minoré, pas ×0,6.
    const { estimates } = replay(
      [
        { seconds: 200, speed: 0 },
        { seconds: 2_000, speed: 4 },
      ],
      1_200,
    );
    expect(estimates.slice(1, 230).every((e) => e === null)).toBe(true);
    expect(estimates[240]?.speedFactor).toBeCloseTo(4 * 0.6, 1);
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

// Issue 562, alpha 0.7.1-3 sous Windows : archive.mp4 (27 min 48), relevé de
// la capsule toutes les ~5 s ([seconde, pourcentage affiché]) ; fin réelle à
// 770 s. Le décodage à 0 % qui précède dure ~200 s : c'est l'écart que
// l'ancien calcul doit compter pour afficher « ~92 min · ×0,3 » à 31 s.
const WINDOWS_AUDIO_SECONDS = 27 * 60 + 48;
const WINDOWS_DECODE_SECONDS = 200;
const WINDOWS_END_SECONDS = 770;
const WINDOWS_TRACE: [number, number][] = [
  [0, 0],
  [5, 1],
  [10, 2],
  [16, 3],
  [21, 4],
  [26, 6],
  [31, 7],
  [36, 8],
  [41, 9],
  [46, 10],
  [51, 12],
  [56, 13],
  [61, 14],
  [66, 15],
  [71, 17],
  [76, 18],
  [81, 19],
  [86, 20],
  [91, 21],
  [96, 23],
  [178, 24],
  [183, 26],
  [188, 27],
  [193, 28],
  [198, 29],
  [200, 33],
  [281, 34],
  [286, 35],
  [301, 36],
  [306, 40],
  [311, 42],
  [316, 43],
  [321, 44],
  [326, 45],
  [331, 46],
  [336, 48],
  [341, 49],
  [346, 50],
  [351, 51],
  [356, 53],
  [361, 54],
  [366, 55],
  [372, 56],
  [377, 57],
  [382, 59],
  [387, 60],
  [392, 61],
  [397, 62],
  [402, 63],
  [407, 65],
  [412, 66],
  [417, 67],
  [422, 68],
  [427, 70],
  [432, 71],
  [437, 72],
  [442, 73],
  [447, 74],
  [518, 75],
  [523, 76],
  [528, 77],
  [574, 78],
  [599, 79],
  [604, 80],
  [609, 83],
  [614, 87],
  [619, 89],
  [700, 90],
  [705, 91],
  [710, 93],
  [755, 95],
  [760, 99],
];
// Paliers du relevé : [début, fin] en secondes.
const WINDOWS_PLATEAUS: [number, number][] = [
  [96, 177],
  [200, 280],
  [447, 517],
  [619, 699],
];

/** Avancement affiché à `second` : dernier relevé à cet instant ou avant. */
function windowsFractionAt(second: number) {
  let percent = 0;
  for (const [at, shown] of WINDOWS_TRACE) {
    if (at > second) break;
    percent = shown;
  }
  return percent / 100;
}

function replayWindowsTrace() {
  // La phase commence avec le décodage : l'origine fournie par la capsule.
  let state = startBatchThroughput(-WINDOWS_DECODE_SECONDS * 1000);
  const estimates = new Map<number, BatchEstimate | null>();
  for (
    let second = -WINDOWS_DECODE_SECONDS + 1;
    second < WINDOWS_END_SECONDS;
    second++
  ) {
    const fraction = windowsFractionAt(second);
    let estimate: BatchEstimate | null;
    [state, estimate] = settleBatchEstimate(
      observeBatchThroughput(state, second * 1000, fraction),
      second * 1000,
      WINDOWS_AUDIO_SECONDS,
    );
    estimates.set(second, estimate);
  }
  return estimates;
}

describe("estimateBatchProgress on the Windows 0.7.1-3 trace", () => {
  const estimates = replayWindowsTrace();
  const remainingMinutes = (second: number) =>
    (estimates.get(second)?.remainingSeconds ?? Number.NaN) / 60;

  test("starts from the observed pace, not ×0.3", () => {
    // Avant : « reste ~92 min · ×0,3 » à 31 s, avec 7 % traités en 31 s
    // (×3,8 observé) ; il restait en réalité 12 min 20. La première
    // hausse du relevé arrive à 5 s : l'estimation paraît à 34 s.
    expect(estimates.get(33)).toBeNull();
    for (const second of [34, 36]) {
      expect(remainingMinutes(second)).toBeGreaterThan(6);
      expect(remainingMinutes(second)).toBeLessThan(15);
      const speed = estimates.get(second)?.speedFactor ?? 0;
      expect(speed).toBeGreaterThan(1.8);
      expect(speed).toBeLessThan(3.8);
    }
  });

  test("reads 7 % in 31 s after the decoding as ×3.8 tempered", () => {
    // Avancement continu de 0 à 7 % en 31 s, après 200 s de décodage.
    let state = startBatchThroughput(-200_000);
    let estimate: BatchEstimate | null = null;
    for (let second = -199; second <= 31; second++) {
      const fraction = second > 0 ? (0.07 * second) / 31 : 0;
      [state, estimate] = settleBatchEstimate(
        observeBatchThroughput(state, second * 1000, fraction),
        second * 1000,
        WINDOWS_AUDIO_SECONDS,
      );
    }
    // 31 s pour 7 % : ×3,8, minoré à ×2,3 avant la première reconnexion
    // (×2,2 sur l'ensemble de ce fichier) ; il reste ~11 min, pas 92.
    expect(estimate?.speedFactor).toBeCloseTo(3.77 * 0.6, 1);
    expect((estimate?.remainingSeconds ?? 0) / 60).toBeCloseTo(11.4, 0);
  });

  test("stays within a factor of two of the real end", () => {
    for (let second = 34; second <= 700; second++) {
      const actual = (WINDOWS_END_SECONDS - second) / 60;
      const remaining = remainingMinutes(second);
      expect(remaining, `à ${second} s`).toBeGreaterThan(actual / 2);
      expect(remaining, `à ${second} s`).toBeLessThan(actual * 2);
    }
  });

  test("does not climb back on a plateau", () => {
    for (const [from, to] of WINDOWS_PLATEAUS) {
      const start = remainingMinutes(from);
      for (let second = from; second <= to; second++) {
        // Avant : de 30 à 38 min sur le palier à 23 % (+27 %) ; au plus 5 %.
        expect(remainingMinutes(second), `à ${second} s`).toBeLessThanOrEqual(
          start * 1.05,
        );
      }
    }
  });

  test("keeps the speed consistent with the remaining time", () => {
    for (const second of [36, 101, 200, 351, 500]) {
      const estimate = estimates.get(second);
      const left = (1 - windowsFractionAt(second)) * WINDOWS_AUDIO_SECONDS;
      expect(estimate?.speedFactor).toBeCloseTo(
        left / (estimate?.remainingSeconds ?? 1),
        6,
      );
    }
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
