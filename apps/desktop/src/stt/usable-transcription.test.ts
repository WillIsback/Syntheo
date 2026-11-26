import { describe, expect, it } from "vitest";

import type { OnDeviceStatus } from "@syntheo/plugin-transcription";

import { getAudioImportAvailability } from "./audio-import-feedback";
import {
  isTranscriptionLoading,
  resolveUsableTranscription,
} from "./usable-transcription";

const ready: OnDeviceStatus = {
  allowed: true,
  companion: true,
  models: { kind: "installed", totalBytes: 1 },
  downloadable: true,
};

describe("resolveUsableTranscription", () => {
  it("is usable with a configured server", () => {
    expect(
      resolveUsableTranscription({
        serverConfigured: true,
        onDeviceChosen: false,
        onDeviceStatus: null,
        commissionedProfile: null,
      }),
    ).toMatchObject({
      usable: true,
      active: "server",
      onDeviceNotReady: false,
    });
  });

  it("is usable with this computer alone when it is ready", () => {
    expect(
      resolveUsableTranscription({
        serverConfigured: false,
        onDeviceChosen: true,
        onDeviceStatus: ready,
        commissionedProfile: "two_streams",
      }),
    ).toMatchObject({ usable: true, active: "on_device" });
  });

  it("is not usable when this computer is chosen but not measured", () => {
    expect(
      resolveUsableTranscription({
        serverConfigured: false,
        onDeviceChosen: true,
        onDeviceStatus: ready,
        commissionedProfile: null,
      }),
    ).toMatchObject({
      usable: false,
      active: null,
      onDeviceNotReady: true,
      needsProvider: false,
    });
  });

  // Revue de 8d988afd : la case cochée décide, même avec un serveur
  // configuré (l'écoute ne repasse pas par lui).
  it("follows this computer alone when it is chosen, even with a server", () => {
    expect(
      resolveUsableTranscription({
        serverConfigured: true,
        onDeviceChosen: true,
        onDeviceStatus: ready,
        commissionedProfile: null,
      }),
    ).toMatchObject({
      usable: false,
      active: null,
      onDeviceNotReady: true,
      needsProvider: false,
    });
  });

  it("concludes nothing while the state of this computer loads", () => {
    expect(
      resolveUsableTranscription({
        serverConfigured: false,
        onDeviceChosen: true,
        onDeviceStatus: undefined,
        commissionedProfile: undefined,
        isLoading: true,
      }),
    ).toMatchObject({
      usable: false,
      onDeviceNotReady: false,
      needsProvider: false,
      isLoading: true,
    });
  });

  it("asks for a provider only without any source", () => {
    expect(
      resolveUsableTranscription({
        serverConfigured: false,
        onDeviceChosen: false,
        onDeviceStatus: ready,
        commissionedProfile: "two_streams",
      }),
    ).toMatchObject({ usable: false, needsProvider: true });
  });

  it("is not usable without models or companion", () => {
    for (const status of [
      { ...ready, models: { kind: "missing", totalBytes: 1 } },
      { ...ready, companion: false },
    ] as OnDeviceStatus[]) {
      expect(
        resolveUsableTranscription({
          serverConfigured: false,
          onDeviceChosen: true,
          onDeviceStatus: status,
          commissionedProfile: "two_streams",
        }).usable,
      ).toBe(false);
    }
  });

  // Issue 763 : modèles d'une autre version, l'état dit la mise à jour.
  it("flags a models update when the models come from another version", () => {
    const update: OnDeviceStatus = {
      ...ready,
      models: {
        kind: "partial",
        presentBytes: 5,
        totalBytes: 10,
        resumable: false,
      },
    };
    expect(
      resolveUsableTranscription({
        serverConfigured: true,
        onDeviceChosen: true,
        onDeviceStatus: update,
        commissionedProfile: "two_streams",
      }),
    ).toMatchObject({
      usable: false,
      onDeviceNotReady: true,
      onDeviceModelsUpdate: true,
    });
    for (const status of [
      { ...ready, models: { kind: "missing", totalBytes: 1 } },
      {
        ...ready,
        models: {
          kind: "partial",
          presentBytes: 5,
          totalBytes: 10,
          resumable: true,
        },
      },
      ready,
    ] as OnDeviceStatus[]) {
      expect(
        resolveUsableTranscription({
          serverConfigured: false,
          onDeviceChosen: true,
          onDeviceStatus: status,
          commissionedProfile: null,
        }).onDeviceModelsUpdate,
      ).toBe(false);
    }
  });

  it("ignores this computer when the organization forbids it", () => {
    expect(
      resolveUsableTranscription({
        serverConfigured: false,
        onDeviceChosen: true,
        onDeviceStatus: { ...ready, allowed: false },
        commissionedProfile: "two_streams",
      }),
    ).toMatchObject({
      usable: false,
      onDeviceNotReady: false,
      needsProvider: true,
    });
  });
});

describe("isTranscriptionLoading", () => {
  it("waits for settings, providers or the state of this computer", () => {
    expect(
      isTranscriptionLoading({
        connectionLoading: true,
        onDeviceChosen: false,
        onDeviceInstalled: false,
        commissioningLoading: false,
      }),
    ).toBe(true);
  });

  it("waits for the measurement only when this computer is chosen and installed", () => {
    const base = { connectionLoading: false, commissioningLoading: true };
    expect(
      isTranscriptionLoading({
        ...base,
        onDeviceChosen: true,
        onDeviceInstalled: true,
      }),
    ).toBe(true);
    expect(
      isTranscriptionLoading({
        ...base,
        onDeviceChosen: true,
        onDeviceInstalled: false,
      }),
    ).toBe(false);
    expect(
      isTranscriptionLoading({
        ...base,
        onDeviceChosen: false,
        onDeviceInstalled: true,
      }),
    ).toBe(false);
  });
});

describe("audio import with transcription on this computer", () => {
  it("says that importing a file needs a server", () => {
    expect(getAudioImportAvailability(null, true)).toEqual({
      status: "server_required",
    });
    expect(getAudioImportAvailability(null, false)).toEqual({
      status: "no_provider",
    });
  });
});
