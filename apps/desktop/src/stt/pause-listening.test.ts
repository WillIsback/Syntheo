import { beforeEach, describe, expect, test, vi } from "vitest";

// Issue 353 : la synthèse gardée pendant la pause ne part qu'à « Terminer »,
// jamais en quittant l'application.

const mocks = vi.hoisted(() => ({
  completeAppExit: vi.fn(),
  dispatchMeetingCompleted: vi.fn(),
  exitListener: null as (() => void) | null,
  requestAutoEnhance: vi.fn(),
  requestMainAutoEnhance: vi.fn(),
  service: null as {
    requestAutoEnhance: (...args: unknown[]) => unknown;
  } | null,
  toastError: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event: string, listener: () => void) => {
    mocks.exitListener = listener;
    return vi.fn();
  }),
}));
vi.mock("@syntheo/plugin-store2", () => ({
  commands: { save: vi.fn(async () => {}) },
}));
vi.mock("~/db/write-queue", () => ({
  flushDatabaseWritesWithin: vi.fn(async () => {}),
}));
vi.mock("~/store/zustand/undo-delete", () => ({
  confirmAllPendingDeletions: vi.fn(async () => {}),
}));
vi.mock("~/types/tauri.gen", () => ({
  commands: { completeAppExit: mocks.completeAppExit },
}));
vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: { error: mocks.toastError },
}));
vi.mock("~/ai/task-window-sync", () => ({
  requestMainAutoEnhance: mocks.requestMainAutoEnhance,
}));
vi.mock("~/services/enhancer", () => ({
  getEnhancerService: () => mocks.service,
}));
vi.mock("~/store/zustand/listener/general-live", () => ({
  dispatchMeetingCompleted: mocks.dispatchMeetingCompleted,
}));
vi.mock("~/store/zustand/listener/instance", () => ({
  listenerStore: { getState: () => ({ live: { pause: null } }) },
}));

function pausedStore(sessionId = "session-1") {
  let pause: { sessionId: string; phase: "paused" } | null = {
    sessionId,
    phase: "paused",
  };
  return {
    getState: () => ({
      live: { pause },
      takePausedSession: (id: string) => {
        if (pause?.sessionId !== id) return false;
        pause = null;
        return true;
      },
    }),
  } as never;
}

describe("pause de l'écoute : fin de réunion", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.exitListener = null;
    mocks.service = { requestAutoEnhance: mocks.requestAutoEnhance };
    mocks.requestAutoEnhance.mockResolvedValue(undefined);
    mocks.requestMainAutoEnhance.mockResolvedValue(undefined);
    mocks.completeAppExit.mockResolvedValue(undefined);
  });

  test("« Terminer » pendant la pause lance la synthèse gardée puis termine la réunion", async () => {
    const { deferPausedSummary, finishPausedListening, takePausedSummary } =
      await import("./pause-listening");
    deferPausedSummary("session-1", "if_empty");
    deferPausedSummary("session-1", "regenerate");
    deferPausedSummary("session-1", "if_empty");

    await expect(
      finishPausedListening("session-1", pausedStore()),
    ).resolves.toBe(true);

    expect(mocks.requestAutoEnhance).toHaveBeenCalledOnce();
    expect(mocks.requestAutoEnhance).toHaveBeenCalledWith(
      "session-1",
      "regenerate",
    );
    expect(mocks.dispatchMeetingCompleted).toHaveBeenCalledWith("session-1");
    expect(takePausedSummary("session-1")).toBeUndefined();
  });

  test("hors pause, « Terminer » ne lance rien", async () => {
    const { deferPausedSummary, finishPausedListening } =
      await import("./pause-listening");
    deferPausedSummary("session-1", "if_empty");

    await expect(
      finishPausedListening("session-2", pausedStore("session-1")),
    ).resolves.toBe(false);

    expect(mocks.requestAutoEnhance).not.toHaveBeenCalled();
    expect(mocks.dispatchMeetingCompleted).not.toHaveBeenCalled();
  });

  test("une pause sans transcript termine la réunion sans synthèse", async () => {
    const { finishPausedListening } = await import("./pause-listening");

    await finishPausedListening("session-1", pausedStore());

    expect(mocks.requestAutoEnhance).not.toHaveBeenCalled();
    expect(mocks.dispatchMeetingCompleted).toHaveBeenCalledWith("session-1");
  });

  test("hors fenêtre principale, la synthèse est demandée à la fenêtre principale", async () => {
    mocks.service = null;
    const { deferPausedSummary, finishPausedListening } =
      await import("./pause-listening");
    deferPausedSummary("session-1", "if_empty");

    await finishPausedListening("session-1", pausedStore());

    expect(mocks.requestMainAutoEnhance).toHaveBeenCalledWith(
      "session-1",
      "if_empty",
    );
  });

  test("quitter l'application pendant la pause ne lance aucune synthèse", async () => {
    const { deferPausedSummary } = await import("./pause-listening");
    deferPausedSummary("session-1", "regenerate");
    const { initializeAppExitFlush } = await import("~/shared/app-exit");
    await initializeAppExitFlush();

    mocks.exitListener?.();

    await vi.waitFor(() =>
      expect(mocks.completeAppExit).toHaveBeenCalledOnce(),
    );
    expect(mocks.requestAutoEnhance).not.toHaveBeenCalled();
    expect(mocks.requestMainAutoEnhance).not.toHaveBeenCalled();
    expect(mocks.dispatchMeetingCompleted).not.toHaveBeenCalled();

    // Réouverture : rien n'a survécu à la sortie, la note attend l'utilisateur
    // (« Reprendre l'écoute » ou « Générer le compte rendu »).
    vi.resetModules();
    const reopened = await import("./pause-listening");
    expect(reopened.takePausedSummary("session-1")).toBeUndefined();
    expect(reopened.getPausedSessionId()).toBeNull();
  });
});
