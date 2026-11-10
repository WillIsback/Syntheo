import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { TranscriptionSession } from "@syntheo/plugin-transcription";

const mocks = vi.hoisted(() => ({
  runBatch: vi.fn(),
  acknowledgeCompletedBatch: vi.fn(),
  handleBatchFailed: vi.fn(),
  toastError: vi.fn(),
  openNew: vi.fn(),
  sessions: [] as TranscriptionSession[],
}));

vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: { error: mocks.toastError, warning: vi.fn() },
}));

vi.mock("~/store/zustand/listener/general-batch", () => ({
  acknowledgeCompletedBatch: mocks.acknowledgeCompletedBatch,
  recoverRunningBatchSessions: async (
    _get: unknown,
    onResumable: (sessions: TranscriptionSession[]) => void,
  ) => {
    onResumable(mocks.sessions);
    return () => {};
  },
}));

vi.mock("~/store/zustand/listener/instance", () => ({
  listenerStore: {
    getState: () => ({ handleBatchFailed: mocks.handleBatchFailed }),
  },
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: { getState: () => ({ openNew: mocks.openNew }) },
}));

vi.mock("~/session/queries", () => ({
  useSession: (id: string) => ({ id, title: "Entretien Atelier Brun" }),
}));

vi.mock("~/services/enhancer", () => ({ getEnhancerService: () => null }));

vi.mock("./useSTTConnection", () => ({
  useSTTConnection: () => ({ conn: null }),
}));

vi.mock("~/stt/useRunBatch", () => ({
  useRunBatch: () => mocks.runBatch,
  isStoppedTranscriptionError: (error: unknown) =>
    error instanceof Error && error.message === "Transcription stopped.",
}));

import { serializeBatchResumeContext } from "./batch-resume-context";
import { BatchTranscriptionRecovery } from "./batch-transcription-recovery";
import { NoSpeechDetectedError } from "./no-speech-error";

const SESSION: TranscriptionSession = {
  session_id: "session-1",
  file_path: "/home/me/Videos/entretien.mp4",
  provider: "realtime",
  model: "nvidia-streaming",
  started_at_ms: 0,
  resume_context: serializeBatchResumeContext({ promotion: "whole_session" }),
  completed: true,
};

describe("BatchTranscriptionRecovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessions = [SESSION];
    mocks.acknowledgeCompletedBatch.mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  // Issue 531 : un ancien import sans parole était retenté à chaque lancement,
  // sans rien afficher.
  test("abandons a failed resumed import once and says so", async () => {
    mocks.runBatch.mockRejectedValue(new NoSpeechDetectedError());

    render(<BatchTranscriptionRecovery />);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    expect(mocks.runBatch).toHaveBeenCalledTimes(1);
    expect(mocks.handleBatchFailed).toHaveBeenCalledWith(
      "session-1",
      "No speech was detected in the audio.",
    );
    // Le résultat gardé côté natif est abandonné : rien à reprendre au
    // prochain lancement.
    expect(mocks.acknowledgeCompletedBatch).toHaveBeenCalledWith("session-1");

    const [title, options] = mocks.toastError.mock.calls[0]!;
    expect(title).toBe("Audio import failed");
    expect(options.description).toBe(
      "The import of entretien.mp4 was abandoned: No speech was detected in the audio.",
    );
    options.action.onClick();
    expect(mocks.openNew).toHaveBeenCalledWith({
      type: "sessions",
      id: "session-1",
    });
  });

  test("keeps quiet when the user stopped the resumed import", async () => {
    mocks.runBatch.mockRejectedValue(new Error("Transcription stopped."));

    render(<BatchTranscriptionRecovery />);

    await waitFor(() => expect(mocks.runBatch).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(mocks.acknowledgeCompletedBatch).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
