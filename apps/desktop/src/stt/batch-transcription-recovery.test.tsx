import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode, useSyncExternalStore } from "react";
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
    getState: () => ({
      handleBatchFailed: mocks.handleBatchFailed,
      batch: { "session-1": {} },
    }),
  },
}));

const interrupted = vi.hoisted(() => ({ recover: vi.fn(async () => {}) }));
vi.mock("~/stt/interrupted-imports", () => ({
  recoverInterruptedImports: interrupted.recover,
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: { getState: () => ({ openNew: mocks.openNew }) },
}));

vi.mock("~/session/queries", () => ({
  useSession: (id: string) => ({ id, title: "Entretien Atelier Brun" }),
}));

vi.mock("~/services/enhancer", () => ({ getEnhancerService: () => null }));

// Comme les requêtes en direct de la base (packages/db-react), la connexion de
// transcription reste « en chargement » au premier rendu d'un composant : elle
// n'arrive qu'au rendu suivant, une fois abonné (issue 795).
const connection = vi.hoisted(() => {
  let subscribers = 0;
  const connected = { baseUrl: "http://transcription.test", apiKey: "key" };
  return {
    subscribe: (listener: () => void) => {
      subscribers += 1;
      queueMicrotask(listener);
      return () => {
        subscribers -= 1;
      };
    },
    snapshot: () => (subscribers > 0 ? connected : null),
  };
});
function useConnection() {
  return useSyncExternalStore(connection.subscribe, connection.snapshot);
}

vi.mock("~/stt/useSTTConnection", () => ({
  useSTTConnection: () => ({ isLoading: useConnection() === null }),
}));

// La reprise prend fournisseur et modèle dans la session, mais l'adresse et la
// clé dans la connexion du rendu où runBatch a été créé.
vi.mock("~/stt/useRunBatch", () => ({
  useRunBatch: () => {
    const conn = useConnection();
    return async (...args: unknown[]) => {
      if (!conn?.baseUrl) {
        throw new Error("Transcription server address is missing.");
      }
      return mocks.runBatch(...args);
    };
  },
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

  // Issue 714 : après la liste du natif, les imports interrompus sont
  // repérés ; une session que le natif reprend n'en fait pas partie.
  test("looks for interrupted imports after the native recovery", async () => {
    mocks.runBatch.mockResolvedValue(undefined);
    render(<BatchTranscriptionRecovery />);
    await waitFor(() => expect(interrupted.recover).toHaveBeenCalledOnce());
    const [isStillRunning] = interrupted.recover.mock.calls[0] as unknown as [
      (id: string) => boolean,
    ];
    expect(isStillRunning("session-1")).toBe(true);
    expect(isStillRunning("other")).toBe(false);
  });

  // Issue 795 : si la note arrive avant les réglages, la reprise ne doit pas
  // partir avec la connexion vide du premier rendu.
  test("resumes with the connection known after the first render", async () => {
    mocks.runBatch.mockResolvedValue(undefined);

    render(
      <StrictMode>
        <BatchTranscriptionRecovery />
      </StrictMode>,
    );

    await waitFor(() => expect(mocks.runBatch).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(mocks.runBatch).toHaveBeenCalledWith(SESSION.file_path, {
      promotion: { scope: "whole_session" },
      resume: { provider: "realtime", model: "nvidia-streaming" },
    });
    expect(mocks.handleBatchFailed).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
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
