import { describe, expect, test } from "vitest";

import {
  estimateImportProgress,
  estimateRemainingSeconds,
  formatRemainingTime,
} from "./batch-eta";

describe("estimateRemainingSeconds", () => {
  const origin = { atMs: 0, fraction: 0.1 };

  test("extrapolates the observed pace", () => {
    // 20 % en 10 s : il reste 70 %, soit 35 s.
    expect(estimateRemainingSeconds(origin, 10_000, 0.3)).toBeCloseTo(35);
  });

  test("waits for enough elapsed time and progress", () => {
    expect(estimateRemainingSeconds(origin, 2_000, 0.3)).toBeNull();
    expect(estimateRemainingSeconds(origin, 10_000, 0.11)).toBeNull();
    expect(estimateRemainingSeconds(origin, 10_000, 1)).toBeNull();
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

describe("estimateImportProgress", () => {
  test("derives the remaining time and the speed from the start of the transcription", () => {
    // 20 % d'un audio de 10 min en 60 s : 120 s d'audio traitées, soit ×2 ;
    // il reste 80 %, soit 240 s.
    const estimate = estimateImportProgress({
      startedAtMs: 0,
      nowMs: 60_000,
      fraction: 0.2,
      audioSeconds: 600,
    });
    expect(estimate?.remainingSeconds).toBeCloseTo(240);
    expect(estimate?.speedFactor).toBeCloseTo(2);
  });

  test("is not reliable during the first seconds", () => {
    expect(
      estimateImportProgress({
        startedAtMs: 0,
        nowMs: 1_000,
        fraction: 0.2,
        audioSeconds: 600,
      }),
    ).toBeNull();
    expect(
      estimateImportProgress({
        startedAtMs: 0,
        nowMs: 60_000,
        fraction: 0.01,
        audioSeconds: 600,
      }),
    ).toBeNull();
  });

  test("gives the remaining time without speed when the audio duration is unknown", () => {
    const estimate = estimateImportProgress({
      startedAtMs: 0,
      nowMs: 60_000,
      fraction: 0.5,
      audioSeconds: null,
    });
    expect(estimate?.remainingSeconds).toBeCloseTo(60);
    expect(estimate?.speedFactor).toBeNull();
  });
});
