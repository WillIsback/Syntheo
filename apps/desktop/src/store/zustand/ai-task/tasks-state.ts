import { type LanguageModel } from "ai";

import { type AIErrorSource, withAIErrorSource } from "./shared/error-source";
import { type TaskArgsMap, type TaskId, type TaskType } from "./task-configs";

export type TasksState = {
  tasks: Record<string, TaskState>;
};

export type TasksActions = {
  generate: <T extends TaskType>(
    taskId: TaskId<T>,
    config: {
      model: LanguageModel;
      taskType: T;
      args: TaskArgsMap[T];
      onComplete?: (text: string) => void;
    },
  ) => Promise<void>;
  cancel: (taskId: string) => void;
  reset: (taskId: string) => void;
  syncRemoteTask: <T extends TaskType>(
    taskId: TaskId<T>,
    task: RemoteTaskState<T>,
  ) => void;
  syncRemoteTasks: (tasks: Record<string, RemoteTaskState>) => void;
  getState: <T extends TaskType>(taskId: TaskId<T>) => TaskState<T> | undefined;
};

export type TaskStepInfo<T extends TaskType = TaskType> =
  | { type: "generating" }
  | { type: "reasoning" }
  | (T extends "enhance"
      ?
          | { type: "analyzing" }
          | { type: "retrying"; attempt: number; reason: string }
      : never);

export type TaskStatus = "idle" | "generating" | "success" | "error";

export type TaskState<T extends TaskType = TaskType> = {
  taskType: T;
  status: TaskStatus;
  streamedText: string;
  error?: Error;
  abortController: AbortController | null;
  currentStep?: TaskStepInfo<T>;
};

export type RemoteTaskState<T extends TaskType = TaskType> = {
  taskType: T;
  status: TaskStatus;
  streamedText: string;
  error?: { name?: string; message: string; source?: AIErrorSource };
  currentStep?: TaskStepInfo<T>;
};

export function getTaskState<T extends TaskType>(
  tasks: TasksState["tasks"],
  taskId: TaskId<T>,
): TaskState<T> | undefined {
  const state = tasks[taskId];
  if (state?.taskType) {
    return state as TaskState<T>;
  }
  return undefined;
}

export const initialState: TasksState = {
  tasks: {},
};

export const TASK_STREAM_IDLE_TIMEOUT_MS = 30_000;
export const TASK_STREAM_START_TIMEOUT_MS = 60_000;
// Un serveur on-prem peut passer plusieurs minutes à charger les poids ou à
// préremplir une longue transcription avant le premier token.
export const TASK_STREAM_LOCAL_START_TIMEOUT_MS = 5 * 60_000;

const LOCAL_MODEL_PROVIDERS = new Set(["custom"]);

export function isLocalModelProviderId(providerId: string) {
  return LOCAL_MODEL_PROVIDERS.has(providerId);
}

export function getTaskStreamStartTimeoutMs(model: LanguageModel) {
  const provider =
    typeof model !== "string" && typeof model.provider === "string"
      ? model.provider
      : "";
  const providerId = provider.split(".", 1)[0];

  return isLocalModelProviderId(providerId)
    ? TASK_STREAM_LOCAL_START_TIMEOUT_MS
    : TASK_STREAM_START_TIMEOUT_MS;
}
export const MAX_RETAINED_AI_TASKS = 256;
export const MAX_AI_TASK_STREAM_CHARACTERS = 256 * 1024;

const DATABASE_LOCK_RETRY_DELAYS_MS = [
  250, 500, 1_000, 2_000, 4_000, 8_000, 16_000, 30_000,
];
export const STREAM_TIMEOUT = Symbol("stream-timeout");

function createAbortError() {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

export function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw createAbortError();
  }
}

function isDatabaseLockError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("database is locked") ||
    normalized.includes("database table is locked") ||
    normalized.includes("(code: 5)") ||
    normalized.includes("(code: 6)")
  );
}

async function waitForDatabaseRetry(delayMs: number, signal: AbortSignal) {
  throwIfAborted(signal);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const handleAbort = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", handleAbort);
      reject(createAbortError());
    };
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", handleAbort, { once: true });
    if (signal.aborted) {
      handleAbort();
    }
  });
}

export async function withDatabaseLockRetry<T>(
  run: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    throwIfAborted(signal);
    try {
      return await run();
    } catch (error) {
      if (
        !isDatabaseLockError(error) ||
        attempt >= DATABASE_LOCK_RETRY_DELAYS_MS.length
      ) {
        throw error;
      }
      await waitForDatabaseRetry(
        DATABASE_LOCK_RETRY_DELAYS_MS[attempt],
        signal,
      );
    }
  }
}

export async function readStreamChunkWithTimeout<T>(
  iterator: AsyncIterator<T>,
  timeoutMs: number,
): Promise<IteratorResult<T> | typeof STREAM_TIMEOUT> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof STREAM_TIMEOUT>((resolve) => {
    timeoutId = setTimeout(() => resolve(STREAM_TIMEOUT), timeoutMs);
  });

  try {
    return await Promise.race([iterator.next(), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function settleWithinDeadline(
  execution: Promise<void>,
  deadlineMs: number | undefined,
): Promise<boolean> {
  if (!deadlineMs) {
    await execution;
    return false;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<true>((resolve) => {
    timeoutId = setTimeout(() => resolve(true), deadlineMs);
  });
  try {
    return await Promise.race([execution.then(() => false), deadline]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function setBoundedTaskState(
  tasks: Record<string, TaskState>,
  taskId: string,
  nextTask: TaskState,
): Record<string, TaskState> {
  const entries = Object.entries(tasks).filter(([id]) => id !== taskId);
  entries.push([taskId, nextTask]);

  while (entries.length > MAX_RETAINED_AI_TASKS) {
    let removeIndex = entries.findIndex(
      ([id, task]) => id !== taskId && task.status !== "generating",
    );
    if (removeIndex === -1) {
      removeIndex = entries.findIndex(([id]) => id !== taskId);
    }
    if (removeIndex === -1) {
      break;
    }
    entries[removeIndex]?.[1].abortController?.abort();
    entries.splice(removeIndex, 1);
  }

  return Object.fromEntries(entries);
}

export function toSyncedTaskState(task: RemoteTaskState): TaskState {
  return {
    taskType: task.taskType,
    status: task.status,
    streamedText: task.streamedText.slice(0, MAX_AI_TASK_STREAM_CHARACTERS),
    error: task.error ? createSyncedTaskError(task.error) : undefined,
    abortController: null,
    currentStep: task.currentStep,
  };
}

function createSyncedTaskError(error: NonNullable<RemoteTaskState["error"]>) {
  const synced = new Error(error.message);
  if (error.name) {
    synced.name = error.name;
  }
  return withAIErrorSource(synced, error.source);
}
