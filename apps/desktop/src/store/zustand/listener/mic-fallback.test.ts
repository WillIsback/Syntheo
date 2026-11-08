import { beforeEach, describe, expect, it, vi } from "vitest";

const { warning } = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock("@syntheo/ui/components/ui/toast", () => ({ toast: { warning } }));

import { getMicFallback, notifyMicFallback } from "./mic-fallback";

describe("getMicFallback", () => {
  it.each([
    [
      "BRIO 4K Stream Edition",
      "Default Audio Device",
      "BRIO 4K Stream Edition",
    ],
    ["BRIO 4K Stream Edition", "BRIO 4K Stream Edition", null],
    [null, "Default Audio Device", null],
    ["", "Default Audio Device", null],
    ["BRIO 4K Stream Edition", null, null],
  ] as const)("requested %s, opened %s", (requested, opened, expected) => {
    expect(getMicFallback(requested, opened)).toBe(expected);
  });
});

describe("notifyMicFallback", () => {
  beforeEach(() => warning.mockClear());

  it("warns once per session when another microphone opened", () => {
    notifyMicFallback(
      "session",
      "BRIO 4K Stream Edition",
      "Default Audio Device",
      () => {},
    );
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0][1]).toMatchObject({
      id: "mic-fallback-session",
    });
  });

  it("stays silent when the chosen microphone opened", () => {
    notifyMicFallback("session", "BRIO", "BRIO", () => {});
    notifyMicFallback("session", null, "Default Audio Device", () => {});
    expect(warning).not.toHaveBeenCalled();
  });
});
