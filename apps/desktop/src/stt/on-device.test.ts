import { describe, expect, it, vi } from "vitest";

vi.mock("@syntheo/plugin-transcription", () => ({ commands: {} }));

import type { OnDeviceStatus } from "@syntheo/plugin-transcription";

import {
  afterColon,
  describeOnDeviceError,
  describeOnDeviceUnavailability,
  downloadLeftover,
  isEligible,
  isOnDeviceUsable,
  ON_DEVICE_BASE_URL,
  onDeviceUnavailability,
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

// Issue 763 : la source choisie qui ne peut pas servir dit pourquoi, jamais
// « aucun fournisseur ».
describe("onDeviceUnavailability", () => {
  const base: OnDeviceStatus = {
    allowed: true,
    companion: true,
    models: { kind: "installed", totalBytes: 10 },
    downloadable: true,
  };

  it("tells a models update from missing models and a missing companion", () => {
    expect(onDeviceUnavailability(base)).toBeNull();
    expect(onDeviceUnavailability(null)).toBeNull();
    expect(onDeviceUnavailability({ ...base, companion: false })).toBe(
      "companion_missing",
    );
    expect(
      onDeviceUnavailability({
        ...base,
        models: {
          kind: "partial",
          presentBytes: 4,
          totalBytes: 10,
          resumable: false,
        },
      }),
    ).toBe("models_update");
    expect(
      onDeviceUnavailability({
        ...base,
        models: {
          kind: "partial",
          presentBytes: 4,
          totalBytes: 10,
          resumable: true,
        },
      }),
    ).toBe("models_missing");
    expect(
      onDeviceUnavailability({
        ...base,
        models: { kind: "missing", totalBytes: 10 },
      }),
    ).toBe("models_missing");
  });

  it("describes the update without mentioning a provider or an endpoint", () => {
    const message = describeOnDeviceUnavailability("models_update");
    expect(message).toContain("need an update");
    expect(message).not.toMatch(/provider|endpoint/i);
  });
});

// Issue 764 : « reprend là où il s'est arrêté » seulement s'il existe un
// téléchargement partiel.
describe("describeOnDeviceError after a failed download", () => {
  const oldModels = {
    kind: "partial",
    presentBytes: 400,
    totalBytes: 1000,
    resumable: false,
  } as const;

  it("says no connection and keeps the current models when nothing was downloaded", () => {
    const leftover = downloadLeftover(oldModels, oldModels);
    expect(leftover).toBe("nothing_models_kept");
    const message = describeOnDeviceError("network", leftover);
    expect(message).toMatch(/No connection/);
    expect(message).toMatch(/current models are kept/);
    expect(message).toMatch(/Try again/);
    expect(message).not.toMatch(/resumes where it stopped/);

    const fresh = { kind: "missing", totalBytes: 1000 } as const;
    expect(downloadLeftover(fresh, fresh)).toBe("nothing");
    // Sans modèles d'une autre version avant l'essai, rien n'est « gardé ».
    const installed = { kind: "installed", totalBytes: 1000 } as const;
    expect(downloadLeftover(installed, installed)).toBe("nothing");
    const resumableBefore = {
      kind: "partial",
      presentBytes: 300,
      totalBytes: 1000,
      resumable: true,
    } as const;
    expect(
      downloadLeftover(resumableBefore, {
        ...resumableBefore,
        resumable: false,
      }),
    ).toBe("nothing");
    const none = describeOnDeviceError("network", "nothing");
    expect(none).toMatch(/nothing was downloaded/i);
    expect(none).not.toMatch(/current models|resumes/);
  });

  it("promises to resume only when a partial download exists", () => {
    const leftover = downloadLeftover(oldModels, {
      ...oldModels,
      presentBytes: 600,
      resumable: true,
    });
    expect(leftover).toBe("partial");
    expect(describeOnDeviceError("network", leftover)).toMatch(
      /resumes where it stopped/,
    );
    // Un fichier terminé pendant l'essai, sans `.part` : il est gardé.
    expect(
      downloadLeftover(oldModels, { ...oldModels, presentBytes: 700 }),
    ).toBe("partial");
    expect(describeOnDeviceError("cancelled", "partial")).toMatch(
      /resumes where it stopped/,
    );
    expect(describeOnDeviceError("cancelled", "nothing")).toBe(
      "Installation cancelled.",
    );
  });

  // Issue 783 : ces messages s'insèrent après le deux-points de « Les modèles
  // n'ont pas été installés : … » ; ils n'en contiennent pas eux-mêmes.
  it("never contains a colon of its own", () => {
    const codes = [
      "capture_in_progress",
      "disabled",
      "unsafe_path",
      "running",
      "installing",
      "companion_missing",
      "companion_altered",
      "models_missing",
      "models_altered",
      "models_not_found",
      "models_mismatch",
      "not_enough_disk",
      "no_download_source",
      "network",
      "cancelled",
      "measuring",
      "invalid",
      "crashing",
      "execution_blocked",
      "no_commissioning_audio",
      "measure_failed",
      "io",
      "unknown_code",
    ];
    const leftovers = [
      undefined,
      "partial",
      "nothing",
      "nothing_models_kept",
    ] as const;
    for (const code of codes) {
      for (const leftover of leftovers) {
        expect(
          describeOnDeviceError(code, leftover),
          `${code} ${leftover}`,
        ).not.toContain(":");
      }
    }
  });

  it("claims nothing when the state cannot be read", () => {
    expect(downloadLeftover(oldModels, undefined)).toBeUndefined();
    const message = describeOnDeviceError("network");
    expect(message).not.toMatch(/resumes|nothing was downloaded/i);
  });
});
