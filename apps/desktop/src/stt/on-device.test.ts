import { describe, expect, it, vi } from "vitest";

vi.mock("@syntheo/plugin-transcription", () => ({ commands: {} }));

import {
  afterColon,
  isEligible,
  isOnDeviceUsable,
  ON_DEVICE_BASE_URL,
} from "./on-device";
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
        models: {
          kind: "partial",
          presentBytes: 1,
          totalBytes: 2,
          resumable: false,
        },
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

// QA 0.8.0-4 : une phrase insérée après deux-points perd sa majuscule, en
// français comme en anglais, sauf un nom propre ou un sigle.
describe("afterColon", () => {
  it("lowercases the first word of an inserted sentence", () => {
    expect(afterColon("This computer does not allow it.")).toBe(
      "this computer does not allow it.",
    );
    expect(afterColon("Ce poste n'autorise pas l'exécution.")).toBe(
      "ce poste n'autorise pas l'exécution.",
    );
    expect(afterColon("A model file has been modified.")).toBe(
      "a model file has been modified.",
    );
    expect(afterColon("L'opération a échoué.")).toBe("l'opération a échoué.");
    expect(afterColon("Échec.")).toBe("échec.");
  });

  it("keeps proper nouns and acronyms", () => {
    expect(afterColon("Syntheo cannot start.")).toBe("Syntheo cannot start.");
    expect(afterColon("AVX2 is missing.")).toBe("AVX2 is missing.");
    expect(afterColon("")).toBe("");
  });
});
