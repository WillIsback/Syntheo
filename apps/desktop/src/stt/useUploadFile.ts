import { t } from "@lingui/core/macro";
import { useQueryClient } from "@tanstack/react-query";
import { Effect, pipe } from "effect";
import { useCallback } from "react";

import {
  commands as fsSyncCommands,
  events as fsSyncEvents,
} from "@syntheo/plugin-fs-sync";
import { commands as listener2Commands } from "@syntheo/plugin-transcription";
import { toast } from "@syntheo/ui/components/ui/toast";

import {
  ensureAudioImportAvailable,
  notifyAudioImportFailed,
  useAudioImportAvailability,
} from "./audio-import-feedback";
import { estimateUploadedAudioSessionCreatedAt } from "./audio-note-date";
import {
  bytesToBase64,
  discardAudioUpload,
  streamAudioFileToMemory,
} from "./audio-upload-stream";
import { useListener } from "./contexts";
import { fromResult } from "./fromResult";
import { ChannelProfile } from "./segment";
import { selectUploadFile } from "./select-upload-file";
import { isStoppedTranscriptionError, useRunBatch } from "./useRunBatch";

import { getEnhancerService } from "~/services/enhancer";
import { enqueueSessionAudioOperation } from "~/session/audio-operations";
import { useSession, useUpdateSession } from "~/session/queries";
import { type Tab, useTabs } from "~/store/zustand/tabs";
import { createTranscript } from "~/stt/queries";

export const AUDIO_EXTENSIONS = [
  "wav",
  "mp3",
  "ogg",
  "mp4",
  "m4a",
  "flac",
  "webm",
  "aac",
];
const AUDIO_TRANSFER_EXTENSIONS = [...AUDIO_EXTENSIONS, "qta"];
const TRANSCRIPT_EXTENSIONS = ["vtt", "srt"];
const MAX_IPC_AUDIO_BYTES = 4 * 1024 * 1024;

function fileExtension(value: string) {
  const extension = value.toLowerCase().split(".").pop();
  return extension && extension !== value.toLowerCase() ? extension : "";
}

export function isAudioUploadFile(file: Pick<File, "name" | "type">) {
  return (
    AUDIO_TRANSFER_EXTENSIONS.includes(fileExtension(file.name)) ||
    file.type.startsWith("audio/")
  );
}

function isAudioUploadPath(path: string) {
  return AUDIO_EXTENSIONS.includes(fileExtension(path));
}

/** Ce que l'import remet au batch : un chemin, ou de l'audio en mémoire. */
type ImportedAudio = {
  filePath: string;
  audio?: { data_base64: string; file_name: string };
  audioUploadId?: string;
};

export function useUploadFile(sessionId: string) {
  const runBatch = useRunBatch(sessionId);
  const queryClient = useQueryClient();
  const handleBatchStarted = useListener((state) => state.handleBatchStarted);
  const handleBatchFailed = useListener((state) => state.handleBatchFailed);
  const updateBatchProgress = useListener((state) => state.updateBatchProgress);
  const clearBatchSession = useListener((state) => state.clearBatchSession);

  const session = useSession(sessionId);
  const updateSession = useUpdateSession(sessionId);
  const audioImportAvailability = useAudioImportAvailability();

  const triggerEnhance = useCallback(async () => {
    const service = getEnhancerService();
    if (!service) return;

    try {
      const result = await service.enhance(sessionId);
      if (result.type !== "started" && result.type !== "already_active") {
        return;
      }
      const tabsState = useTabs.getState();
      const sessionTab = tabsState.tabs.find(
        (tab): tab is Extract<Tab, { type: "sessions" }> =>
          tab.type === "sessions" && tab.id === sessionId,
      );
      if (sessionTab && sessionTab.state.view?.type !== "transcript") {
        tabsState.updateSessionTabState(sessionTab, {
          ...sessionTab.state,
          view: { type: "enhanced", id: result.noteId },
        });
      }
    } catch (error) {
      console.error("[enhancer] failed to enhance uploaded file", error);
    }
  }, [sessionId]);

  const triggerEnhanceIfSummaryEmpty = useCallback(async () => {
    try {
      await getEnhancerService()?.queueAutoEnhanceIfSummaryEmpty(sessionId);
    } catch (error) {
      console.error("[enhancer] failed to queue uploaded file", error);
    }
  }, [sessionId]);

  const applyEstimatedAudioNoteDate = useCallback(
    async (filePath: string) => {
      try {
        const result = await fsSyncCommands.audioSourceMetadata(filePath);
        if (result.status === "error") {
          return;
        }

        const estimatedCreatedAt = estimateUploadedAudioSessionCreatedAt(
          result.data,
        );
        if (!estimatedCreatedAt) {
          return;
        }

        await updateSession({ created_at: estimatedCreatedAt });
      } catch (error) {
        console.error("[upload] audio metadata inspection failed:", error);
      }
    },
    [updateSession],
  );

  const applyDroppedAudioNoteDate = useCallback(
    async (file: File) => {
      try {
        if (!Number.isFinite(file.lastModified) || file.lastModified <= 0) {
          return;
        }

        await updateSession({
          created_at: new Date(file.lastModified).toISOString(),
        });
      } catch (error) {
        console.error("[upload] dropped audio date inspection failed:", error);
      }
    },
    [updateSession],
  );

  const importWithProgress = useCallback(
    async (
      runImport: () => Promise<
        | { status: "ok"; data: string }
        | {
            status: "error";
            error: string;
          }
      >,
    ) =>
      enqueueSessionAudioOperation(sessionId, async () => {
        const unlisten = await fsSyncEvents.audioImportEvent.listen((e) => {
          if (
            e.payload.type === "audioImportProgress" &&
            e.payload.session_id === sessionId
          ) {
            updateBatchProgress(sessionId, e.payload.percentage);
          }
        });

        try {
          const result = await runImport();
          if (result.status === "error") {
            throw new Error(result.error);
          }
          return result.data;
        } finally {
          unlisten();
        }
      }),
    [sessionId, updateBatchProgress],
  );

  const runAudioImport = useCallback(
    (
      importAudio: () => Promise<ImportedAudio>,
      inspectAudioDate: () => Promise<void>,
      cleanup?: () => Promise<void>,
    ) => {
      // Vérifié avant toute écriture : un modèle temps réel seul laisse la
      // note intacte (issue 462).
      if (!ensureAudioImportAvailable(audioImportAvailability)) {
        return;
      }

      const program = pipe(
        Effect.promise(inspectAudioDate),
        Effect.tap(() =>
          Effect.sync(() => {
            handleBatchStarted(sessionId, "importing");
          }),
        ),
        Effect.flatMap(() =>
          Effect.tryPromise({
            try: importAudio,
            catch: (error) =>
              error instanceof Error ? error : new Error(String(error)),
          }),
        ),
        Effect.tap(() =>
          Effect.sync(() => {
            void queryClient.invalidateQueries({
              queryKey: ["audio", sessionId, "exist"],
            });
            void queryClient.invalidateQueries({
              queryKey: ["audio", sessionId, "url"],
            });
          }),
        ),
        Effect.tap(() => Effect.sync(() => clearBatchSession(sessionId))),
        Effect.flatMap(({ filePath, audio, audioUploadId }) =>
          Effect.tryPromise({
            try: () =>
              runBatch(filePath, {
                // Sans modèle par lot, le fichier passe par le flux temps
                // réel (issue 463).
                allowRealtimeStream: true,
                promotion: { scope: "whole_session" },
                ...(audio ? { audio } : {}),
                ...(audioUploadId ? { audioUploadId } : {}),
              }),
            catch: (error) => error,
          }),
        ),
        Effect.tap(() => Effect.promise(triggerEnhanceIfSummaryEmpty)),
        Effect.catch((error: unknown) =>
          Effect.promise(async () => {
            await cleanup?.();
            if (isStoppedTranscriptionError(error)) {
              return;
            }
            const msg = error instanceof Error ? error.message : String(error);
            console.error("[upload] audio import failed:", error);
            handleBatchFailed(sessionId, msg);
            notifyAudioImportFailed(error);
          }),
        ),
      );

      void Effect.runPromise(program).catch((error) => {
        console.error("[upload] audio failed:", error);
      });
    },
    [
      audioImportAvailability,
      clearBatchSession,
      handleBatchFailed,
      handleBatchStarted,
      queryClient,
      runBatch,
      sessionId,
      triggerEnhanceIfSummaryEmpty,
    ],
  );

  const processFile = useCallback(
    (filePath: string, kind: "audio" | "transcript") => {
      const normalizedPath = filePath.toLowerCase();

      if (kind === "transcript") {
        if (
          !normalizedPath.endsWith(".vtt") &&
          !normalizedPath.endsWith(".srt")
        ) {
          return;
        }

        const program = pipe(
          fromResult(() => listener2Commands.parseSubtitle(filePath)),
          Effect.tap((subtitle) => {
            if (subtitle.tokens.length === 0) {
              return Effect.void;
            }

            const transcriptId = crypto.randomUUID();
            const createdAt = new Date().toISOString();

            const words = subtitle.tokens.map((token) => ({
              id: crypto.randomUUID(),
              transcript_id: transcriptId,
              text: token.text,
              start_ms: token.start_time,
              end_ms: token.end_time,
              channel: ChannelProfile.MixedCapture,
              user_id: session?.user_id ?? "",
              created_at: new Date().toISOString(),
            }));

            return Effect.tryPromise({
              try: () =>
                createTranscript({
                  id: transcriptId,
                  sessionId,
                  ownerUserId: session?.user_id ?? "",
                  createdAt,
                  startedAt: Date.now(),
                  memo: session?.raw_md ?? "",
                  source: "subtitle_import",
                  words,
                }),
              catch: (error) =>
                error instanceof Error ? error : new Error(String(error)),
            }).pipe(
              Effect.tap(() => Effect.sync(() => {})),
              Effect.tap(() => Effect.promise(triggerEnhance)),
            );
          }),
        );

        void Effect.runPromise(program).catch((error) => {
          console.error("[upload] transcript failed:", error);
        });
        return;
      }

      if (!isAudioUploadPath(normalizedPath)) {
        return;
      }

      runAudioImport(
        async () => ({
          filePath: await importWithProgress(() =>
            fsSyncCommands.audioImport(sessionId, filePath),
          ),
        }),
        () => applyEstimatedAudioNoteDate(filePath),
      );
    },
    [
      sessionId,
      session,
      triggerEnhance,
      applyEstimatedAudioNoteDate,
      importWithProgress,
      runAudioImport,
    ],
  );

  const processAudioFile = useCallback(
    (
      file: File,
      options?: { allowUnknownAudio?: boolean; contentType?: string },
    ) => {
      if (!options?.allowUnknownAudio && !isAudioUploadFile(file)) {
        return;
      }

      const filePath = audioUploadFilePath(file);
      if (filePath) {
        runAudioImport(
          async () => ({
            filePath: await importWithProgress(() =>
              fsSyncCommands.audioImport(sessionId, filePath),
            ),
          }),
          () => applyDroppedAudioNoteDate(file),
        );
        return;
      }

      // Sans chemin disque (WebKitGTK, WebView2), le fichier déposé ne touche
      // jamais le disque : un petit fichier part en un seul envoi, un gros est
      // lu par morceaux et gardé en mémoire côté Rust (issue 464).
      if (file.size <= MAX_IPC_AUDIO_BYTES) {
        runAudioImport(
          async () => ({
            filePath: "",
            audio: {
              data_base64: await readIpcAudioBase64(file),
              file_name: file.name,
            },
          }),
          () => applyDroppedAudioNoteDate(file),
        );
        return;
      }

      let uploadId: string | null = null;
      runAudioImport(
        async () =>
          enqueueSessionAudioOperation(sessionId, async () => {
            uploadId = await streamAudioFileToMemory(file, (fraction) =>
              updateBatchProgress(sessionId, fraction),
            );
            return { filePath: "", audioUploadId: uploadId };
          }),
        () => applyDroppedAudioNoteDate(file),
        async () => {
          if (uploadId) {
            await discardAudioUpload(uploadId);
          }
        },
      );
    },
    [
      applyDroppedAudioNoteDate,
      importWithProgress,
      runAudioImport,
      sessionId,
      updateBatchProgress,
    ],
  );

  const selectAndUpload = useCallback(
    (kind: "audio" | "transcript") => {
      // Inutile de choisir un fichier que le modèle ne saura pas transcrire.
      if (
        kind === "audio" &&
        !ensureAudioImportAvailable(audioImportAvailability)
      ) {
        return;
      }

      selectUploadFile(
        kind,
        kind === "audio" ? AUDIO_EXTENSIONS : TRANSCRIPT_EXTENSIONS,
      )
        .then((path) => {
          if (path) {
            processFile(path, kind);
          }
        })
        .catch((error) => {
          // Le sélecteur n'a pas pu s'ouvrir : on le dit (issue 525).
          console.error("[upload] dialog failed:", error);
          if (kind === "audio") {
            notifyAudioImportFailed(error);
          } else {
            toast.error(t`Couldn't open the file picker`, {
              description:
                error instanceof Error ? error.message : String(error),
            });
          }
        });
    },
    [audioImportAvailability, processFile],
  );

  const uploadAudio = useCallback(
    () => selectAndUpload("audio"),
    [selectAndUpload],
  );
  const uploadTranscript = useCallback(
    () => selectAndUpload("transcript"),
    [selectAndUpload],
  );

  return {
    audioImportAvailability,
    uploadAudio,
    uploadTranscript,
    processFile,
    processAudioFile,
  };
}

function audioUploadFilePath(file: File) {
  const value = (file as { path?: unknown }).path;
  return typeof value === "string" && value.trim() ? value : null;
}

function assertIpcAudioSize(size: number) {
  if (size > MAX_IPC_AUDIO_BYTES) {
    throw new Error(
      "Audio files without a native path must be smaller than 4 MB",
    );
  }
}

async function readIpcAudioBase64(file: File) {
  assertIpcAudioSize(file.size);
  const arrayBuffer = await file.arrayBuffer();
  assertIpcAudioSize(arrayBuffer.byteLength);
  return bytesToBase64(new Uint8Array(arrayBuffer));
}
