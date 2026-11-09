import { describe, expect, test } from "vitest";

import { estimateRemainingSeconds, formatRemainingTime } from "./batch-eta";

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
