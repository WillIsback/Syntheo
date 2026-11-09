import { type LanguageModel } from "ai";
import { create as mutate } from "mutative";
import type { StoreApi } from "zustand";

import {
  getModelProviderId,
  streamStallSource,
  withAIErrorSource,
} from "./shared/error-source";
import { applyTransforms } from "./shared/transform_infra";
import {
  TASK_CONFIGS,
  type TaskArgsMap,
  type TaskId,
  type TaskType,
} from "./task-configs";
import { extractUnderlyingError } from "./tasks-errors";
import {
  MAX_AI_TASK_STREAM_CHARACTERS,
  MAX_RETAINED_AI_TASKS,
  type RemoteTaskState,
  STREAM_TIMEOUT,
  TASK_STREAM_IDLE_TIMEOUT_MS,
  type TaskState,
  type TaskStepInfo,
  type TasksActions,
  type TasksState,
  getTaskState,
  getTaskStreamStartTimeoutMs,
  initialState,
  readStreamChunkWithTimeout,
  setBoundedTaskState,
  settleWithinDeadline,
  throwIfAborted,
  toSyncedTaskState,
  withDatabaseLockRetry,
} from "./tasks-state";

import { getStoredSettingValues } from "~/settings/queries";

export {
  type TasksState,
  type TasksActions,
  type TaskStepInfo,
  type TaskStatus,
  type TaskState,
  type RemoteTaskState,
  getTaskState,
  TASK_STREAM_IDLE_TIMEOUT_MS,
  TASK_STREAM_START_TIMEOUT_MS,
  TASK_STREAM_LOCAL_START_TIMEOUT_MS,
  isLocalModelProviderId,
  getTaskStreamStartTimeoutMs,
  MAX_RETAINED_AI_TASKS,
  MAX_AI_TASK_STREAM_CHARACTERS,
} from "./tasks-state";
export { extractUnderlyingError, isRetryableAIError } from "./tasks-errors";

export const createTasksSlice = <T extends TasksState & TasksActions>(
  set: StoreApi<T>["setState"],
  get: StoreApi<T>["getState"],
): TasksState & TasksActions => ({
  ...initialState,
  getState: <Task extends TaskType>(
    taskId: TaskId<Task>,
  ): TaskState<Task> | undefined => {
    const task = get().tasks[taskId];
    return task as TaskState<Task> | undefined;
  },
  cancel: (taskId: string) => {
    set((state) =>
      mutate(state, (draft) => {
        const task = draft.tasks[taskId];
        if (!task) {
          return;
        }

        task.abortController?.abort();

        draft.tasks[taskId] = {
          taskType: task.taskType,
          status: "idle",
          streamedText: task.streamedText,
          error: undefined,
          abortController: null,
          currentStep: undefined,
        };
      }),
    );
  },
  reset: (taskId: string) => {
    const state = get().tasks[taskId];
    if (state) {
      set((currentState) =>
        mutate(currentState, (draft) => {
          draft.tasks[taskId]?.abortController?.abort();
          draft.tasks[taskId] = {
            taskType: state.taskType,
            status: "idle",
            streamedText: "",
            error: undefined,
            abortController: null,
            currentStep: undefined,
          };
        }),
      );
    }
  },
  syncRemoteTask: <Task extends TaskType>(
    taskId: TaskId<Task>,
    task: RemoteTaskState<Task>,
  ) => {
    set((state) =>
      mutate(state, (draft) => {
        draft.tasks = setBoundedTaskState(draft.tasks, taskId, {
          ...toSyncedTaskState(task),
        });
      }),
    );
  },
  syncRemoteTasks: (tasks) => {
    set((state) =>
      mutate(state, (draft) => {
        draft.tasks = Object.fromEntries(
          Object.entries(tasks)
            .slice(-MAX_RETAINED_AI_TASKS)
            .map(([taskId, task]) => [taskId, toSyncedTaskState(task)]),
        );
      }),
    );
  },
  generate: async <Task extends TaskType>(
    taskId: TaskId<Task>,
    config: {
      model: LanguageModel;
      taskType: Task;
      args: TaskArgsMap[Task];
      onComplete?: (text: string) => void;
    },
  ) => {
    const existingTask = get().tasks[taskId];
    if (existingTask?.status === "generating") {
      return;
    }

    const abortController = new AbortController();
    const taskConfig = TASK_CONFIGS[config.taskType];

    const execution = (async () => {
      try {
        set((state) =>
          mutate(state, (draft) => {
            draft.tasks = setBoundedTaskState(draft.tasks, taskId, {
              taskType: config.taskType,
              status: "generating",
              streamedText: "",
              error: undefined,
              abortController,
              currentStep: undefined,
            });
          }),
        );

        const { values: settingsValues } = await withDatabaseLockRetry(
          getStoredSettingValues,
          abortController.signal,
        );
        const enrichedArgs = await withDatabaseLockRetry(
          () => taskConfig.transformArgs(config.args, settingsValues),
          abortController.signal,
        );
        let fullText = "";
        let reasoningActive = false;

        const checkAbort = () => {
          throwIfAborted(abortController.signal);
        };

        const onProgress = (step: TaskStepInfo<Task>) => {
          set((state) =>
            mutate(state, (draft) => {
              const currentState = draft.tasks[taskId];
              if (currentState?.taskType === config.taskType) {
                (currentState as any).currentStep = step;
              }
            }),
          );
        };

        const workflowAbortController = new AbortController();
        const abortWorkflow = () => workflowAbortController.abort();
        abortController.signal.addEventListener("abort", abortWorkflow, {
          once: true,
        });
        let workflowCompleted = false;

        try {
          const workflowStream = taskConfig.executeWorkflow({
            model: config.model,
            args: enrichedArgs,
            onProgress,
            signal: workflowAbortController.signal,
          });

          const transforms = taskConfig.transforms ?? [];
          const transformedStream = applyTransforms(
            workflowStream,
            transforms,
            {
              stopStream: abortWorkflow,
            },
          );
          const iterator = transformedStream[Symbol.asyncIterator]();

          while (true) {
            const result = await readStreamChunkWithTimeout(
              iterator,
              fullText.trim()
                ? TASK_STREAM_IDLE_TIMEOUT_MS
                : getTaskStreamStartTimeoutMs(config.model),
            );
            checkAbort();

            if (result === STREAM_TIMEOUT) {
              workflowAbortController.abort();
              throw withAIErrorSource(
                new Error(
                  fullText.trim()
                    ? "The AI model stopped responding before it finished."
                    : "AI generation did not return any text.",
                ),
                streamStallSource(getModelProviderId(config.model)),
              );
            }

            if (result.done) {
              workflowCompleted = true;
              break;
            }

            const chunk = result.value;

            if (chunk.type === "error") {
              throw chunk.error;
            } else if (
              (chunk.type === "reasoning-start" ||
                chunk.type === "reasoning-delta") &&
              !reasoningActive &&
              !fullText
            ) {
              reasoningActive = true;
              onProgress({ type: "reasoning" });
            } else if (chunk.type === "text-delta") {
              if (reasoningActive) {
                reasoningActive = false;
                onProgress({ type: "generating" });
              }
              if (
                fullText.length + chunk.text.length >
                MAX_AI_TASK_STREAM_CHARACTERS
              ) {
                workflowAbortController.abort();
                throw new Error(
                  "AI generation exceeded the safe output limit.",
                );
              }
              fullText += chunk.text;

              set((state) =>
                mutate(state, (draft) => {
                  const currentState = draft.tasks[taskId];
                  if (currentState) {
                    currentState.streamedText = fullText;
                  }
                }),
              );
            }
          }
        } finally {
          if (!workflowCompleted) {
            workflowAbortController.abort();
          }
          abortController.signal.removeEventListener("abort", abortWorkflow);
        }

        checkAbort();

        const onSuccess = taskConfig.onSuccess;
        if (onSuccess) {
          await withDatabaseLockRetry(
            () =>
              Promise.resolve(
                onSuccess({
                  taskId,
                  text: fullText,
                  model: config.model,
                  args: config.args,
                  transformedArgs: enrichedArgs,
                  signal: abortController.signal,
                  startTask: (nextTaskId, nextConfig) =>
                    get().generate(nextTaskId, nextConfig),
                  getTaskState: (nextTaskId) =>
                    getTaskState(get().tasks, nextTaskId),
                }),
              ),
            abortController.signal,
          );
        }

        checkAbort();

        set((state) =>
          mutate(state, (draft) => {
            draft.tasks[taskId] = {
              taskType: config.taskType,
              status: "success",
              streamedText: fullText,
              error: undefined,
              abortController: null,
              currentStep: undefined,
            };
          }),
        );

        try {
          config.onComplete?.(fullText);
        } catch (error) {
          console.error("Task onComplete callback failed:", error);
        }
      } catch (err) {
        // A reset/regenerate may already own this task id; a stale run must not
        // clobber the replacement's state.
        if (get().tasks[taskId]?.abortController !== abortController) {
          return;
        }

        if (
          err instanceof Error &&
          (err.name === "AbortError" || err.message === "Aborted")
        ) {
          set((state) =>
            mutate(state, (draft) => {
              draft.tasks[taskId] = {
                taskType: config.taskType,
                status: "idle",
                streamedText: "",
                error: undefined,
                abortController: null,
                currentStep: undefined,
              };
            }),
          );
        } else {
          const error = extractUnderlyingError(
            err,
            getModelProviderId(config.model),
          );
          set((state) =>
            mutate(state, (draft) => {
              draft.tasks[taskId] = {
                taskType: config.taskType,
                status: "error",
                streamedText: "",
                error,
                abortController: null,
                currentStep: undefined,
              };
            }),
          );
        }
      }
    })();

    const timedOut = await settleWithinDeadline(
      execution,
      taskConfig.maxDurationMs,
    );
    // Une préparation ou un flux bloqué ne doit pas laisser la tâche « en
    // cours » : passé le délai, elle échoue et le run tardif est ignoré.
    if (timedOut && get().tasks[taskId]?.abortController === abortController) {
      abortController.abort();
      set((state) =>
        mutate(state, (draft) => {
          draft.tasks[taskId] = {
            taskType: config.taskType,
            status: "error",
            streamedText: "",
            error: withAIErrorSource(
              new Error("AI generation took too long."),
              streamStallSource(getModelProviderId(config.model)),
            ),
            abortController: null,
            currentStep: undefined,
          };
        }),
      );
    }
  },
});
