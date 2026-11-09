import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  commands as transcriptionCommands,
  events as transcriptionEvents,
} from "@syntheo/plugin-transcription";

import {
  completeCaptureTranscript,
  loadCaptureStop,
  saveCaptureStop,
} from "./capture-completion";
import { saveIncompleteCapture } from "./capture-result";
import { takePausedSummary } from "./pause-listening";
import {
  getBatchOnlyCaptureMessage,
  getCaptureReminderMessage,
  getNoTranscriptionProviderMessage,
  getPostCaptureAction,
  getPostCaptureRepairReasons,
  sendMeetingRecordingDisclosure,
  useResumeListeningLifecycle,
  useStartListening,
  useStartListeningState,
} from "./useStartListening";

import { playCompletionSound } from "~/shared/completion-sound";
import { useLiveTranscriptionLanguages } from "~/store/zustand/live-transcription-languages";

vi.mock("./capture-completion", () => ({
  completeCaptureTranscript: vi.fn().mockResolvedValue(undefined),
  loadCaptureStop: vi.fn().mockResolvedValue(null),
  saveCaptureStop: vi.fn().mockResolvedValue(undefined),
}));

const m = vi.hoisted(() => ({
  emptyCapture: vi.fn(),
  queueAutoEnhance: vi.fn(),
  queueAutoEnhanceIfSummaryEmpty: vi.fn(),
  resetEnhanceTasks: vi.fn(),
  requestAutoEnhance: vi.fn(),
  attachLiveSession: vi.fn(),
  beginCaptureRecoveryFinalization: vi.fn(),
  finishCaptureRecoveryFinalization: vi.fn(),
  canStartLiveSession: vi.fn(),
  start: vi.fn(),
  getLiveStartError: vi.fn((): string | null => null),
  stop: vi.fn(),
  getSessionMode: vi.fn(),
  setBatchTranscriptionPending: vi.fn(),
  runBatch: vi.fn(),
  useListener: vi.fn(),
  isSessionDeleted: vi.fn(),
  useSession: vi.fn(),
  useSessionHasTranscript: vi.fn(),
  useSessionParticipantHumanIds: vi.fn(),
  getSessionParticipantHumanIds: vi.fn(),
  createLiveTranscript: vi.fn(),
  appendRecoveredTranscriptWords: vi.fn(),
  createNativeTranscriptPersistence: vi.fn(),
  flushLiveTranscriptDeltasToDatabase: vi.fn(),
  transcriptExists: vi.fn(),
  softDeleteTranscript: vi.fn(),
  saveCaptureLifecycleMarker: vi.fn(),
  loadCaptureLifecycleMarker: vi.fn(),
  markCaptureAudioSaved: vi.fn(() => Promise.resolve()),
  clearCaptureAudioSaved: vi.fn(() => Promise.resolve()),
  getCaptureSnapshot: vi.fn(),
  getStoppedCapture: vi.fn(),
  acknowledgeStoppedCapture: vi.fn(),
  clearCaptureLifecycleMarker: vi.fn(),
  requestCaptureRecovery: vi.fn(),
  waitForSessionSearchIndex: vi.fn(),
  useConfigValue: vi.fn(),
  useSTTConnection: vi.fn(),
  isSupportedLanguagesLive: vi.fn(),
  deleteProcessedAudioForRetention: vi.fn(),
  listMicUsingApplications: vi.fn(),
  sendMeetingChatMessage: vi.fn(),
  audioPath: vi.fn(),
  audioSourceMetadata: vi.fn(),
  toastWarning: vi.fn(),
  deleteTranscribedCaptureAudio: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastDismiss: vi.fn(),
  startMeetingChatCapture: vi.fn(),
  stopMeetingChatCapture: vi.fn(),
  catalogLocalSessionAudio: vi.fn(),
  markSessionAudioTranscriptionComplete: vi.fn(),
  getEnhancerService: vi.fn(),
  requestMainAutoEnhance: vi.fn(),
  flushCanonicalSessionEditorChanges: vi.fn(),
  id: vi.fn(() => "generated-id"),
  openNew: vi.fn(),
}));

vi.mock("@syntheo/plugin-db", () => ({
  execute: vi.fn(async () => []),
  executeProxy: vi.fn(async () => []),
  executeTransaction: vi.fn(async () => []),
  subscribe: vi.fn(async () => () => {}),
}));

vi.mock("@syntheo/plugin-transcription", () => ({
  commands: {
    acknowledgeStoppedCapture: m.acknowledgeStoppedCapture,
    getStoppedCapture: m.getStoppedCapture,
    getCaptureAudioGaps: vi.fn(async () => ({ status: "ok", data: null })),
    isSupportedLanguagesLive: m.isSupportedLanguagesLive,
    listCaptureAudioChunks: vi.fn(async () => ({ status: "ok", data: [] })),
    acknowledgeCaptureAudioChunk: vi.fn(async () => ({
      status: "ok",
      data: null,
    })),
    deleteTranscribedCaptureAudio: m.deleteTranscribedCaptureAudio,
    updateCaptureCredentials: vi.fn(async () => ({ status: "ok", data: null })),
    getCaptureSnapshot: m.getCaptureSnapshot,
    listStoppedCaptures: vi.fn(async () => ({ status: "ok", data: [] })),
  },
  events: {
    captureLifecycleEvent: { listen: vi.fn(async () => () => {}) },
    captureStatusEvent: { listen: vi.fn(async () => () => {}) },
  },
}));
vi.mock("./capture-result", () => ({
  saveIncompleteCapture: vi.fn(async () => {}),
  clearIncompleteCapture: vi.fn(async () => {}),
}));
vi.mock("./native-transcript-persistence", () => ({
  createNativeTranscriptPersistence: m.createNativeTranscriptPersistence,
}));
vi.mock("./contexts", () => ({ useListener: m.useListener }));
vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => "macos" }));
vi.mock("@syntheo/plugin-permissions", () => ({
  commands: {
    checkPermission: vi.fn(async () => ({ status: "ok", data: "authorized" })),
  },
}));
vi.mock("@syntheo/plugin-detect", () => ({
  commands: {
    listMicUsingApplications: m.listMicUsingApplications,
    sendMeetingChatMessage: m.sendMeetingChatMessage,
  },
}));
vi.mock("./meeting-consent-store", () => ({
  persistDisclosureAttempt: vi.fn(async () => {}),
  persistParticipantConsent: vi.fn(async () => {}),
}));
vi.mock("./empty-automatic-capture", () => ({
  discardEmptyAutomaticCapture: m.emptyCapture,
}));
vi.mock("@syntheo/plugin-fs-sync", () => ({
  commands: {
    audioExist: vi.fn().mockResolvedValue({ status: "ok", data: false }),
    audioPath: m.audioPath,
    audioSourceMetadata: m.audioSourceMetadata,
  },
}));
vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: {
    warning: m.toastWarning,
    error: m.toastError,
    dismiss: m.toastDismiss,
    info: m.toastInfo,
  },
}));
vi.mock("~/ai/task-window-sync", () => ({
  requestMainAutoEnhance: m.requestMainAutoEnhance,
}));
vi.mock("./meeting-chat-capture", () => ({
  startMeetingChatCapture: m.startMeetingChatCapture,
}));
vi.mock("./meeting-screen-capture", () => ({
  startMeetingScreenCapture: vi.fn(() => async () => {}),
}));
vi.mock("./useKeywords", () => ({
  getSessionKeywords: vi.fn(async () => []),
  useKeywords: vi.fn(() => []),
}));
vi.mock("./useRunBatch", () => ({
  STOPPED_TRANSCRIPTION_ERROR_MESSAGE: "Transcription stopped.",
  canRunBatchTranscription: vi.fn(() => true),
  isStoppedTranscriptionError: vi.fn(
    (error: unknown) =>
      (error instanceof Error ? error.message : String(error)) ===
      "Transcription stopped.",
  ),
  isTerminalTranscriptionError: vi.fn((error: unknown) =>
    /corrupt or unsupported|no speech|authentication failed/i.test(
      error instanceof Error ? error.message : String(error),
    ),
  ),
  reconcileRefinedSpeakerClusters: vi.fn(
    async (_source: unknown, _words: unknown, hints: unknown) => hints,
  ),
  useRunBatch: vi.fn(() => m.runBatch),
}));
vi.mock("./useSTTConnection", () => ({
  useSTTConnection: m.useSTTConnection,
}));
vi.mock("~/services/enhancer", () => ({
  getEnhancerService: m.getEnhancerService,
}));
vi.mock("~/services/audio-retention", () => ({
  deleteProcessedAudioForRetention: m.deleteProcessedAudioForRetention,
  normalizeAudioRetention: (value: unknown) =>
    typeof value === "string" ? value : "forever",
}));
vi.mock("~/session/attachments", () => ({
  catalogLocalSessionAudio: m.catalogLocalSessionAudio,
  markSessionAudioTranscriptionComplete:
    m.markSessionAudioTranscriptionComplete,
}));
vi.mock("~/session/utils", () => ({ getSessionEvent: vi.fn(() => null) }));
vi.mock("~/session/queries", () => ({
  isSessionDeleted: m.isSessionDeleted,
  useSession: m.useSession,
  useSessionTranscriptExistence: m.useSessionHasTranscript,
}));
vi.mock("~/session/editor-activity", () => ({
  flushCanonicalSessionEditorChanges: m.flushCanonicalSessionEditorChanges,
}));
vi.mock("~/shared/config", () => ({ useConfigValue: m.useConfigValue }));
vi.mock("~/shared/completion-sound", () => ({
  playCompletionSound: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/shared/utils", () => ({ id: m.id }));
vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (state: { openNew: typeof m.openNew }) => unknown) =>
    selector({ openNew: m.openNew }),
}));
vi.mock("~/stt/capture-lifecycle-storage", () => ({
  clearCaptureLifecycleMarker: m.clearCaptureLifecycleMarker,
  hasAudioAwaitingUser: (marker: {
    chunkedAudio?: boolean;
    summaryMode?: string;
    inheritedCaptures?: unknown[];
  }) =>
    !marker.summaryMode &&
    (marker.chunkedAudio === true ||
      (marker.inheritedCaptures ?? []).length > 0),
  hasPendingZeroRetentionAudio: (marker: {
    chunkedAudio?: boolean;
    retainAudio?: boolean;
  }) => marker.chunkedAudio === true && marker.retainAudio === false,
  loadCaptureLifecycleMarker: m.loadCaptureLifecycleMarker,
  saveCaptureLifecycleMarker: m.saveCaptureLifecycleMarker,
  markCaptureAudioSaved: m.markCaptureAudioSaved,
  clearCaptureAudioSaved: m.clearCaptureAudioSaved,
}));
vi.mock("~/stt/capture-recovery-requests", () => ({
  requestCaptureRecovery: m.requestCaptureRecovery,
}));
vi.mock("~/stt/search-index-consistency", () => ({
  waitForSessionSearchIndex: m.waitForSessionSearchIndex,
}));
vi.mock("~/stt/queries", () => ({
  appendRecoveredTranscriptWords: m.appendRecoveredTranscriptWords,
  createLiveTranscript: m.createLiveTranscript,
  flushLiveTranscriptDeltasToDatabase: m.flushLiveTranscriptDeltasToDatabase,
  getTranscriptRecord: vi.fn(async () => null),
  softDeleteTranscript: m.softDeleteTranscript,
  transcriptExists: m.transcriptExists,
  useSessionParticipantHumanIds: m.useSessionParticipantHumanIds,
  getSessionParticipantHumanIds: m.getSessionParticipantHumanIds,
}));

const SESSION = "session-1";
const DISCLOSURE_TEXT =
  "J'utilise Syntheo pour transcrire cette réunion ; le transcript est conservé sur mon poste.";

// Configuration par défaut : langue « en », envois automatiques coupés,
// toute autre clé vaut [].
function defaultConfig(key: string): unknown {
  if (key === "ai_language") return "en";
  if (key === "consent_auto_send_chat" || key === "capture_meeting_chat") {
    return false;
  }
  return [];
}
const unset = () => undefined;

function setConfig(
  values: Record<string, unknown>,
  fallback: (key: string) => unknown = defaultConfig,
) {
  m.useConfigValue.mockImplementation((key: string) =>
    key in values ? values[key] : fallback(key),
  );
}

// Marqueur de capture laissé par une session précédente.
function marker(overrides: Record<string, unknown> = {}) {
  return {
    version: 1 as const,
    sessionId: SESSION,
    transcriptId: "transcript-before-reload",
    startedAt: 1_000,
    createdAt: "2026-07-24T00:00:00.000Z",
    audioOffsetMs: 10_000,
    preserveExistingTranscript: true,
    ownerUserId: "user-1",
    memo: "Existing memo",
    ...overrides,
  };
}

// Enchaîne les lectures du marqueur : une Error est rejetée, le reste résolu.
function queueMarkers(...values: unknown[]) {
  for (const value of values) {
    if (value instanceof Error) {
      m.loadCaptureLifecycleMarker.mockRejectedValueOnce(value);
    } else {
      m.loadCaptureLifecycleMarker.mockResolvedValueOnce(value);
    }
  }
}

const stopDetails = (overrides: Record<string, unknown> = {}) => ({
  chunkedAudio: true,
  durationSeconds: 60,
  audioPath: "/tmp/session.mp3",
  requestedLiveTranscription: true,
  liveTranscriptionActive: true,
  needsBatchRepair: false,
  ...overrides,
});

const words = (id: string, startMs = 0, endMs = 500) => ({
  new_words: [{ id, text: id, start_ms: startMs, end_ms: endMs, channel: 0 }],
  replaced_ids: [],
  partials: [],
});

async function startListening(sessionId = SESSION) {
  const hook = renderHook(() => useStartListening(sessionId));
  await act(async () => {
    await hook.result.current();
  });
  return hook;
}

const startCallbacks = (index = 0) => m.start.mock.calls[index]?.[1];

async function stopListening(
  details: Record<string, unknown>,
  sessionId = SESSION,
) {
  await act(async () => {
    await startCallbacks().onStopped(sessionId, details);
  });
}

function emitLifecycleStarted(liveActive: boolean) {
  vi.mocked(
    transcriptionEvents.captureLifecycleEvent.listen,
  ).mock.calls[0]?.[0]?.({
    payload: {
      type: "started",
      session_id: SESSION,
      requested_live_transcription: liveActive,
      live_transcription_active: liveActive,
    },
  } as never);
}

const renderResume = () =>
  renderHook(() => useResumeListeningLifecycle(SESSION));

type ResumeOptions = { abandonOnFailure?: boolean; processStopped?: boolean };

async function expectResume(
  hook: { result: { current: (options?: ResumeOptions) => Promise<string> } },
  expected: string,
  options: ResumeOptions | null = { processStopped: true },
) {
  await act(async () => {
    await expect(hook.result.current(options ?? undefined)).resolves.toBe(
      expected,
    );
  });
}

let disclosureSessionSequence = 0;

function nextDisclosureSessionId() {
  disclosureSessionSequence += 1;
  return `disclosure-session-${disclosureSessionSequence}`;
}

describe("getPostCaptureAction", () => {
  const capture = (overrides: Record<string, unknown> = {}) => ({
    audioPath: "/tmp/session.wav" as string | null,
    liveTranscriptionActive: true,
    needsBatchRepair: false,
    ...overrides,
  });

  test.each([
    {
      name: "reports every reason that requires post-stop transcript repair",
      input: capture({
        liveTranscriptionActive: false,
        needsBatchRepair: true,
        transcriptWriteFailed: true,
      }),
      expected: [
        "live_transcription_unavailable",
        "live_stream_incomplete",
        "transcript_persistence_failed",
      ],
    },
    {
      name: "reports no repair reason for a complete persisted live transcript",
      input: capture(),
      expected: [],
    },
  ])("$name", ({ input, expected }) => {
    expect(getPostCaptureRepairReasons(input)).toEqual(expected);
  });

  test.each([
    {
      name: "runs batch then enhance after record-only capture",
      input: capture({ liveTranscriptionActive: false }),
      canBatch: true,
      expected: "batch_then_enhance",
    },
    {
      name: "enhances immediately when live transcription completed",
      input: capture(),
      canBatch: true,
      expected: "enhance_only",
    },
    {
      name: "repairs the full transcript after live transcription recovered",
      input: capture({ needsBatchRepair: true }),
      canBatch: true,
      expected: "batch_then_enhance",
    },
    {
      name: "repairs the full transcript after a live database write fails",
      input: capture({ transcriptWriteFailed: true }),
      canBatch: true,
      expected: "batch_then_enhance",
    },
    {
      name: "does nothing when batch is needed but no connection is available",
      input: capture({ liveTranscriptionActive: false }),
      canBatch: false,
      expected: "none",
    },
    {
      name: "does nothing when capture finishes without a saved audio path",
      input: capture({ audioPath: null, liveTranscriptionActive: false }),
      canBatch: true,
      expected: "none",
    },
  ])("$name", ({ input, canBatch, expected }) => {
    expect(getPostCaptureAction(input, canBatch)).toBe(expected);
  });
});

describe("useStartListening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.getCaptureSnapshot.mockResolvedValue({
      status: "ok",
      data: { activeSessionId: null, finalizingSessionIds: [] },
    });
    m.getStoppedCapture.mockResolvedValue({ status: "ok", data: null });
    m.acknowledgeStoppedCapture.mockResolvedValue({ status: "ok", data: null });
    m.emptyCapture.mockResolvedValue(false);
    m.id.mockReturnValue("generated-id");

    m.getEnhancerService.mockImplementation(() => ({
      queueAutoEnhance: m.queueAutoEnhance,
      queueAutoEnhanceIfSummaryEmpty: m.queueAutoEnhanceIfSummaryEmpty,
      resetEnhanceTasks: m.resetEnhanceTasks,
      requestAutoEnhance: m.requestAutoEnhance,
    }));
    m.requestAutoEnhance.mockImplementation(
      async (
        targetSessionId: string,
        mode: "regenerate" | "if_empty" | "refresh",
      ) => {
        if (mode !== "regenerate") {
          const result =
            await m.queueAutoEnhanceIfSummaryEmpty(targetSessionId);
          if (mode === "if_empty" || result?.type !== "summary_exists") return;
        }
        await m.resetEnhanceTasks(targetSessionId);
        m.queueAutoEnhance(targetSessionId);
      },
    );
    m.useListener.mockImplementation((selector) =>
      selector({
        attachLiveSession: m.attachLiveSession,
        beginCaptureRecoveryFinalization: m.beginCaptureRecoveryFinalization,
        finishCaptureRecoveryFinalization: m.finishCaptureRecoveryFinalization,
        canStartLiveSession: m.canStartLiveSession,
        getSessionMode: m.getSessionMode,
        getLiveStartError: m.getLiveStartError,
        setBatchTranscriptionPending: m.setBatchTranscriptionPending,
        start: m.start,
        stop: m.stop,
      }),
    );
    m.beginCaptureRecoveryFinalization.mockReturnValue(true);
    m.canStartLiveSession.mockReturnValue(true);
    m.getSessionMode.mockReturnValue("active");
    m.isSessionDeleted.mockResolvedValue(false);
    m.useSession.mockReturnValue({
      id: SESSION,
      user_id: "user-1",
      raw_md: "Existing memo",
    });
    m.useSessionHasTranscript.mockReturnValue(false);
    m.useSessionParticipantHumanIds.mockReturnValue([]);
    m.getSessionParticipantHumanIds.mockImplementation(async () =>
      m.useSessionParticipantHumanIds(),
    );
    m.createLiveTranscript.mockResolvedValue(undefined);
    m.createNativeTranscriptPersistence.mockImplementation(
      ({ afterFlush }) => ({
        flush: vi.fn(async () => afterFlush()),
        hasPendingFailure: vi.fn(() => false),
        dispose: vi.fn(),
      }),
    );
    m.flushLiveTranscriptDeltasToDatabase.mockResolvedValue(undefined);
    m.transcriptExists.mockResolvedValue(false);
    m.softDeleteTranscript.mockResolvedValue(undefined);
    m.saveCaptureLifecycleMarker.mockResolvedValue(undefined);
    m.loadCaptureLifecycleMarker.mockResolvedValue(null);
    m.clearCaptureLifecycleMarker.mockResolvedValue(undefined);
    m.requestCaptureRecovery.mockResolvedValue(undefined);
    m.waitForSessionSearchIndex.mockResolvedValue(undefined);
    m.flushCanonicalSessionEditorChanges.mockResolvedValue(undefined);
    m.catalogLocalSessionAudio.mockResolvedValue(undefined);
    m.markSessionAudioTranscriptionComplete.mockResolvedValue(undefined);
    // Rétention à zéro (règle audio de Syntheo) : l'arrêt supprime l'audio.
    m.deleteTranscribedCaptureAudio.mockResolvedValue({
      status: "ok",
      data: true,
    });
    setConfig({});
    m.useSTTConnection.mockReturnValue({
      conn: {
        provider: "syntheo",
        model: "am-test",
        baseUrl: "http://localhost:8080",
        apiKey: "",
      },
    });
    m.start.mockResolvedValue(true);
    m.attachLiveSession.mockResolvedValue("attached");
    m.runBatch.mockResolvedValue(undefined);
    vi.mocked(transcriptionCommands.listCaptureAudioChunks).mockResolvedValue({
      status: "ok",
      data: [],
    });
    m.isSupportedLanguagesLive.mockResolvedValue({ status: "ok", data: true });
    m.listMicUsingApplications.mockResolvedValue({
      status: "ok",
      data: [{ id: "com.tinyspeck.slackmacgap", name: "Slack" }],
    });
    m.sendMeetingChatMessage.mockResolvedValue({
      status: "ok",
      data: { sent: true, warnings: [] },
    });
    m.audioPath.mockResolvedValue({
      status: "ok",
      data: "/tmp/existing-session.mp3",
    });
    m.audioSourceMetadata.mockResolvedValue({
      status: "ok",
      data: { createdAt: null, modifiedAt: null, durationMs: 60_000 },
    });
    m.startMeetingChatCapture.mockReturnValue(m.stopMeetingChatCapture);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(console.error).mockRestore();
  });

  describe("démarrage", () => {
    test.each([
      { enabled: true, shown: true },
      { enabled: undefined, shown: false },
    ])(
      "shows the participant reminder only when enabled ($enabled)",
      async ({ enabled, shown }) => {
        setConfig({ capture_reminder_enabled: enabled }, unset);
        await startListening();
        if (shown) {
          expect(m.toastInfo).toHaveBeenCalledWith(
            getCaptureReminderMessage(),
            expect.objectContaining({ id: "capture-reminder" }),
          );
        } else {
          expect(m.toastInfo).not.toHaveBeenCalled();
        }
      },
    );

    // Sans recorder, une capture sans STT ne produirait rien : elle est refusée.
    test("no_transcription_provider_refuses_capture", async () => {
      m.useSTTConnection.mockReturnValue({ conn: null });
      await startListening();

      expect(m.start).not.toHaveBeenCalled();
      expect(m.toastError).toHaveBeenCalledWith(
        getNoTranscriptionProviderMessage(),
        expect.objectContaining({
          id: "recording-without-transcription",
          action: expect.anything(),
        }),
      );
      m.toastError.mock.lastCall?.[1]?.action.onClick();
      expect(m.openNew).toHaveBeenCalledWith({
        type: "settings",
        state: { tab: "transcription" },
      });
    });

    test("batch_only_model_cannot_start_capture", async () => {
      m.useSTTConnection.mockReturnValue({
        conn: {
          provider: "openai",
          model: "whisper-1",
          baseUrl: "http://192.168.1.87:8000/v1?provider=openai",
          apiKey: "",
        },
      });
      await startListening();
      expect(m.start).not.toHaveBeenCalled();
      expect(m.toastError).toHaveBeenCalledWith(
        getBatchOnlyCaptureMessage(),
        expect.anything(),
      );
    });

    test("does not replace a capture marker while recovery blocks starting", async () => {
      m.canStartLiveSession.mockReturnValue(false);
      await startListening();

      expect(m.saveCaptureLifecycleMarker).not.toHaveBeenCalled();
      expect(m.start).not.toHaveBeenCalled();
      expect(m.clearCaptureLifecycleMarker).not.toHaveBeenCalled();
    });

    test.each([
      {
        name: "cleans its capture generation when marker persistence fails",
        arrange: () =>
          m.saveCaptureLifecycleMarker.mockRejectedValueOnce(
            new Error("expected 1 affected row, got 0"),
          ),
        started: false,
      },
      {
        name: "survives a failed marker cleanup after a failed marker write",
        arrange: () => {
          m.saveCaptureLifecycleMarker.mockRejectedValueOnce(
            new Error("marker write failed"),
          );
          m.clearCaptureLifecycleMarker.mockRejectedValueOnce(
            new Error("marker cleanup failed"),
          );
        },
        started: false,
      },
      {
        name: "clears the capture marker when native recording start throws",
        arrange: () =>
          m.start.mockRejectedValueOnce(new Error("native start failed")),
        started: true,
      },
    ])("$name", async ({ arrange, started }) => {
      arrange();
      await startListening();

      expect(m.start).toHaveBeenCalledTimes(started ? 1 : 0);
      expect(m.clearCaptureLifecycleMarker).toHaveBeenCalledWith(
        SESSION,
        "generated-id",
      );
      expect(m.softDeleteTranscript).not.toHaveBeenCalled();
    });

    test("shows the stored start error when native capture rejects the start", async () => {
      m.start.mockResolvedValueOnce(false);
      m.getLiveStartError.mockReturnValueOnce("session already running");
      await startListening();

      expect(m.getLiveStartError).toHaveBeenCalledWith(SESSION);
      expect(m.toastError).toHaveBeenCalledWith(
        "Another recording is still running",
        expect.objectContaining({ id: "capture-start-failed" }),
      );
    });

    test("manual recording stays manual while a scheduled start is waiting for the same note", async () => {
      renderHook(() => useStartListeningState(SESSION, { automatic: true }));
      await startListening();
      expect(m.saveCaptureLifecycleMarker).toHaveBeenCalledWith(
        expect.objectContaining({
          automatic: false,
          preserveExistingAudio: true,
        }),
      );
    });

    test("a new recording adopts untranscribed zero-retention audio from the same note", async () => {
      queueMarkers(
        marker({
          chunkedAudio: true,
          retainAudio: false,
          transcriptId: "crashed-transcript",
          createdAt: "2026-01-01T00:00:00.000Z",
          audioOffsetMs: 0,
          preserveExistingTranscript: false,
          memo: "",
        }),
      );
      await startListening();
      expect(m.saveCaptureLifecycleMarker).toHaveBeenCalledWith(
        expect.objectContaining({
          transcriptId: "generated-id",
          inheritedCaptures: [
            expect.objectContaining({
              transcriptId: "crashed-transcript",
              startedAt: 1_000,
              retainAudio: false,
            }),
          ],
        }),
        "crashed-transcript",
      );
    });

    // Issue 450 : la sortie choisie est appliquée au démarrage de l'écoute.
    test.each([
      {
        config: { microphone_device: "External Microphone" },
        expected: { mic_device: "External Microphone" },
      },
      {
        config: {
          speaker_device: "Casque (Jabra Evolve2)",
          microphone_device: "",
        },
        expected: {
          mic_device: null,
          speaker_device: "Casque (Jabra Evolve2)",
        },
      },
    ])(
      "starts capture with the selected devices $expected",
      async ({ config, expected }) => {
        setConfig(config);
        await startListening();
        expect(m.start.mock.calls[0]?.[0]).toMatchObject(expected);
      },
    );

    // Règle audio de Syntheo : la capture ne conserve jamais l'audio.
    test("start_listening_never_retains_audio", async () => {
      setConfig({ audio_retention: "forever" }, unset);
      await startListening();
      expect(m.start.mock.calls[0]?.[0]).toMatchObject({ retain_audio: false });
    });

    test("uses the main language for Deepgram live capture when extras are unsupported", async () => {
      setConfig({ spoken_languages: ["ko"] });
      m.useSTTConnection.mockReturnValue({
        conn: {
          provider: "deepgram",
          model: "nova-3-general",
          baseUrl: "https://api.deepgram.com/v1/listen",
          apiKey: "test-key",
        },
      });
      m.isSupportedLanguagesLive.mockImplementation(
        (_provider, _model, languages) =>
          Promise.resolve({
            status: "ok",
            data: languages.length === 1 && languages[0] === "en",
          }),
      );

      await startListening();

      expect(m.start.mock.calls[0]?.[0]).toMatchObject({
        languages: ["en"],
        transcription_mode: undefined,
      });
      // Issue 351 : plus de toast, l'indication vit dans la marge de la note.
      expect(m.toastWarning).not.toHaveBeenCalled();
      expect(
        useLiveTranscriptionLanguages.getState().bySession[SESSION],
      ).toEqual({ primary: "en", omitted: ["ko"] });
    });

    test("forgets omitted languages when every spoken language is transcribed live", async () => {
      useLiveTranscriptionLanguages.getState().setLanguages(SESSION, {
        languages: ["en"],
        omittedLanguages: ["ko"],
      });
      await startListening();
      expect(
        useLiveTranscriptionLanguages.getState().bySession[SESSION],
      ).toBeUndefined();
    });
  });

  describe("arrêt", () => {
    test("zero retention finalizes the native stop clock before deleting successfully transcribed audio", async () => {
      const stoppedAtMs = Date.now() + 60_000;
      vi.mocked(loadCaptureStop).mockResolvedValueOnce(stoppedAtMs);
      m.useSessionHasTranscript.mockReturnValue(true);
      setConfig({ audio_retention: "none" }, unset);
      await startListening();
      m.getStoppedCapture.mockResolvedValueOnce({
        status: "ok",
        data: {
          stopped_at_ms: stoppedAtMs,
          duration_seconds: 60,
          requested_live_transcription: true,
          live_transcription_active: true,
        },
      });
      await stopListening(stopDetails({ stoppedAtMs }));

      expect(m.deleteTranscribedCaptureAudio).toHaveBeenCalledWith(SESSION);
      expect(saveCaptureStop).toHaveBeenCalledWith(
        SESSION,
        "generated-id",
        stoppedAtMs,
      );
      expect(saveCaptureStop).toHaveBeenCalledWith(
        SESSION,
        "generated-id",
        stoppedAtMs,
        {
          startedAtMs: stoppedAtMs - 60_000,
          requestedLiveTranscription: true,
          liveTranscriptionActiveAtStop: true,
        },
      );
      expect(completeCaptureTranscript).toHaveBeenCalledWith(
        SESSION,
        "generated-id",
        stoppedAtMs,
      );
      expect(saveIncompleteCapture).not.toHaveBeenCalled();
      expect(m.toastWarning).not.toHaveBeenCalledWith(
        "Audio kept to finish your transcript",
        expect.anything(),
      );
    });

    test("does not reprocess a whole chunked recording after recovery has completed", async () => {
      await startListening();
      await stopListening(stopDetails({ needsBatchRepair: true }));
      expect(m.runBatch).not.toHaveBeenCalled();
    });

    test("keeps zero-retention batch-only recordings on the in-meeting chunk path", async () => {
      setConfig({ audio_retention: "none" }, unset);
      await startListening();
      emitLifecycleStarted(false);
      await stopListening(
        stopDetails({
          requestedLiveTranscription: false,
          liveTranscriptionActive: false,
        }),
      );
      expect(m.runBatch).not.toHaveBeenCalled();
    });

    test("repairs retained batch-only chunks when the full recording is missing at stop", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const capturedAt = new Date("2026-07-24T00:00:00.000Z").getTime();
      vi.setSystemTime(capturedAt);
      vi.mocked(transcriptionCommands.listCaptureAudioChunks).mockResolvedValue(
        {
          status: "ok",
          data: [
            {
              id: "chunk-1",
              path: "/tmp/chunk-1.ogg",
              capture_started_at: capturedAt,
              start_ms: 0,
              audio_start_ms: 0,
              end_ms: 60_000,
            },
          ],
        },
      );
      await startListening();
      vi.setSystemTime(capturedAt + 120_000);
      emitLifecycleStarted(false);
      await stopListening(
        stopDetails({
          durationSeconds: 120,
          audioPath: null,
          requestedLiveTranscription: false,
          liveTranscriptionActive: false,
        }),
      );
      expect(m.runBatch.mock.calls.map(([path]) => path)).toEqual([
        "/tmp/chunk-1.ogg",
      ]);
    });

    test("never claims that zero-retention audio was deleted when native cleanup failed", async () => {
      setConfig({ audio_retention: "none" }, unset);
      await startListening();
      await stopListening(stopDetails({ audioDeletionFailed: true }));

      expect(saveIncompleteCapture).toHaveBeenCalledWith(
        SESSION,
        "generated-id",
        false,
        true,
        false,
        [],
      );
      expect(m.toastError).toHaveBeenCalledWith(
        "Audio could not be deleted",
        expect.anything(),
      );
      expect(m.toastError).not.toHaveBeenCalledWith(
        "Your transcript is incomplete",
        expect.anything(),
      );
      expect(m.runBatch).not.toHaveBeenCalled();
    });

    test("regenerates the summary after resumed live capture is journaled", async () => {
      m.createNativeTranscriptPersistence.mockImplementationOnce(
        ({ afterFlush, onPersisted, sessionId, transcriptId }) => ({
          flush: vi.fn(async () => {
            onPersisted({
              session_id: sessionId,
              transcript_id: transcriptId,
              transcript_created: true,
              persisted_through_ms: 500,
              error: null,
            });
            await afterFlush();
          }),
          hasPendingFailure: vi.fn(() => false),
          dispose: vi.fn(),
        }),
      );
      m.useSessionHasTranscript.mockReturnValue(true);
      await startListening();

      const handlePersist = startCallbacks()?.handlePersist;
      expect(handlePersist).toBeTypeOf("function");
      act(() => {
        handlePersist?.(words("new-word", 100, 200));
      });

      const stopped = startCallbacks().onStopped(
        SESSION,
        stopDetails({
          chunkedAudio: undefined,
          durationSeconds: 42,
          audioPath: "/tmp/session.wav",
        }),
      );
      expect(m.resetEnhanceTasks).not.toHaveBeenCalled();
      await act(async () => await stopped);

      expect(m.resetEnhanceTasks).toHaveBeenCalledWith(SESSION);
      expect(m.queueAutoEnhance).toHaveBeenCalledWith(SESSION);
      expect(m.queueAutoEnhanceIfSummaryEmpty).not.toHaveBeenCalled();
    });

    // Règle audio de Syntheo : une coupure STT est un résultat final (trou
    // daté), pas une réparation à faire ; la réunion se termine normalement.
    // Issue #446 : une coupure que le rejeu natif a entièrement rattrapée
    // n'a rien perdu ; aucun bandeau « Transcription interrompue ».
    test.each([
      { gapReplayed: false, reconnectAt: 1_040_000 },
      { gapReplayed: true, reconnectAt: 1_011_000 },
    ])(
      "stt interruption still summarizes; dated gap only if not replayed ($gapReplayed)",
      async ({ gapReplayed, reconnectAt }) => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(1_000_000);
        await startListening();
        startCallbacks().handlePersist(words("Bonjour"));
        const status = vi.mocked(transcriptionEvents.captureStatusEvent.listen)
          .mock.calls[0]?.[0];
        vi.setSystemTime(1_010_000);
        status?.({
          payload: { type: "connection_error", session_id: SESSION },
        } as never);
        vi.setSystemTime(reconnectAt);
        status?.({
          payload: {
            type: "connected",
            session_id: SESSION,
            gap_replayed: gapReplayed,
          },
        } as never);
        vi.setSystemTime(1_060_000);
        vi.mocked(saveIncompleteCapture).mockClear();
        await stopListening(stopDetails({ audioPath: null }));

        expect(m.requestAutoEnhance).toHaveBeenCalledWith(
          SESSION,
          expect.any(String),
        );
        expect(m.requestCaptureRecovery).not.toHaveBeenCalled();
        if (gapReplayed) {
          expect(saveIncompleteCapture).not.toHaveBeenCalled();
        } else {
          expect(vi.mocked(saveIncompleteCapture).mock.lastCall?.[5]).toEqual([
            expect.objectContaining({ endedAt: 1_040_000 }),
          ]);
        }
      },
    );
  });

  describe("reprise après rechargement", () => {
    test("retains the marker until a failed editor flush recovers", async () => {
      m.flushCanonicalSessionEditorChanges.mockRejectedValueOnce(
        new Error("database is locked"),
      );
      await startListening();
      await stopListening(
        stopDetails({
          chunkedAudio: undefined,
          durationSeconds: 0,
          audioPath: null,
          requestedLiveTranscription: false,
          liveTranscriptionActive: false,
        }),
      );

      expect(m.requestCaptureRecovery).toHaveBeenCalledWith(SESSION);
      expect(m.clearCaptureLifecycleMarker).not.toHaveBeenCalled();

      const finalizing = marker({
        phase: "finalizing",
        transcriptId: "generated-id",
        audioOffsetMs: 0,
        preserveExistingTranscript: false,
      });
      m.attachLiveSession.mockResolvedValue("inactive");
      queueMarkers(finalizing, finalizing, null);
      await expectResume(renderResume(), "inactive");

      expect(m.flushCanonicalSessionEditorChanges).toHaveBeenCalledTimes(2);
      expect(m.clearCaptureLifecycleMarker).toHaveBeenCalledWith(
        SESSION,
        "generated-id",
      );
    });

    test("requeues recovery when post-stop finalization fails after reattaching", async () => {
      m.transcriptExists.mockRejectedValueOnce(new Error("database is locked"));
      const saved = marker();
      m.loadCaptureLifecycleMarker.mockResolvedValue(saved);
      const resume = renderResume();
      await expectResume(resume, "attached");

      const onStopped = m.attachLiveSession.mock.calls[0]?.[1]?.onStopped;
      resume.unmount();
      await act(async () => {
        await expect(
          onStopped?.(
            SESSION,
            stopDetails({
              chunkedAudio: undefined,
              durationSeconds: 61,
              audioPath: "/tmp/session.wav",
            }),
          ),
        ).rejects.toThrow("database is locked");
      });

      expect(m.requestCaptureRecovery).toHaveBeenCalledWith(SESSION);

      m.loadCaptureLifecycleMarker.mockReset();
      queueMarkers(saved, saved, null);
      m.attachLiveSession.mockResolvedValue("inactive");
      await expectResume(renderResume(), "inactive");
    });

    test("accepts a live delta delivered while reattaching", async () => {
      m.useSessionHasTranscript.mockReturnValue(true);
      m.transcriptExists.mockResolvedValue(true);
      m.loadCaptureLifecycleMarker.mockResolvedValue(marker());
      m.attachLiveSession.mockImplementationOnce(
        async (_sessionId, callbacks) => {
          callbacks?.handlePersist?.(
            words("word-during-reattach", 60_000, 60_500),
          );
          return "attached";
        },
      );
      await expectResume(renderResume(), "attached");
      expect(m.attachLiveSession).toHaveBeenCalledOnce();
    });

    test("reattached stop still schedules a summary while transcript state loads", async () => {
      m.useSessionHasTranscript.mockReturnValue(null);
      const resume = renderResume();
      await act(async () => {
        await resume.result.current({ processStopped: true });
      });

      const onStopped = m.attachLiveSession.mock.calls[0]?.[1]?.onStopped;
      await act(async () => {
        await onStopped?.(
          SESSION,
          stopDetails({
            chunkedAudio: undefined,
            durationSeconds: 61,
            audioPath: null,
          }),
        );
      });

      // Sans batch post-arrêt (aucun audio conservé), le résumé est demandé
      // sans régénération forcée.
      expect(m.requestAutoEnhance).toHaveBeenCalledWith(
        SESSION,
        expect.any(String),
      );
    });

    test("keeps an attached capture when its marker retry budget is exhausted", async () => {
      m.saveCaptureLifecycleMarker.mockRejectedValue(
        new Error("marker write failed"),
      );
      await expectResume(renderResume(), "attached", {
        abandonOnFailure: true,
        processStopped: true,
      });

      expect(m.attachLiveSession).toHaveBeenCalledOnce();
      expect(m.clearCaptureLifecycleMarker).not.toHaveBeenCalled();
    });

    test("rechecks for a native stopped outcome after attaching listeners", async () => {
      m.attachLiveSession.mockResolvedValue("inactive");
      const saved = marker({
        chunkedAudio: true,
        retainAudio: true,
        provider: "elevenlabs",
        model: "scribe_v2",
      });
      queueMarkers(saved, saved, null);
      m.getStoppedCapture
        .mockResolvedValueOnce({ status: "ok", data: null })
        .mockResolvedValueOnce({
          status: "ok",
          data: {
            session_id: SESSION,
            stopped_at_ms: 123456,
            duration_seconds: 42,
            chunked_audio: true,
            audio_path: "/tmp/native-session.wav",
            requested_live_transcription: true,
            live_transcription_active: false,
            error: null,
          },
        });
      await expectResume(renderResume(), "inactive", null);

      expect(m.getStoppedCapture).toHaveBeenCalledTimes(2);
      expect(m.acknowledgeStoppedCapture).toHaveBeenCalledWith(SESSION, 123456);
    });

    test("retries a durable summary without re-transcribing completed live text", async () => {
      m.attachLiveSession.mockResolvedValue("inactive");
      const saved = marker({ summaryMode: "regenerate" });
      queueMarkers(saved, saved, null);
      await expectResume(renderResume(), "inactive");

      expect(m.runBatch).not.toHaveBeenCalled();
      expect(m.resetEnhanceTasks).toHaveBeenCalledWith(SESSION);
      expect(m.queueAutoEnhance).toHaveBeenCalledWith(SESSION);
      expect(m.saveCaptureLifecycleMarker).not.toHaveBeenCalled();
      expect(m.clearCaptureLifecycleMarker).toHaveBeenCalledWith(
        SESSION,
        "transcript-before-reload",
      );
    });

    test("keeps synthetic recovery ownership without repeating failure toasts", async () => {
      m.attachLiveSession.mockResolvedValue("inactive");
      m.runBatch
        .mockRejectedValueOnce(new Error("temporary repair failure"))
        .mockResolvedValueOnce(undefined);
      const saved = marker();
      queueMarkers(saved, saved, saved, saved, null);
      const resume = renderResume();

      await expectResume(resume, "error");
      expect(m.toastError).not.toHaveBeenCalled();
      await expectResume(resume, "inactive");

      expect(m.runBatch).toHaveBeenCalledTimes(2);
      expect(m.beginCaptureRecoveryFinalization).toHaveBeenCalledOnce();
      expect(m.finishCaptureRecoveryFinalization).toHaveBeenCalledOnce();
    });

    test("preserves and reloads recovery after a transient marker read failure", async () => {
      m.attachLiveSession.mockResolvedValue("inactive");
      const saved = marker();
      queueMarkers(new Error("database is locked"), saved, saved, null);
      const resume = renderResume();

      await expectResume(resume, "error", {
        abandonOnFailure: true,
        processStopped: true,
      });
      expect(m.clearCaptureLifecycleMarker).not.toHaveBeenCalled();
      await expectResume(resume, "inactive");

      expect(m.runBatch).toHaveBeenCalledOnce();
      expect(m.beginCaptureRecoveryFinalization).toHaveBeenCalledOnce();
      expect(m.finishCaptureRecoveryFinalization).toHaveBeenCalledOnce();
    });

    test("releases recovery ownership after the retry budget is exhausted", async () => {
      m.attachLiveSession.mockResolvedValue("inactive");
      m.runBatch.mockRejectedValue(new Error("temporary repair failure"));
      m.loadCaptureLifecycleMarker.mockResolvedValue(marker());
      await expectResume(renderResume(), "error", {
        abandonOnFailure: true,
        processStopped: true,
      });

      expect(m.clearCaptureLifecycleMarker).toHaveBeenCalledWith(
        SESSION,
        "transcript-before-reload",
      );
      expect(m.beginCaptureRecoveryFinalization).toHaveBeenCalledOnce();
      expect(m.finishCaptureRecoveryFinalization).toHaveBeenCalledWith(SESSION);
    });

    test("keeps recovery ownership when the completion marker read fails", async () => {
      m.attachLiveSession.mockResolvedValue("inactive");
      const saved = marker();
      queueMarkers(saved, saved, new Error("database is locked"), null);
      const resume = renderResume();

      await act(async () => {
        await expect(
          resume.result.current({ processStopped: true }),
        ).rejects.toThrow("database is locked");
      });
      await expectResume(resume, "inactive");

      expect(m.runBatch).toHaveBeenCalledOnce();
      expect(m.beginCaptureRecoveryFinalization).toHaveBeenCalledOnce();
      expect(m.finishCaptureRecoveryFinalization).toHaveBeenCalledOnce();
    });

    test("stays inactive when reattach confirms there is no active capture to recover", async () => {
      m.attachLiveSession.mockResolvedValue("inactive");
      await expectResume(renderResume(), "inactive");
      expect(m.saveCaptureLifecycleMarker).not.toHaveBeenCalled();
    });

    test("does not synthesize a stop when the native snapshot is unavailable", async () => {
      m.attachLiveSession.mockResolvedValue("error");
      m.loadCaptureLifecycleMarker.mockResolvedValue(marker());
      await expectResume(renderResume(), "error");

      expect(m.runBatch).not.toHaveBeenCalled();
      expect(m.beginCaptureRecoveryFinalization).not.toHaveBeenCalled();
      expect(m.finishCaptureRecoveryFinalization).not.toHaveBeenCalled();
      expect(m.clearCaptureLifecycleMarker).not.toHaveBeenCalled();
      expect(m.markSessionAudioTranscriptionComplete).not.toHaveBeenCalled();
      expect(m.deleteProcessedAudioForRetention).not.toHaveBeenCalled();
    });

    test("keeps recovery across a snapshot error until inactivity is proven", async () => {
      m.attachLiveSession
        .mockResolvedValueOnce("error")
        .mockResolvedValueOnce("inactive");
      queueMarkers(marker(), null);
      const resume = renderResume();
      await expectResume(resume, "error");
      await expectResume(resume, "inactive");
    });

    test("waits for native stop ownership before retrying recovery", async () => {
      m.attachLiveSession.mockResolvedValue("inactive");
      m.beginCaptureRecoveryFinalization
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      const saved = marker();
      queueMarkers(saved, saved, saved, null);
      const resume = renderResume();

      await expectResume(resume, "error");
      expect(m.runBatch).not.toHaveBeenCalled();
      expect(m.finishCaptureRecoveryFinalization).not.toHaveBeenCalled();

      await expectResume(resume, "inactive");
      expect(m.beginCaptureRecoveryFinalization).toHaveBeenCalledTimes(2);
      expect(m.runBatch).toHaveBeenCalledOnce();
      expect(m.finishCaptureRecoveryFinalization).toHaveBeenCalledOnce();
    });

    test("preserves recovery state when another worker owns finalization", async () => {
      m.attachLiveSession.mockResolvedValue("inactive");
      m.beginCaptureRecoveryFinalization.mockReturnValue(false);
      m.loadCaptureLifecycleMarker.mockResolvedValue(marker());
      await expectResume(renderResume(), "error", {
        abandonOnFailure: true,
        processStopped: true,
      });

      expect(m.clearCaptureLifecycleMarker).not.toHaveBeenCalled();
      expect(m.finishCaptureRecoveryFinalization).not.toHaveBeenCalled();
    });

    test("does not restart cancelled recovery after reattaching or reloading", async () => {
      m.attachLiveSession.mockResolvedValue("inactive");
      let pendingMarker: ReturnType<typeof marker> | null = marker();
      m.loadCaptureLifecycleMarker.mockImplementation(
        async () => pendingMarker,
      );
      m.clearCaptureLifecycleMarker.mockImplementation(async () => {
        pendingMarker = null;
      });
      m.runBatch.mockRejectedValueOnce(new Error("Transcription stopped."));
      const recovery = renderResume();

      await expectResume(recovery, "inactive");
      await expectResume(recovery, "inactive");
      recovery.unmount();
      await expectResume(renderResume(), "inactive");

      expect(m.runBatch).toHaveBeenCalledOnce();
      expect(m.clearCaptureLifecycleMarker).toHaveBeenCalledWith(
        SESSION,
        "transcript-before-reload",
      );
      expect(m.finishCaptureRecoveryFinalization).toHaveBeenCalledOnce();
      expect(m.requestCaptureRecovery).not.toHaveBeenCalled();
      expect(m.requestAutoEnhance).not.toHaveBeenCalled();
      expect(m.markSessionAudioTranscriptionComplete).not.toHaveBeenCalled();
      expect(m.deleteProcessedAudioForRetention).not.toHaveBeenCalled();
      expect(m.softDeleteTranscript).not.toHaveBeenCalled();
    });

    // Plus d'invite « audio sauvegardé » : une capture arrêtée hors de
    // l'interface est finalisée au lieu d'attendre indéfiniment.
    test("stopped_capture_marker_is_finalized_instead_of_awaiting_user", async () => {
      m.attachLiveSession.mockResolvedValue("inactive");
      m.loadCaptureLifecycleMarker.mockResolvedValue(
        marker({
          chunkedAudio: true,
          retainAudio: false,
          transcriptId: "transcript-before-crash",
          createdAt: "2026-10-25T00:00:00.000Z",
          audioOffsetMs: 0,
          preserveExistingTranscript: false,
          memo: "",
        }),
      );
      const resume = renderResume();
      let outcome: string | undefined;
      await act(async () => {
        outcome = await resume.result.current();
      });
      expect(outcome).not.toBe("awaiting_user");
      expect(m.markCaptureAudioSaved).not.toHaveBeenCalled();
    });
  });

  describe("annonce et chat de réunion", () => {
    test("does not send the disclosure but captures the chat when auto-post is disabled", async () => {
      m.listMicUsingApplications.mockResolvedValue({
        status: "ok",
        data: [{ id: "com.google.Chrome", name: "Google Chrome" }],
      });
      await startListening();

      await waitFor(() => {
        expect(m.startMeetingChatCapture).toHaveBeenCalledWith({
          sessionId: SESSION,
          excludedTexts: [DISCLOSURE_TEXT],
          onParticipantDeclined: expect.any(Function),
        });
      });
      expect(m.sendMeetingChatMessage).not.toHaveBeenCalled();
      expect(m.listMicUsingApplications).not.toHaveBeenCalled();

      await stopListening(
        stopDetails({
          chunkedAudio: undefined,
          durationSeconds: 42,
          audioPath: null,
          requestedLiveTranscription: false,
          liveTranscriptionActive: false,
        }),
      );
      expect(m.stopMeetingChatCapture).toHaveBeenCalledOnce();
    });

    test("retries until a conferencing app is mic-active without reporting intermediate failures", async () => {
      m.listMicUsingApplications
        .mockResolvedValueOnce({
          status: "ok",
          data: [{ id: "fr.willisback.syntheo.dev", name: "Syntheo Dev" }],
        })
        .mockResolvedValueOnce({
          status: "ok",
          data: [{ id: "us.zoom.xos", name: "zoom.us" }],
        });
      m.sendMeetingChatMessage
        .mockResolvedValueOnce({
          status: "ok",
          data: {
            sent: false,
            platform: "unknown",
            surface: "unknown",
            warnings: [
              "refusing to send because the mic-active apps contain 0 recognized meeting app bundles; expected exactly one",
            ],
          },
        })
        .mockResolvedValueOnce({
          status: "ok",
          data: {
            sent: true,
            platform: "zoom",
            surface: "native",
            warnings: [],
          },
        });

      await expect(
        sendMeetingRecordingDisclosure({ maxAttempts: 2, retryIntervalMs: 0 }),
      ).resolves.toEqual({ status: "sent" });

      expect(m.listMicUsingApplications).toHaveBeenCalledTimes(2);
      expect(m.sendMeetingChatMessage).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("J'utilise Syntheo"),
        ["fr.willisback.syntheo.dev"],
      );
      expect(m.sendMeetingChatMessage).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("J'utilise Syntheo"),
        ["us.zoom.xos"],
      );
      expect(m.toastWarning).not.toHaveBeenCalled();
    });

    test("reports one terminal failure after the bounded retry window", async () => {
      m.listMicUsingApplications.mockResolvedValue({
        status: "error",
        error: "audio process query failed",
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      await expect(
        sendMeetingRecordingDisclosure({ maxAttempts: 3, retryIntervalMs: 0 }),
      ).resolves.toEqual({
        status: "notSent",
        reason: "audio process query failed",
      });

      expect(m.listMicUsingApplications).toHaveBeenCalledTimes(3);
      expect(m.sendMeetingChatMessage).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(m.toastWarning).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });

    const quickStop = {
      durationSeconds: 1,
      audioPath: null,
      requestedLiveTranscription: false,
      liveTranscriptionActive: false,
    };

    test("cancels disclosure before chat mutation when listening stops", async () => {
      setConfig({ consent_auto_send_chat: true });
      let resolveMicApps: ((value: unknown) => void) | undefined;
      m.listMicUsingApplications.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveMicApps = resolve;
          }),
      );
      const sessionId = nextDisclosureSessionId();
      await startListening(sessionId);
      await waitFor(() => {
        expect(m.listMicUsingApplications).toHaveBeenCalledOnce();
      });

      await stopListening(quickStop, sessionId);
      await act(async () => {
        resolveMicApps?.({
          status: "ok",
          data: [{ id: "com.tinyspeck.slackmacgap", name: "Slack" }],
        });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(m.sendMeetingChatMessage).not.toHaveBeenCalled();
      expect(m.toastWarning).not.toHaveBeenCalled();
    });

    test("does not overlap disclosure sends after a quick stop and restart", async () => {
      setConfig({ consent_auto_send_chat: true });
      let resolveSend: ((value: unknown) => void) | undefined;
      m.sendMeetingChatMessage.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSend = resolve;
          }),
      );
      const sessionId = nextDisclosureSessionId();
      const { result } = await startListening(sessionId);
      await waitFor(() => {
        expect(m.sendMeetingChatMessage).toHaveBeenCalledOnce();
      });

      await act(async () => {
        await startCallbacks().onStopped(sessionId, quickStop);
        await result.current();
      });
      expect(m.sendMeetingChatMessage).toHaveBeenCalledOnce();

      await act(async () => {
        resolveSend?.({ status: "ok", data: { sent: true, warnings: [] } });
        await Promise.resolve();
      });
      expect(m.sendMeetingChatMessage).toHaveBeenCalledOnce();
    });
  });

  // Issue 353 : la pause enregistre le transcript de chaque capture mais ne
  // lance la synthèse qu'à « Terminer ».
  describe("pause de l'écoute", () => {
    const pausedStop = (stoppedAtMs: number, paused: boolean) =>
      stopDetails({ stoppedAtMs, audioPath: null, paused });

    afterEach(() => {
      takePausedSummary(SESSION);
    });

    test("une capture mise en pause garde son transcript sans lancer la synthèse", async () => {
      const stoppedAtMs = Date.now() + 60_000;
      vi.mocked(loadCaptureStop).mockResolvedValue(stoppedAtMs);
      await startListening();
      startCallbacks().handlePersist(words("Bonjour"));
      await stopListening(pausedStop(stoppedAtMs, true));

      expect(m.requestAutoEnhance).not.toHaveBeenCalled();
      expect(m.requestMainAutoEnhance).not.toHaveBeenCalled();
      expect(playCompletionSound).not.toHaveBeenCalled();
      expect(completeCaptureTranscript).toHaveBeenCalledWith(
        SESSION,
        "generated-id",
        stoppedAtMs,
      );
      expect(m.softDeleteTranscript).not.toHaveBeenCalled();
      // Rien n'est laissé pour une reprise après redémarrage : quitter
      // pendant la pause ne déclenchera aucune synthèse.
      expect(m.clearCaptureLifecycleMarker).toHaveBeenCalledWith(
        SESSION,
        "generated-id",
      );
      expect(
        m.saveCaptureLifecycleMarker.mock.calls.some(
          ([saved]) => saved?.pendingSummaryMode,
        ),
      ).toBe(false);
      expect(m.requestCaptureRecovery).not.toHaveBeenCalled();
      expect(takePausedSummary(SESSION)).toBe("if_empty");
    });

    test("pause et reprise deux fois : transcript continu, une seule synthèse à la fin", async () => {
      let nextId = 0;
      m.id.mockImplementation(() => `transcript-${++nextId}`);
      vi.mocked(loadCaptureStop).mockImplementation(
        async (_sessionId, transcriptId) =>
          1_000 * Number(String(transcriptId).replace(/\D/g, "")),
      );
      const { result, rerender } = renderHook(() => useStartListening(SESSION));

      for (const round of [0, 1, 2]) {
        await act(async () => {
          await result.current();
        });
        const [params, callbacks] = m.start.mock.calls[round]!;
        expect(params.session_id).toBe(SESSION);
        callbacks.handlePersist(words(`mot-${round}`));
        await act(async () => {
          await callbacks.onStopped(
            SESSION,
            pausedStop(1_000 * (round + 1), round < 2),
          );
        });
        if (round < 2) {
          expect(m.requestAutoEnhance).not.toHaveBeenCalled();
        }
        // Après la première capture, la note a un transcript à prolonger.
        m.useSessionHasTranscript.mockReturnValue(true);
        rerender();
      }

      const transcriptIds = m.start.mock.calls.map(
        ([params]) => params.live_transcript.transcript_id,
      );
      expect(new Set(transcriptIds).size).toBe(3);
      for (const transcriptId of transcriptIds) {
        expect(completeCaptureTranscript).toHaveBeenCalledWith(
          SESSION,
          transcriptId,
          expect.any(Number),
        );
      }
      expect(m.softDeleteTranscript).not.toHaveBeenCalled();
      expect(m.requestAutoEnhance).toHaveBeenCalledOnce();
      expect(m.requestAutoEnhance).toHaveBeenCalledWith(SESSION, "regenerate");
      expect(takePausedSummary(SESSION)).toBeUndefined();
    });
  });
});
