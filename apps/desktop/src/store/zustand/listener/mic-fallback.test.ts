import { beforeEach, describe, expect, it, vi } from "vitest";

const { warning } = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock("@syntheo/ui/components/ui/toast", () => ({ toast: { warning } }));

import {
  getMicFallback,
  isMicMonitorRefusal,
  notifyMicFallback,
  notifyMicMonitorRefused,
} from "./mic-fallback";

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

// Issue 715 : l'entrée par défaut restante est le monitor de la sortie ; le
// natif la refuse comme micro et l'interface le dit.
describe("notifyMicMonitorRefused", () => {
  beforeEach(() => warning.mockClear());

  it("recognizes the native refusal only", () => {
    expect(
      isMicMonitorRefusal("audio_mic_unavailable: mic_default_is_monitor"),
    ).toBe(true);
    expect(isMicMonitorRefusal("audio_mic_unavailable: mic_open_failed")).toBe(
      false,
    );
    expect(
      isMicMonitorRefusal("audio_speaker_unavailable: mic_default_is_monitor"),
    ).toBe(false);
  });

  it("says that the system output is not recorded as the microphone", () => {
    const openSettings = vi.fn();
    notifyMicMonitorRefused("session", openSettings);

    expect(warning).toHaveBeenCalledWith(
      "No microphone available",
      expect.objectContaining({
        id: "mic-monitor-session",
        description: expect.stringContaining("not recorded as your microphone"),
      }),
    );
    warning.mock.calls[0]![1].action.onClick();
    expect(openSettings).toHaveBeenCalled();
  });
});
