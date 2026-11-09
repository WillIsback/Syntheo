import type { StoreApi } from "zustand";

import type {
  BatchErrorCode,
  BatchResponse,
  BatchStreamEvent,
} from "@syntheo/plugin-transcription";

import { batchPreviewResult, getBatchStreamPercentage } from "./batch-preview";
import { transformBatch } from "./batch-transform";
import type { BatchPersistCallback } from "./transcript";

import { type RuntimeSpeakerHint, type WordLike } from "~/stt/segment";

type BatchPhase = "importing" | "transcribing";
type BatchTerminalReason = "failed" | "timed_out" | "stopped";

export type BatchState = {
  batch: Record<
    string,
    {
      percentage: number;
      isComplete?: boolean;
      error?: string;
      phase?: BatchPhase;
      terminalReason?: BatchTerminalReason;
      errorCode?: BatchErrorCode;
      recovered?: boolean;
    }
  >;
  batchPreview: Record<
    string,
    {
      wordsByChannel: Record<number, WordLike[]>;
      hintsByChannel: Record<number, RuntimeSpeakerHint[]>;
    }
  >;
  batchPersist: Record<string, BatchPersistCallback>;
};

export type BatchActions = {
  handleBatchStarted: (sessionId: string, phase?: BatchPhase) => void;
  handleBatchRecovered: (sessionId: string) => void;
  handleBatchCompleted: (sessionId: string) => void;
  handleBatchResponse: (sessionId: string, response: BatchResponse) => boolean;
  handleBatchResponseStreamed: (
    sessionId: string,
    event: BatchStreamEvent,
  ) => void;
  handleBatchFailed: (
    sessionId: string,
    error: string,
    terminalReason?: Exclude<BatchTerminalReason, "stopped">,
    errorCode?: BatchErrorCode,
  ) => void;
  handleBatchStopped: (sessionId: string) => void;
  updateBatchProgress: (sessionId: string, percentage: number) => void;
  clearBatchSession: (sessionId: string) => void;
  setBatchPersist: (sessionId: string, callback: BatchPersistCallback) => void;
  clearBatchPersist: (sessionId: string) => void;
};

export const EMPTY_BATCH_TRANSCRIPT_ERROR =
  "No speech was detected in the audio.";
export const createBatchSlice = <T extends BatchState>(
  set: StoreApi<T>["setState"],
  get: StoreApi<T>["getState"],
): BatchState & BatchActions => ({
  batch: {},
  batchPreview: {},
  batchPersist: {},

  handleBatchStarted: (sessionId, phase) => {
    set((state) => ({
      ...state,
      batch: {
        ...state.batch,
        [sessionId]: {
          percentage: 0,
          isComplete: false,
          phase: phase ?? "transcribing",
          terminalReason: undefined,
          error: undefined,
          errorCode: undefined,
        },
      },
      batchPreview: {
        ...state.batchPreview,
        [sessionId]: {
          wordsByChannel: {},
          hintsByChannel: {},
        },
      },
    }));
  },

  handleBatchRecovered: (sessionId) => {
    set((state) => ({
      ...state,
      batch: {
        ...state.batch,
        [sessionId]: {
          percentage: 0,
          isComplete: false,
          phase: "transcribing",
          recovered: true,
        },
      },
    }));
  },

  handleBatchCompleted: (sessionId) => {
    set((state) => ({
      ...state,
      batch: {
        ...state.batch,
        [sessionId]: {
          ...(state.batch[sessionId] ?? { percentage: 1 }),
          percentage: 1,
          isComplete: true,
          phase: "transcribing",
          terminalReason: undefined,
          error: undefined,
          errorCode: undefined,
        },
      },
    }));
  },

  handleBatchResponse: (sessionId, response) => {
    const persist = get().batchPersist[sessionId];

    const [words, hints] = transformBatch(response);
    if (!words.length) {
      return false;
    }

    persist?.(words, hints, { mode: "replace" });

    set((state) => {
      if (!state.batch[sessionId]) {
        return state;
      }

      const { [sessionId]: _, ...rest } = state.batch;
      const { [sessionId]: __, ...restPreview } = state.batchPreview;
      return {
        ...state,
        batch: rest,
        batchPreview: restPreview,
      };
    });

    return true;
  },

  handleBatchResponseStreamed: (sessionId, event) => {
    if (get().batch[sessionId]?.terminalReason === "stopped") {
      return;
    }

    const percentage = getBatchStreamPercentage(event);
    const isComplete = event.type === "result" || event.type === "terminal";
    const currentPreview = get().batchPreview[sessionId] ?? {
      wordsByChannel: {},
      hintsByChannel: {},
    };
    const persist = get().batchPersist[sessionId];
    const result = batchPreviewResult(currentPreview, event);
    const { nextPreview, words, hints } = result;

    if (result.shouldPersist && words.length > 0) {
      persist?.(words, hints, { mode: "replace" });
    }

    set((state) => ({
      ...state,
      batch: {
        ...state.batch,
        [sessionId]: {
          percentage,
          isComplete: isComplete || false,
          phase: "transcribing",
          terminalReason: undefined,
          error: undefined,
          errorCode: undefined,
          recovered: state.batch[sessionId]?.recovered,
        },
      },
      batchPreview: {
        ...state.batchPreview,
        [sessionId]: nextPreview,
      },
    }));
  },

  updateBatchProgress: (sessionId, percentage) => {
    set((state) => {
      const entry = state.batch[sessionId];
      if (!entry) {
        return state;
      }
      return {
        ...state,
        batch: {
          ...state.batch,
          [sessionId]: { ...entry, percentage },
        },
      };
    });
  },

  handleBatchFailed: (
    sessionId,
    error,
    terminalReason = "failed",
    errorCode,
  ) => {
    set((state) => ({
      ...state,
      batch: {
        ...state.batch,
        [sessionId]: {
          ...(state.batch[sessionId] ?? { percentage: 0 }),
          error,
          isComplete: false,
          terminalReason,
          errorCode,
        },
      },
      batchPreview: {
        ...state.batchPreview,
        [sessionId]: {
          wordsByChannel: {},
          hintsByChannel: {},
        },
      },
    }));
  },

  handleBatchStopped: (sessionId) => {
    set((state) => ({
      ...state,
      batch: {
        ...state.batch,
        [sessionId]: {
          ...(state.batch[sessionId] ?? { percentage: 0 }),
          error: "Transcription stopped.",
          isComplete: false,
          terminalReason: "stopped",
          errorCode: undefined,
        },
      },
      batchPreview: {
        ...state.batchPreview,
        [sessionId]: {
          wordsByChannel: {},
          hintsByChannel: {},
        },
      },
    }));
  },

  clearBatchSession: (sessionId) => {
    set((state) => {
      if (!(sessionId in state.batch)) {
        return state;
      }

      const { [sessionId]: _, ...rest } = state.batch;
      const { [sessionId]: __, ...restPreview } = state.batchPreview;
      return {
        ...state,
        batch: rest,
        batchPreview: restPreview,
      };
    });
  },

  setBatchPersist: (sessionId, callback) => {
    set((state) => ({
      ...state,
      batchPersist: {
        ...state.batchPersist,
        [sessionId]: callback,
      },
    }));
  },

  clearBatchPersist: (sessionId) => {
    set((state) => {
      if (!(sessionId in state.batchPersist)) {
        return state;
      }

      const { [sessionId]: _, ...rest } = state.batchPersist;
      return {
        ...state,
        batchPersist: rest,
      };
    });
  },
});
