import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { StrictMode, useSyncExternalStore } from "react";
import { afterEach, expect, it, vi } from "vitest";

import {
  isAgentRecordingPath,
  RecordingImportWorker,
} from "./recording-import";
import { selectTranscriptionProvider } from "./transcription-route";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  transaction: vi.fn(),
  transcribe: vi.fn(),
  summarize: vi.fn(),
  openRecordingImport: vi.fn(),
  discardAudioUpload: vi.fn(),
  importedPath: "/audio.wav",
}));
vi.mock("@syntheo/plugin-transcription", () => ({
  commands: {
    openRecordingImport: mocks.openRecordingImport,
    discardAudioUpload: mocks.discardAudioUpload,
  },
}));
vi.mock("@syntheo/plugin-settings", () => ({
  commands: { vaultBase: async () => ({ status: "ok", data: "/vault" }) },
}));
vi.mock("~/settings/queries", () => ({ useSettingsReady: () => true }));
vi.mock("~/settings/providers", () => ({
  useAiProvidersState: () => ({ isReady: true }),
}));
vi.mock("~/db", () => ({
  liveQueryClient: { execute: mocks.execute },
  executeTransaction: mocks.transaction,
}));
vi.mock("@syntheo/plugin-fs-sync", () => ({
  commands: {
    audioImport: async () => ({ status: "ok", data: mocks.importedPath }),
  },
}));
vi.mock("~/session/queries", () => ({ useSession: () => ({ id: "meeting" }) }));
// Comme les requêtes en direct de la base (packages/db-react), la connexion de
// transcription reste « en chargement » au premier rendu d'un composant : elle
// n'arrive qu'au rendu suivant, une fois abonné (issue 793).
const connection = vi.hoisted(() => {
  let subscribers = 0;
  return {
    subscribe: (listener: () => void) => {
      subscribers += 1;
      queueMicrotask(listener);
      return () => {
        subscribers -= 1;
      };
    },
    snapshot: () => (subscribers > 0 ? "connected" : null),
  };
});
function useConnection() {
  return useSyncExternalStore(connection.subscribe, connection.snapshot);
}
vi.mock("~/stt/useRunBatch", () => ({
  useRunBatch: () => {
    const conn = useConnection();
    return async (...args: unknown[]) => {
      if (!conn) {
        throw new Error(
          "The selected transcription provider can't transcribe a recording afterwards.",
        );
      }
      return mocks.transcribe(...args);
    };
  },
}));
vi.mock("~/stt/useSTTConnection", () => ({
  useSTTConnection: () => ({ isLoading: useConnection() === null }),
}));
vi.mock("~/services/enhancer", () => ({
  getEnhancerService: () => ({ enhanceAndWait: mocks.summarize }),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

function setupJob(fails: boolean) {
  let status = "queued";
  let summaryStatus = "pending";
  let error: string | null = null;
  let finish: (() => void) | undefined;
  const summary = new Promise<void>((resolve) => {
    finish = resolve;
  });
  mocks.transcribe.mockResolvedValue(undefined);
  mocks.openRecordingImport.mockResolvedValue({
    status: "ok",
    data: "upload-1",
  });
  mocks.discardAudioUpload.mockResolvedValue({ status: "ok", data: null });
  mocks.summarize.mockImplementation(async () => {
    await summary;
    if (fails) throw new Error("provider-secret-must-not-leak");
    return "done";
  });
  mocks.execute.mockImplementation(async (sql: string) => {
    if (sql.includes("RETURNING id")) {
      if (status !== "queued") return [];
      status = "importing";
      return [{ id: "job" }];
    }
    if (sql.includes("file_path != ''")) return [];
    return ["done", "failed"].includes(status)
      ? []
      : [{ id: "job", meeting_id: "meeting", file_path: "/staged.wav" }];
  });
  mocks.transaction.mockImplementation(
    async (statements: { params: unknown[] }[]) => {
      for (const statement of statements) {
        if (statement.params.length === 5) {
          [status, summaryStatus, error] = statement.params as [
            string,
            string,
            string | null,
            string,
            string,
          ];
        }
      }
    },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <RecordingImportWorker />
      </QueryClientProvider>
    </StrictMode>,
  );
  return {
    client,
    view,
    finishSummary: () => finish?.(),
    state: () => ({ status, summaryStatus, error }),
  };
}

it.each([false, true])(
  "survives StrictMode and waits for the summary outcome (failure: %s)",
  async (fails) => {
    vi.useFakeTimers();
    const job = setupJob(fails);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(job.state().status).toBe("summarizing");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(job.state().status).toBe("summarizing");
    await act(async () => {
      job.finishSummary();
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(job.state().status).toBe(fails ? "failed" : "done");
    expect(job.state().summaryStatus).toBe(fails ? "failed" : "done");
    expect(job.state().error ?? "").not.toContain("provider-secret");
    job.client.clear();
  },
);

// Issue 657 : la cible réelle (lien résolu par l'import) est revérifiée.
it("recognizes recording paths by the extension of the resolved file", () => {
  expect(isAgentRecordingPath("/home/me/Réunion.M4A")).toBe(true);
  expect(isAgentRecordingPath("C:\\Users\\me\\call.wav")).toBe(true);
  expect(isAgentRecordingPath("/home/me/.ssh/id_ed25519")).toBe(false);
  expect(isAgentRecordingPath("/home/me/.mp3")).toBe(false);
  expect(isAgentRecordingPath("/srv/notes.mp3/secret.bin")).toBe(false);
});

it("fails an agent import whose resolved file is not a recording", async () => {
  vi.useFakeTimers();
  mocks.importedPath = "/home/me/secret.bin";
  try {
    const job = setupJob(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(job.state().status).toBe("failed");
    expect(mocks.transcribe).not.toHaveBeenCalled();
    job.view.unmount();
    job.client.clear();
  } finally {
    mocks.importedPath = "/audio.wav";
  }
});

// Issue 744 : le fichier est ouvert une seule fois côté Rust, validé sur le
// descripteur ouvert et lu en mémoire ; la transcription reprend ce contenu
// et ne relit jamais le chemin, qui pourrait avoir été remplacé entre-temps.
it("transcribes the recording read once in memory, never its path", async () => {
  vi.useFakeTimers();
  const job = setupJob(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(mocks.openRecordingImport).toHaveBeenCalledWith("/audio.wav");
  expect(mocks.transcribe).toHaveBeenCalledWith("", {
    allowRealtimeStream: true,
    promotion: { scope: "whole_session" },
    audioUploadId: "upload-1",
  });
  await act(async () => {
    job.finishSummary();
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(job.state().status).toBe("done");
  expect(mocks.discardAudioUpload).toHaveBeenCalledWith("upload-1");
  job.view.unmount();
  job.client.clear();
});

// Issue 793 : sans modèle par lot (serveur NVIDIA, NeMo-Speech.cpp), l'import
// d'un agent doit passer par le flux temps réel, comme un fichier déposé.
it("transcribes an agent import with a server that has no batch mode", async () => {
  vi.useFakeTimers();
  const job = setupJob(false);
  mocks.transcribe.mockImplementation(
    async (_path: string, options?: { allowRealtimeStream?: boolean }) => {
      const provider = selectTranscriptionProvider(
        "nvidia",
        "nemotron-3.5-asr-streaming-0.6b",
        options?.allowRealtimeStream === true,
      );
      if (!provider) throw new Error("no transcription provider");
    },
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(job.state().status).toBe("summarizing");
  await act(async () => {
    job.finishSummary();
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(job.state().status).toBe("done");
  job.view.unmount();
  job.client.clear();
});

// Issue 793 : l'import ne doit pas garder la connexion du premier rendu, encore
// vide, mais celle que les réglages chargés donnent ensuite.
it("transcribes with the connection known after the first render", async () => {
  vi.useFakeTimers();
  const job = setupJob(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(mocks.transcribe).toHaveBeenCalledTimes(1);
  expect(job.state().status).toBe("summarizing");
  await act(async () => {
    job.finishSummary();
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(job.state().status).toBe("done");
  job.view.unmount();
  job.client.clear();
});

it("fails an agent import whose recording cannot be opened safely", async () => {
  vi.useFakeTimers();
  const job = setupJob(false);
  mocks.openRecordingImport.mockResolvedValue({
    status: "error",
    error: "audio_source_changed_during_import",
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(job.state().status).toBe("failed");
  expect(mocks.transcribe).not.toHaveBeenCalled();
  job.view.unmount();
  job.client.clear();
});

it("runs imports without any account and finishes them after the worker unmounts", async () => {
  vi.useFakeTimers();
  const job = setupJob(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(job.state().status).toBe("summarizing");
  job.view.unmount();
  await act(async () => {
    job.finishSummary();
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(job.state().status).toBe("done");
  job.client.clear();
});

// Issue #271 : le battement de cœur réécrivait la base toutes les 5 s, même au
// repos, ce qui gardait le journal WAL de SQLite en écriture continue.
it("keeps the idle worker heartbeat to a few database writes per minute", async () => {
  vi.useFakeTimers();
  mocks.execute.mockResolvedValue([]);
  mocks.transaction.mockResolvedValue([]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <RecordingImportWorker />
    </QueryClientProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  const heartbeatWrites = () =>
    mocks.transaction.mock.calls.filter(([statements]) =>
      (statements as { sql: string }[]).some((statement) =>
        statement.sql.includes("local_recording_import_worker"),
      ),
    ).length;
  expect(heartbeatWrites()).toBe(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(heartbeatWrites() - 1).toBeLessThanOrEqual(2);
  view.unmount();
  client.clear();
});

// Issue 794 : l'échec d'un import d'agent n'apparaissait nulle part. Il est
// gardé dans la note (avis d'échec) et journalisé, sans l'adresse ni la clé que
// l'erreur du fournisseur peut contenir.
it("shows a failed agent import in the meeting and logs it without secrets", async () => {
  vi.useFakeTimers();
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const job = setupJob(false);
    mocks.transcribe.mockRejectedValue(
      new Error(
        "UnexpectedStatus { status: 500 } for https://stt.example.test/v1/audio?api_key=sk-provider-secret-123 Bearer abcdefgh12345678",
      ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(job.state().status).toBe("failed");
    expect(job.state().error ?? "").not.toContain("secret");

    const recorded = mocks.transaction.mock.calls
      .flatMap(
        ([statements]) => statements as { sql: string; params: unknown[] }[],
      )
      .find((statement) => statement.sql.includes("$.transcription_failure"));
    expect(recorded?.params[2]).toBe("meeting");
    const failure = JSON.parse(String(recorded?.params[0])) as {
      code: string;
      message: string;
    };
    expect(failure.code).toBe("agent_import");
    expect(failure.message).toContain("500");
    expect(failure.message).not.toMatch(/secret|abcdefgh|\/v1\/audio/);

    const logged = consoleError.mock.calls.find(
      ([first]) =>
        typeof first === "string" && first.startsWith("[recording-import:"),
    );
    expect(logged?.[0]).toMatch(/^\[recording-import:transcribing\] /);
    expect(JSON.stringify(logged)).not.toMatch(/secret|abcdefgh|\/v1\/audio/);
    job.view.unmount();
    job.client.clear();
  } finally {
    consoleError.mockRestore();
  }
});
