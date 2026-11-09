import { Effect, Exit } from "effect";
import type { StoreApi } from "zustand";

import { type CaptureSnapshot } from "@syntheo/plugin-transcription";

import { createSessionEventHandlers } from "./general-live-events";
import {
  type LiveStore,
  bufferLiveSegmentDelta,
  clearLiveEventUnlisteners,
  clearLiveInterval,
  createLiveSecondsInterval,
  elapsedSecondsSince,
  getCaptureSnapshotWithTimeout,
  listenToAllSessionEvents,
  notifyCaptureWarning,
} from "./general-live-helpers";
import {
  markLiveActive,
  markLiveFinalizing,
  releaseLiveCaptureGeneration,
  setLiveState,
} from "./general-shared";
import {
  createLiveSegmentDeltaAccumulator,
  flushLiveTranscriptBatches,
  takeLiveSegmentDelta,
} from "./live-transcript-batch";
import {
  type LiveTranscriptPersistCallback,
  type OnStoppedCallback,
} from "./transcript";

import { startSpeakerContextCapture } from "~/stt/speaker-context-capture";

export const attachLiveSession = <T extends LiveStore>(
  set: StoreApi<T>["setState"],
  get: StoreApi<T>["getState"],
  targetSessionId: string,
  options?: {
    handlePersist?: LiveTranscriptPersistCallback;
    onStopped?: OnStoppedCallback;
  },
): Promise<"attached" | "inactive" | "error"> => {
  flushLiveTranscriptBatches();
  if (options?.onStopped) {
    setLiveState(set, (live) => {
      if (
        live.status === "inactive" &&
        (!live.sessionId || live.sessionId === targetSessionId)
      ) {
        live.loading = true;
        live.sessionId = targetSessionId;
      }
    });
  }

  const existingHandlePersist = get().handlePersistBySession[targetSessionId];
  const existingOnStopped = get().onStoppedBySession[targetSessionId];
  const registeredHandlePersist =
    options?.handlePersist && !existingHandlePersist
      ? options.handlePersist
      : undefined;
  const registeredOnStopped =
    options?.onStopped && !existingOnStopped ? options.onStopped : undefined;
  const attachedHandlePersist =
    registeredHandlePersist ??
    (options?.handlePersist ? existingHandlePersist : undefined);
  const attachedOnStopped =
    registeredOnStopped ?? (options?.onStopped ? existingOnStopped : undefined);

  if (registeredHandlePersist) {
    get().setTranscriptPersist(targetSessionId, registeredHandlePersist);
  }
  if (registeredOnStopped) {
    get().setOnStopped(targetSessionId, registeredOnStopped);
  }

  const clearAttachedCallbacks = () => {
    if (
      attachedHandlePersist &&
      get().handlePersistBySession[targetSessionId] === attachedHandlePersist
    ) {
      get().setTranscriptPersist(targetSessionId, undefined);
    }
    if (
      attachedOnStopped &&
      get().onStoppedBySession[targetSessionId] === attachedOnStopped
    ) {
      get().setOnStopped(targetSessionId, undefined);
    }
  };

  const currentLive = get().live;
  if (currentLive.eventUnlistenersBySession[targetSessionId]) {
    if (!options?.handlePersist && !options?.onStopped) {
      return Promise.resolve("attached");
    }

    return getCaptureSnapshotWithTimeout()
      .then((result) => {
        if (result.status === "error") {
          console.error(
            "[listener] capture snapshot unavailable:",
            result.error,
          );
          return "error";
        }

        const snapshot = result.data;
        applyCaptureSnapshot(set, get, targetSessionId, snapshot, {
          hydrateLiveSegments: false,
        });
        const isAttached =
          (snapshot.state === "active" &&
            snapshot.activeSessionId === targetSessionId) ||
          snapshot.finalizingSessionIds.includes(targetSessionId);
        if (!isAttached) {
          clearAttachedCallbacks();
        }
        return isAttached ? "attached" : "inactive";
      })
      .catch((error) => {
        console.error("[listener] capture snapshot unavailable:", error);
        return "error";
      });
  }

  const pendingUnlisteners: (() => void)[] = [];
  let registeredUnlisteners = pendingUnlisteners;
  setLiveState(set, (live) => {
    live.eventUnlistenersBySession[targetSessionId] = pendingUnlisteners;
    if (!live.sessionId) {
      live.sessionId = targetSessionId;
    }
  });

  let bufferedSegmentDeltas: ReturnType<
    typeof createLiveSegmentDeltaAccumulator
  > | null = createLiveSegmentDeltaAccumulator();
  const replayBufferedSegmentDeltas = () => {
    const buffer = bufferedSegmentDeltas;
    bufferedSegmentDeltas = null;
    if (!buffer) {
      return;
    }
    const delta = takeLiveSegmentDelta(buffer);
    if (delta) {
      get().handleTranscriptSegmentDelta(delta);
    }
  };
  const handlers = createSessionEventHandlers(
    set,
    get,
    targetSessionId,
    (delta) => {
      if (!bufferedSegmentDeltas) {
        return false;
      }
      bufferLiveSegmentDelta(bufferedSegmentDeltas, delta);
      return true;
    },
  );

  const program = Effect.gen(function* () {
    const unlisteners = yield* listenToAllSessionEvents(handlers);
    if (
      get().live.eventUnlistenersBySession[targetSessionId] !==
      pendingUnlisteners
    ) {
      clearLiveEventUnlisteners(unlisteners);
      clearAttachedCallbacks();
      return "error" as const;
    }

    registeredUnlisteners = unlisteners;
    setLiveState(set, (live) => {
      live.eventUnlistenersBySession[targetSessionId] = unlisteners;
    });

    const snapshotResult = yield* Effect.promise(getCaptureSnapshotWithTimeout);
    if (snapshotResult.status === "error") {
      console.error(
        "[listener] capture snapshot unavailable:",
        snapshotResult.error,
      );
      replayBufferedSegmentDeltas();
      return "error" as const;
    }

    const snapshot = snapshotResult.data;
    applyCaptureSnapshot(set, get, targetSessionId, snapshot);
    replayBufferedSegmentDeltas();
    const isAttached =
      (snapshot.state === "active" &&
        snapshot.activeSessionId === targetSessionId) ||
      snapshot.finalizingSessionIds.includes(targetSessionId);
    if (!isAttached) {
      clearAttachedCallbacks();
    }
    return isAttached ? ("attached" as const) : ("inactive" as const);
  });

  return Effect.runPromiseExit(program).then((exit) =>
    Exit.match(exit, {
      onFailure: (cause) => {
        console.error("[listener] failed to attach live session:", cause);
        clearAttachedCallbacks();
        clearLiveEventUnlisteners(registeredUnlisteners);
        setLiveState(set, (live) => {
          if (
            live.eventUnlistenersBySession[targetSessionId] ===
            registeredUnlisteners
          ) {
            delete live.eventUnlistenersBySession[targetSessionId];
          }
          if (
            live.sessionId === targetSessionId &&
            live.status === "inactive"
          ) {
            live.sessionId = null;
          }
        });
        return "error" as const;
      },
      onSuccess: (result) => result,
    }),
  );
};

function applyCaptureSnapshot<T extends LiveStore>(
  set: StoreApi<T>["setState"],
  get: StoreApi<T>["getState"],
  targetSessionId: string,
  snapshot: CaptureSnapshot,
  options?: { hydrateLiveSegments?: boolean },
) {
  if (
    options?.hydrateLiveSegments !== false &&
    snapshot.liveSegmentsSessionId === targetSessionId &&
    snapshot.liveSegments
  ) {
    get().handleTranscriptSegmentDelta({
      upserts: snapshot.liveSegments,
      removed_ids: get().liveSegments.map((segment) => segment.id),
    });
  }

  if (
    snapshot.state === "active" &&
    snapshot.activeSessionId === targetSessionId
  ) {
    startSpeakerContextCapture(targetSessionId);
    const currentLive = get().live;
    if (currentLive.sessionId !== targetSessionId) {
      clearLiveInterval(currentLive.intervalId);
    }

    const intervalId =
      currentLive.sessionId === targetSessionId && currentLive.intervalId
        ? currentLive.intervalId
        : createLiveSecondsInterval(
            set,
            (live) =>
              live.sessionId === targetSessionId && live.status === "active",
          );

    setLiveState(set, (live) => {
      markLiveActive(
        live,
        targetSessionId,
        intervalId,
        snapshot.requestedLiveTranscription ?? true,
        snapshot.liveTranscriptionActive ?? true,
        snapshot.degraded ?? null,
      );
      if (snapshot.startedAtMs != null) {
        live.seconds = elapsedSecondsSince(snapshot.startedAtMs);
      }
      if (snapshot.captureHealth != null) {
        live.captureHealth = snapshot.captureHealth;
      }
      if (snapshot.micMuted != null) {
        live.muted = snapshot.micMuted;
      }
      if (snapshot.speakerMuted != null) {
        live.speakerMuted = snapshot.speakerMuted;
      }
    });
    notifyCaptureWarning(get, targetSessionId);
    return;
  }

  if (snapshot.finalizingSessionIds.includes(targetSessionId)) {
    setLiveState(set, (live) => {
      if (!live.sessionId) {
        live.sessionId = targetSessionId;
      }
      markLiveFinalizing(live, targetSessionId);
    });
    return;
  }

  setLiveState(set, (live) => {
    if (live.sessionId === targetSessionId && live.status === "inactive") {
      if (!live.loading) {
        releaseLiveCaptureGeneration(live, targetSessionId);
      }
      live.loading = false;
      live.sessionId = null;
    }
  });
}
