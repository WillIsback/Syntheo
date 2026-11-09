import type { CaptureConfigUpdate } from "@syntheo/plugin-transcription";
import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import {
  CAPTURE_IDENTITY_SQL,
  type CaptureIdentitySqlRow,
  LIVE_CAPTURE_CONFIG_DEBOUNCE_MS,
  LIVE_TRANSCRIPT_IDENTITY_SQL,
  type LiveTranscriptIdentitySqlRow,
  createCaptureConfigSignature,
  getLiveConfigLanguages,
  getLiveSpeakerAssignments,
  getSessionParticipantHumanIds,
} from "./event-listeners-capture-identity";

import { liveQueryClient } from "~/db";
import { useConfigValues } from "~/shared/config";
import { listenerStore } from "~/store/zustand/listener/instance";
import { useLiveTranscriptionLanguages } from "~/store/zustand/live-transcription-languages";
import { getLiveTranscriptionConfig } from "~/stt/capabilities";

export function LiveCaptureConfigSync() {
  const settingsValues = useConfigValues([
    "ai_language",
    "spoken_languages",
    "current_stt_provider",
    "current_stt_model",
  ] as const);

  const settingsSignature = JSON.stringify(settingsValues);
  return (
    <LiveCaptureConfigSyncReady
      key={settingsSignature}
      settingsValues={settingsValues}
    />
  );
}

function LiveCaptureConfigSyncReady({
  settingsValues,
}: {
  settingsValues: {
    ai_language: string;
    spoken_languages: string[];
    current_stt_provider: string | undefined;
    current_stt_model: string | undefined;
  };
}) {
  useMountEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastSignature: string | null = null;
    let lastCaptureGeneration: number | null = null;
    let rows: CaptureIdentitySqlRow[] = [];
    let hasSnapshot = false;
    let transcriptRows: LiveTranscriptIdentitySqlRow[] = [];
    let hasTranscriptSnapshot = false;
    let transcriptSessionId: string | null = null;
    let cancelled = false;
    let unsubscribeDatabase: (() => Promise<void>) | null = null;
    let unsubscribeTranscript: (() => Promise<void>) | null = null;

    const pushConfig = async () => {
      if (!hasSnapshot) {
        return;
      }

      const live = listenerStore.getState().live;
      if (live.status !== "active" || !live.sessionId) {
        return;
      }

      const languages = getLiveConfigLanguages(
        settingsValues.ai_language,
        settingsValues.spoken_languages,
      );
      const liveConfig = await getLiveTranscriptionConfig({
        provider: settingsValues.current_stt_provider,
        model: settingsValues.current_stt_model,
        languages,
      });

      if (liveConfig.transcriptionMode === "batch") {
        return;
      }
      // Les langues parlées ont pu changer pendant l'écoute : la marge suit.
      useLiveTranscriptionLanguages
        .getState()
        .setLanguages(live.sessionId, liveConfig);

      const session = rows.find((row) => row.session_id === live.sessionId);
      const participantHumanIds = getSessionParticipantHumanIds(
        rows,
        live.sessionId,
      );
      const selfHumanId = session?.owner_user_id || null;
      const nextConfig: CaptureConfigUpdate = {
        session_id: live.sessionId,
        languages: liveConfig.languages,
        participant_human_ids: participantHumanIds,
        self_human_id: selfHumanId,
        speaker_assignments:
          transcriptSessionId === live.sessionId && hasTranscriptSnapshot
            ? getLiveSpeakerAssignments(
                transcriptRows,
                participantHumanIds,
                selfHumanId,
              )
            : [],
      };
      // Every capture starts its engine without speaker assignments, so a
      // config identical to the previous capture's still has to be pushed.
      const captureGeneration =
        live.captureGenerationBySession[live.sessionId] ?? null;
      if (captureGeneration !== lastCaptureGeneration) {
        lastCaptureGeneration = captureGeneration;
        lastSignature = null;
      }

      const signature = createCaptureConfigSignature(nextConfig);
      if (signature === lastSignature) {
        return;
      }

      lastSignature = signature;
      await listenerStore.getState().updateCaptureConfig(nextConfig);
    };

    const schedulePush = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        void pushConfig().catch((error) => {
          console.error(
            "[listener] failed to update live capture config",
            error,
          );
        });
      }, LIVE_CAPTURE_CONFIG_DEBOUNCE_MS);
    };

    // Speaker hints live on the transcript row, so follow whichever session is
    // being captured instead of watching every transcript in the database.
    const syncTranscriptSubscription = () => {
      const live = listenerStore.getState().live;
      const sessionId = live.status === "active" ? live.sessionId : null;
      if (sessionId === transcriptSessionId) {
        return;
      }

      transcriptSessionId = sessionId;
      transcriptRows = [];
      hasTranscriptSnapshot = false;
      void unsubscribeTranscript?.();
      unsubscribeTranscript = null;
      if (!sessionId) {
        return;
      }

      // A read that fails before the first rows would otherwise hold every
      // participant and language update for the session. Run without names
      // instead; a failure after the first rows keeps the last known ones.
      const onTranscriptUnavailable = (message: string, error: unknown) => {
        console.error(message, error);
        if (cancelled || transcriptSessionId !== sessionId) {
          return;
        }
        if (!hasTranscriptSnapshot) {
          hasTranscriptSnapshot = true;
          schedulePush();
        }
      };

      void liveQueryClient
        .subscribe<LiveTranscriptIdentitySqlRow>(
          LIVE_TRANSCRIPT_IDENTITY_SQL,
          [sessionId],
          {
            onData: (nextRows) => {
              if (transcriptSessionId !== sessionId) {
                return;
              }
              transcriptRows = nextRows;
              hasTranscriptSnapshot = true;
              schedulePush();
            },
            onError: (error) => {
              onTranscriptUnavailable(
                "[listener] failed to read live transcript speakers",
                error,
              );
            },
          },
        )
        .then((unsubscribe) => {
          if (cancelled || transcriptSessionId !== sessionId) {
            void unsubscribe();
          } else {
            unsubscribeTranscript = unsubscribe;
          }
        })
        .catch((error) => {
          onTranscriptUnavailable(
            "[listener] failed to subscribe to live transcript speakers",
            error,
          );
        });
    };

    const unsubscribeListener = listenerStore.subscribe(() => {
      syncTranscriptSubscription();
      schedulePush();
    });
    syncTranscriptSubscription();
    void liveQueryClient
      .subscribe<CaptureIdentitySqlRow>(CAPTURE_IDENTITY_SQL, [], {
        onData: (nextRows) => {
          rows = nextRows;
          hasSnapshot = true;
          schedulePush();
        },
        onError: (error) => {
          console.error(
            "[listener] failed to read live capture identities",
            error,
          );
        },
      })
      .then((unsubscribe) => {
        if (cancelled) {
          void unsubscribe();
        } else {
          unsubscribeDatabase = unsubscribe;
        }
      })
      .catch((error) => {
        console.error(
          "[listener] failed to subscribe to live capture identities",
          error,
        );
      });

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      unsubscribeListener();
      void unsubscribeDatabase?.();
      void unsubscribeTranscript?.();
    };
  });

  return null;
}
