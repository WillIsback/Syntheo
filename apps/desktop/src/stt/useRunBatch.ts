import { t } from "@lingui/core/macro";
import { useCallback } from "react";

import {
  commands as transcriptionCommands,
  type TranscriptionParams,
} from "@syntheo/plugin-transcription";

import { BatchResponseProcessingError } from "./batch-response-processing-error";
import { completeCaptureTranscript } from "./capture-completion";
import { useListener } from "./contexts";
import { persistTranscriptWrite } from "./persist-retry";
import {
  EMPTY_CURRENT_CAPTURE_TRANSCRIPT_ERROR_MESSAGE,
  INCOMPLETE_BATCH_TRANSCRIPT_ERROR_MESSAGE,
  type RunOptions,
  getSessionSpeakerCount,
  isRecoveryNoSpeechError,
  isTerminalBatchSaveError,
  selectedProviderLabel,
  toBatchTranscriptPromotion,
  toStoredSpeakerHint,
  toStoredTranscriptWord,
} from "./run-batch-helpers";
import {
  canUseTranscriptionTarget,
  selectTranscriptionProvider,
  storedTranscriptionProvider,
} from "./transcription-route";
import { useSTTConnection } from "./useSTTConnection";

import { deleteProcessedAudioForRetention } from "~/services/audio-retention";
import { useSession, useSessionParticipants } from "~/session/queries";
import { useConfigValue } from "~/shared/config";
import { id } from "~/shared/utils";
import {
  acknowledgeCompletedBatch,
  notifyBatchCompleted,
} from "~/store/zustand/listener/general-batch";
import type { BatchPersistCallback } from "~/store/zustand/listener/transcript";
import { serializeBatchResumeContext } from "~/stt/batch-resume-context";
import { getTranscriptionLanguages } from "~/stt/capabilities";
import type { SpeakerHintWithId, WordWithId } from "~/stt/types";

export {
  reconcileRefinedSpeakerClusters,
  EMPTY_CURRENT_CAPTURE_TRANSCRIPT_ERROR_MESSAGE,
  canRunBatchTranscription,
  isStoppedTranscriptionError,
  isTerminalTranscriptionError,
  getSessionSpeakerCount,
} from "./run-batch-helpers";

export { getBatchProvider } from "./transcription-route";
export const useRunBatch = (sessionId: string) => {
  const session = useSession(sessionId);
  const participants = useSessionParticipants(sessionId);

  const startTranscription = useListener((state) => state.startTranscription);
  const stopTranscription = useListener((state) => state.stopTranscription);
  const { conn } = useSTTConnection();
  const aiLanguage = useConfigValue("ai_language");
  const spokenLanguages = useConfigValue("spoken_languages");
  const dictionaryTerms = useConfigValue("personalization_dictionary_terms");
  // Règle audio de Syntheo : l'audio traité est toujours supprimé.
  const audioRetention = "none" as const;

  return useCallback(
    async (filePath: string, options?: RunOptions) => {
      options?.signal?.throwIfAborted();
      if (!startTranscription) {
        throw new Error(
          t`The transcription service is not available. Set up your transcription provider.`,
        );
      }

      let languages =
        options?.languages ??
        getTranscriptionLanguages(aiLanguage, spokenLanguages);
      const selectedProviderId = options?.provider ?? conn?.provider;
      const selectedModel = options?.model ?? conn?.model;
      const selectedProvider =
        selectedProviderId && selectedModel
          ? selectTranscriptionProvider(
              selectedProviderId,
              selectedModel,
              options?.allowRealtimeStream === true,
            )
          : null;
      const selectedTarget =
        conn && selectedModel && selectedProvider
          ? {
              provider: selectedProvider,
              model: selectedModel,
              baseUrl: options?.baseUrl ?? conn.baseUrl,
              apiKey: options?.apiKey ?? conn.apiKey,
              label: selectedModel,
            }
          : null;
      let selectedTargetSupported = selectedTarget
        ? await canUseTranscriptionTarget(
            selectedTarget.provider,
            selectedProviderId,
            selectedTarget.model,
            languages,
          )
        : false;
      // Issue 518 : comme l'écoute en direct (getLiveTranscriptionConfig), un
      // modèle temps réel qui ne gère qu'une langue à la fois rejoue le
      // fichier dans la langue principale.
      const primaryLanguage = languages[0];
      if (
        selectedTarget?.provider === "realtime" &&
        !selectedTargetSupported &&
        !options?.languages &&
        languages.length > 1 &&
        primaryLanguage &&
        (await canUseTranscriptionTarget(
          selectedTarget.provider,
          selectedProviderId,
          selectedTarget.model,
          [primaryLanguage],
        ))
      ) {
        languages = [primaryLanguage];
        selectedTargetSupported = true;
      }
      options?.signal?.throwIfAborted();
      // Aucun repli : sans endpoint on-prem capable de batch, l'import échoue.
      const fallbackTarget = selectedTargetSupported ? selectedTarget : null;
      const target = options?.resume
        ? {
            provider: options.resume.provider,
            model: options.resume.model,
            baseUrl: conn?.baseUrl ?? "",
            apiKey: conn?.apiKey ?? "",
            label: options.resume.model,
          }
        : fallbackTarget;

      if (!target) {
        const model = selectedProviderLabel(conn, selectedModel);
        throw new Error(
          selectedTarget
            ? t`${model} can't transcribe the selected languages. Choose languages it supports, or set up another transcription provider.`
            : t`${model} can't transcribe a recording afterwards. Choose a model that transcribes files, or set up another transcription provider.`,
        );
      }

      const storedProvider = storedTranscriptionProvider(
        target.provider,
        conn?.provider,
      );
      const createdAt = new Date().toISOString();
      const startedAt = options?.captureInterval?.startedAtMs ?? Date.now();
      const memoMd = session?.raw_md ?? "";
      let keywords = options?.keywords;
      if (keywords === undefined) {
        const { getSessionKeywords } = await import("./useKeywords");
        keywords = await getSessionKeywords({
          sessionId,
          dictionaryTerms,
        });
      }
      options?.signal?.throwIfAborted();
      let transcriptId: string | null = null;
      const inferredNumSpeakers =
        options?.numSpeakers === undefined &&
        options?.minSpeakers === undefined &&
        options?.maxSpeakers === undefined
          ? getSessionSpeakerCount(
              participants
                .filter((participant) => participant.source !== "excluded")
                .map((participant) => participant.humanId),
              session?.user_id,
            )
          : undefined;

      const handlePersist: BatchPersistCallback | undefined =
        options?.handlePersist;
      let stagedWords: WordWithId[] = [];
      let stagedHints: SpeakerHintWithId[] = [];

      const persist: BatchPersistCallback =
        handlePersist ??
        ((words, hints, persistOptions) => {
          if (words.length === 0) {
            return;
          }

          const newWords: WordWithId[] = [];
          const newWordIds: string[] = [];

          words.forEach((word) => {
            const wordId = id();

            newWords.push({
              id: wordId,
              text: word.text,
              start_ms: word.start_ms,
              end_ms: word.end_ms,
              channel: word.channel,
              metadata: word.metadata
                ? JSON.stringify(word.metadata)
                : undefined,
            });

            newWordIds.push(wordId);
          });

          const newHints: SpeakerHintWithId[] = [];

          hints.forEach((hint) => {
            if (hint.data.type !== "provider_speaker_index") {
              return;
            }

            const wordId = newWordIds[hint.wordIndex];
            const word = words[hint.wordIndex];

            if (!wordId || !word) {
              return;
            }

            newHints.push({
              id: id(),
              word_id: wordId,
              type: "provider_speaker_index",
              value: JSON.stringify({
                provider: hint.data.provider ?? storedProvider,
                channel: hint.data.channel ?? word.channel,
                speaker_index: hint.data.speaker_index,
              }),
            });
          });

          transcriptId ??= id();
          if (persistOptions?.mode === "replace") {
            stagedWords = [];
            stagedHints = [];
          }
          stagedWords.push(...newWords);
          stagedHints.push(...newHints);
        });

      const jobId = options?.recovery ? `${sessionId}:recovery` : sessionId;
      const resumeContext =
        !handlePersist &&
        !options?.recovery &&
        !options?.deferAudioFinalization &&
        options?.promotion?.scope === "whole_session"
          ? serializeBatchResumeContext({ promotion: "whole_session" })
          : null;
      const params: TranscriptionParams = {
        session_id: jobId,
        provider: target.provider,
        file_path: filePath,
        audio: options?.audio,
        audio_upload_id: options?.audioUploadId,
        model: target.model,
        base_url: target.baseUrl,
        api_key: target.apiKey,
        keywords,
        languages,
        num_speakers: options?.numSpeakers ?? inferredNumSpeakers,
        min_speakers: options?.minSpeakers,
        max_speakers: options?.maxSpeakers,
        resume_context: resumeContext,
      };

      const run = async (batchParams: TranscriptionParams) => {
        options?.signal?.throwIfAborted();
        try {
          await startTranscription(batchParams, {
            signal: options?.signal,
            handlePersist: (...args) => {
              if (options?.signal?.aborted) return;
              return persist(...args);
            },
            notifyOnCompletion: false,
            recovery: Boolean(options?.recovery),
          });
          options?.signal?.throwIfAborted();
        } finally {
          if (options?.signal?.aborted) {
            await stopTranscription(jobId).catch(() => {});
          }
        }
      };

      const saveBatchResults = async () => {
        const promotion = options?.promotion ?? {
          scope: "preserve_existing",
        };
        const refinementPromotion = toBatchTranscriptPromotion(promotion);
        const saved = await persistTranscriptWrite(async () => {
          const result = await transcriptionCommands.saveBatchTranscript({
            session_id: sessionId,
            transcript_id: transcriptId,
            owner_user_id: session?.user_id ?? "",
            created_at: createdAt,
            started_at: startedAt,
            memo: memoMd,
            provider: storedProvider,
            model: target.model,
            words: stagedWords.map(toStoredTranscriptWord),
            hints: stagedHints.map(toStoredSpeakerHint),
            promotion: refinementPromotion,
            mark_audio_complete: !options?.deferAudioFinalization,
          });
          if (result.status === "error") {
            throw new Error(result.error);
          }
          return result.data;
        });
        if (saved.status === "empty_current_capture") {
          throw new Error(EMPTY_CURRENT_CAPTURE_TRANSCRIPT_ERROR_MESSAGE);
        }
        if (saved.status === "truncated") {
          throw new Error(INCOMPLETE_BATCH_TRANSCRIPT_ERROR_MESSAGE);
        }
        if (
          saved.status === "saved" &&
          saved.transcript_id &&
          options?.captureInterval
        ) {
          await persistTranscriptWrite(() =>
            completeCaptureTranscript(
              sessionId,
              saved.transcript_id!,
              options.captureInterval!.stoppedAtMs,
            ),
          );
        }
      };

      return (async () => {
        try {
          await run(params);
        } catch (error) {
          options?.signal?.throwIfAborted();
          if (!isRecoveryNoSpeechError(options, error)) {
            throw error;
          }
        }

        if (options?.recovery) {
          options.signal?.throwIfAborted();
          await options.recovery.persist(stagedWords, stagedHints);
          await acknowledgeCompletedBatch(jobId);
          return;
        }

        try {
          if (!handlePersist) {
            await saveBatchResults();
          }
          if (!options?.deferAudioFinalization) {
            await deleteProcessedAudioForRetention(audioRetention, sessionId);
          }
        } catch (error) {
          if (isTerminalBatchSaveError(error)) {
            throw error;
          }
          throw new BatchResponseProcessingError(error);
        }
        await acknowledgeCompletedBatch(jobId);
        if (options?.notifyOnCompletion !== false) {
          await notifyBatchCompleted();
        }
      })();
    },
    [
      conn,
      aiLanguage,
      dictionaryTerms,
      session,
      participants,
      spokenLanguages,
      startTranscription,
      stopTranscription,
      sessionId,
    ],
  );
};
