import { describe, expect, it } from "vitest";

import type { OnDeviceStatus } from "@syntheo/plugin-transcription";

import { getAudioImportAvailability } from "./audio-import-feedback";
import { resolveUsableTranscription } from "./usable-transcription";

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
    ).toMatchObject({ usable: false, active: null, onDeviceNotReady: true });
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

  it("ignores this computer when the organization forbids it", () => {
    expect(
      resolveUsableTranscription({
        serverConfigured: false,
        onDeviceChosen: true,
        onDeviceStatus: { ...ready, allowed: false },
        commissionedProfile: "two_streams",
      }),
    ).toMatchObject({ usable: false, onDeviceNotReady: false });
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
