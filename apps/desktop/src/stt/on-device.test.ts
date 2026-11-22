import { describe, expect, it, vi } from "vitest";

vi.mock("@syntheo/plugin-transcription", () => ({ commands: {} }));

import { isEligible, isOnDeviceUsable, ON_DEVICE_BASE_URL } from "./on-device";
import { resolveOnDeviceConnection } from "./useSTTConnection";

describe("source « Sur ce poste »", () => {
  it("uses the reserved address, never an editable one", () => {
    const conn = resolveOnDeviceConnection({
      chosen: true,
      allowed: true,
      installed: true,
    });
    expect(conn?.baseUrl).toBe(ON_DEVICE_BASE_URL);
    expect(conn?.baseUrl).not.toContain("provider=");
    expect(conn?.apiKey).toBe("");
  });

  it("does not fall back to the server when the chosen module is missing", () => {
    expect(
      resolveOnDeviceConnection({
        chosen: true,
        allowed: true,
        installed: false,
      }),
    ).toBeNull();
  });

  it("ignores the choice when the organization forbids the module", () => {
    expect(
      resolveOnDeviceConnection({
        chosen: true,
        allowed: false,
        installed: true,
      }),
    ).toBeUndefined();
    expect(
      resolveOnDeviceConnection({
        chosen: false,
        allowed: true,
        installed: true,
      }),
    ).toBeUndefined();
  });

  it("is usable only when allowed, with the companion and the models", () => {
    const installed = { kind: "installed", totalBytes: 1 } as const;
    expect(
      isOnDeviceUsable({
        allowed: true,
        companion: true,
        models: installed,
        downloadable: false,
      }),
    ).toBe(true);
    expect(
      isOnDeviceUsable({
        allowed: true,
        companion: true,
        models: { kind: "partial", presentBytes: 1, totalBytes: 2 },
        downloadable: true,
      }),
    ).toBe(false);
    expect(
      isOnDeviceUsable({
        allowed: true,
        companion: false,
        models: installed,
        downloadable: true,
      }),
    ).toBe(false);
    expect(
      isOnDeviceUsable({
        allowed: false,
        companion: true,
        models: installed,
        downloadable: true,
      }),
    ).toBe(false);
  });

  it("proposes only eligible computers", () => {
    const verdict = (v: unknown) => ({ verdict: v }) as never;
    expect(
      isEligible(verdict({ kind: "propose", profile: "two_streams" })),
    ).toBe(true);
    expect(
      isEligible(verdict({ kind: "propose_degraded", profile: "one_stream" })),
    ).toBe(true);
    expect(isEligible(verdict({ kind: "refuse", reasons: [] }))).toBe(false);
    expect(isEligible(verdict({ kind: "interrupted" }))).toBe(false);
    expect(isEligible(null)).toBe(false);
  });
});
