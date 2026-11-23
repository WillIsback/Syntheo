import { describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn() }));
vi.mock("@syntheo/ui/components/ui/toast", () => ({ toast }));

import {
  type CaptureLifecycleDeps,
  captureIsOnDevice,
} from "./capture-lifecycle-context";
import {
  OnDeviceRepairUnavailableError,
  onDeviceGuardedDeps,
} from "./capture-lifecycle-session";

import type {
  CaptureLifecycleMarker,
  InheritedCapture,
} from "~/stt/capture-lifecycle-storage";

const SERVER_URL = "https://asr.example/v1/realtime?provider=nvidia";

function deps(runBatch: (...args: unknown[]) => unknown): CaptureLifecycleDeps {
  return {
    sessionId: "s",
    sessionTitle: undefined,
    sessionRawMd: undefined,
    sessionUserId: undefined,
    connProvider: "nvidia",
    connModel: "m",
    connOnDevice: true,
    transcriptExistence: false,
    runBatchRef: { current: runBatch as never },
    canRunBatchRef: { current: true },
    setBatchTranscriptionPending: () => {},
    stopMeetingChatTasks: async () => {},
  };
}

const marker = (onDevice?: boolean) =>
  ({ onDevice }) as unknown as CaptureLifecycleMarker;
const inherited = (onDevice?: boolean) =>
  ({ onDevice }) as unknown as InheritedCapture;

// Revue de l'issue 685, constat 1 : une capture « Sur ce poste » ne répare
// jamais par le serveur, ni pendant l'écoute, ni à l'arrêt, ni après un
// redémarrage (marqueur repris).
describe("capture « Sur ce poste »", () => {
  it("takes its source from the capture, the restored marker or an inherited capture", () => {
    expect(captureIsOnDevice(undefined, [], true)).toBe(true);
    expect(captureIsOnDevice(undefined, [], false)).toBe(false);
    // Redémarrage : le marqueur fait foi, pas la connexion du moment.
    expect(captureIsOnDevice(marker(true), [], false)).toBe(true);
    expect(captureIsOnDevice(marker(undefined), [], true)).toBe(false);
    expect(captureIsOnDevice(undefined, [inherited(true)], false)).toBe(true);
    expect(captureIsOnDevice(marker(false), [inherited(true)], false)).toBe(
      true,
    );
  });

  it("never runs a batch: gaps, stop repair and resume are refused", async () => {
    const calls: unknown[][] = [];
    const runBatch = vi.fn((...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve();
    });
    const guarded = onDeviceGuardedDeps(deps(runBatch), true);
    expect(guarded.canRunBatchRef.current).toBe(false);
    for (const path of ["chunk-1.wav", "capture.wav", "resume.wav"]) {
      await expect(
        guarded.runBatchRef.current(path, { baseUrl: SERVER_URL } as never),
      ).rejects.toBeInstanceOf(OnDeviceRepairUnavailableError);
    }
    expect(runBatch).not.toHaveBeenCalled();
    expect(JSON.stringify(calls)).not.toContain(SERVER_URL);
    // Prévenue une fois, avec un message explicite.
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(String(toast.warning.mock.calls[0]?.[0])).toMatch(
      /module of this computer is unavailable/,
    );
  });

  it("leaves server captures untouched", () => {
    const runBatch = vi.fn();
    const base = deps(runBatch);
    expect(onDeviceGuardedDeps(base, false)).toBe(base);
  });
});
