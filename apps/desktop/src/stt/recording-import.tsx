import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { commands as fsSyncCommands } from "@syntheo/plugin-fs-sync";
import { commands as settingsCommands } from "@syntheo/plugin-settings";
import { commands as transcriptionCommands } from "@syntheo/plugin-transcription";
import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import { executeTransaction, liveQueryClient } from "~/db";
import { getEnhancerService } from "~/services/enhancer";
import { useSession } from "~/session/queries";
import {
  AGENT_IMPORT_FAILED_CODE,
  agentImportInterruptedFailureStatement,
  recordTranscriptionFailure,
} from "~/session/transcription-failure";
import { useAiProvidersState } from "~/settings/providers";
import { useSettingsReady } from "~/settings/queries";
import { errorText, sanitizeErrorText } from "~/shared/service-error";
import { discardAudioUpload } from "~/stt/audio-upload-stream";
import { isNoSpeechDetectedError } from "~/stt/no-speech-error";
import { useRunBatch } from "~/stt/useRunBatch";
import { useSTTConnection } from "~/stt/useSTTConnection";

const WORKER_ID_STORAGE_KEY = "syntheo.recording-import.worker-id";

/** Issue 817 : l'identifiant du worker vit autant que la fenêtre principale,
 * pas autant qu'un chargement de l'interface. sessionStorage survit à
 * location.reload() mais pas au redémarrage de l'application. */
function stableWorkerId(): string {
  try {
    const saved = sessionStorage.getItem(WORKER_ID_STORAGE_KEY);
    if (saved) return saved;
    const created = crypto.randomUUID();
    sessionStorage.setItem(WORKER_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

const workerId = stableWorkerId();
// The agent CLI treats the desktop as available while this heartbeat is fresher
// than 90 s (`crates/agent-access`). Each beat is a SQLite write, so it stays
// sparse: every 5 s kept the WAL busy even when the app was idle (issue 271).
const RECORDING_IMPORT_HEARTBEAT_MS = 30_000;
// A running job refreshes its row every 10 s; past this age it was interrupted.
// Issue 816 : Syntheo is single-instance and only the main window runs this
// worker, so a running job held by another worker id lost its processing and
// is interrupted on the first beat, without waiting for this delay.
const STALE_JOB_SECONDS = 120;
type ImportJob = { id: string; meeting_id: string; file_path: string };

/** Formats acceptés pour un import demandé par un agent (même liste que la
 * CLI, crates/agent-access/src/recording_import.rs). */
const AGENT_RECORDING_EXTENSIONS = [
  "wav",
  "mp3",
  "ogg",
  "mp4",
  "m4a",
  "flac",
  "webm",
  "aac",
];

export function isAgentRecordingPath(path: string): boolean {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return (
    dot > 0 &&
    AGENT_RECORDING_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase())
  );
}

export async function recordingImportHeartbeat() {
  const vault = await settingsCommands.vaultBase();
  if (vault.status === "error") throw new Error(vault.error);
  await executeTransaction([
    {
      sql: `INSERT INTO local_recording_import_worker (id, vault_path, updated_at) VALUES (?, ?, unixepoch())
        ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, vault_path = excluded.vault_path`,
      params: [workerId, vault.data],
    },
    agentImportInterruptedFailureStatement(workerId, STALE_JOB_SECONDS),
    {
      sql: `UPDATE local_recording_import_jobs SET processing_status = 'failed',
        error = 'Desktop processing was interrupted. The meeting and any completed transcript were preserved.',
        updated_at = unixepoch()
        WHERE processing_status IN ('importing', 'transcribing', 'summarizing')
          AND (worker_id IS NOT ? OR updated_at < unixepoch() - ?)`,
      params: [workerId, STALE_JOB_SECONDS],
    },
    {
      sql: `UPDATE local_recording_import_jobs SET processing_status = 'failed', error = 'Meeting was deleted.', updated_at = unixepoch()
        WHERE processing_status = 'queued' AND NOT EXISTS (SELECT 1 FROM sessions WHERE sessions.id = meeting_id AND deleted_at IS NULL)`,
      params: [],
    },
    {
      sql: `UPDATE local_recording_import_jobs SET processing_status = 'failed', error = 'Recording import is disabled by managed policy.', updated_at = unixepoch()
        WHERE processing_status = 'queued' AND EXISTS (SELECT 1 FROM managed_app_settings WHERE id = 'intelligence_disabled' AND value_json = 'true')`,
      params: [],
    },
  ]);
  // The recording stays at its original location: no audio is copied into the
  // app's data directory, so completed jobs only drop the stored path.
  await executeTransaction([
    {
      sql: `UPDATE local_recording_import_jobs SET file_path = '' WHERE processing_status IN ('done', 'failed') AND file_path != ''`,
      params: [],
    },
  ]);
}

export function RecordingImportWorker() {
  useMountEffect(() => {
    const tick = () => void recordingImportHeartbeat().catch(console.error);
    tick();
    const timer = setInterval(tick, RECORDING_IMPORT_HEARTBEAT_MS);
    return () => {
      clearInterval(timer);
    };
  });
  const { data: jobs = [] } = useQuery({
    queryKey: ["local-recording-import-jobs"],
    queryFn: () =>
      liveQueryClient.execute<ImportJob>(
        `SELECT id, meeting_id, file_path FROM local_recording_import_jobs
       WHERE processing_status = 'queued' OR (worker_id = ? AND processing_status IN ('importing', 'transcribing', 'summarizing'))
       ORDER BY CASE WHEN processing_status = 'queued' THEN 1 ELSE 0 END, updated_at, id LIMIT 1`,
        [workerId],
      ),
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });
  return (
    <>
      {jobs.map((job) => (
        <ReadyImport key={job.id} job={job} />
      ))}
    </>
  );
}

function ReadyImport({ job }: { job: ImportJob }) {
  const session = useSession(job.meeting_id);
  const settingsReady = useSettingsReady();
  const stt = useAiProvidersState("stt");
  const llm = useAiProvidersState("llm");
  return session && settingsReady && stt.isReady && llm.isReady ? (
    <RunImport job={job} />
  ) : null;
}

const runningImports = new Set<string>();

function RunImport({ job }: { job: ImportJob }) {
  const runBatch = useRunBatch(job.meeting_id);
  // Issue 793 : au premier rendu, les réglages lus en direct sont encore « en
  // chargement » (packages/db-react), donc la connexion de transcription est
  // vide. L'import démarre seulement quand ce composant les voit chargés, et
  // appelle toujours le runBatch du dernier rendu.
  const { isLoading: connectionLoading } = useSTTConnection();
  const runBatchRef = useRef(runBatch);
  useEffect(() => {
    runBatchRef.current = runBatch;
  }, [runBatch]);
  useEffect(() => {
    if (connectionLoading) return;
    // Defer acquisition until after React's mount/cleanup probe. Once started,
    // processing outlives this component so navigation does not fail the job.
    const start = setTimeout(() => {
      if (runningImports.has(job.id)) return;
      runningImports.add(job.id);
      void processImport(job, (...args) => runBatchRef.current(...args))
        .catch(console.error)
        .finally(() => runningImports.delete(job.id));
    }, 0);
    return () => {
      clearTimeout(start);
    };
  }, [connectionLoading, job]);
  return null;
}

async function processImport(
  job: ImportJob,
  runBatch: ReturnType<typeof useRunBatch>,
) {
  const update = async (
    status: string,
    summary = "pending",
    error: string | null = null,
  ) => {
    await executeTransaction([
      {
        sql: `UPDATE local_recording_import_jobs SET processing_status = ?, summary_status = ?, error = ?, updated_at = unixepoch()
        WHERE id = ? AND worker_id = ? AND processing_status NOT IN ('done', 'failed')`,
        params: [status, summary, error, job.id, workerId],
        ...(status !== "failed" ? { expectedRowsAffected: 1 } : {}),
      },
    ]);
  };
  const claimed = await liveQueryClient.execute<{ id: string }>(
    `UPDATE local_recording_import_jobs SET worker_id = ?, processing_status = 'importing', updated_at = unixepoch()
     WHERE id = ? AND processing_status = 'queued'
     AND NOT EXISTS (SELECT 1 FROM managed_app_settings WHERE id = 'intelligence_disabled' AND value_json = 'true') RETURNING id`,
    [workerId, job.id],
  );
  if (!claimed.length) return;
  const timer = setInterval(() => {
    void executeTransaction([
      {
        sql: `UPDATE local_recording_import_jobs SET updated_at = unixepoch() WHERE id = ? AND worker_id = ? AND processing_status NOT IN ('done', 'failed')`,
        params: [job.id, workerId],
      },
    ]).catch(console.error);
  }, 10000);
  let phase = "importing";
  let uploadId: string | null = null;
  try {
    const imported = await fsSyncCommands.audioImport(
      job.meeting_id,
      job.file_path,
    );
    if (imported.status === "error") throw new Error(imported.error);
    // Issue 657 : le fichier réellement lu (lien symbolique résolu) doit
    // encore être un enregistrement, comme vérifié par la CLI à la demande.
    if (!isAgentRecordingPath(imported.data)) {
      throw new Error("Unsupported recording format");
    }
    // Issue 744 : le fichier est ouvert une seule fois côté Rust ; la
    // validation porte sur le descripteur ouvert, qui est lu en mémoire. La
    // transcription reprend ce contenu et ne relit jamais le chemin, qui
    // pourrait avoir été remplacé depuis la validation.
    const opened = await transcriptionCommands.openRecordingImport(
      imported.data,
    );
    if (opened.status === "error") throw new Error(opened.error);
    uploadId = opened.data;
    phase = "transcribing";
    await update(phase);
    await runBatch("", {
      // Issue 793 : sans modèle par lot (serveur NVIDIA, NeMo-Speech.cpp),
      // l'enregistrement passe par le flux temps réel, comme un fichier
      // déposé dans une note.
      allowRealtimeStream: true,
      promotion: { scope: "whole_session" },
      audioUploadId: uploadId,
    });
    phase = "summarizing";
    await update(phase);
    const enhancer = getEnhancerService();
    if (!enhancer)
      throw new Error(
        "Intelligence service is not ready. Transcript was preserved.",
      );
    const summary = await enhancer.enhanceAndWait(job.meeting_id);
    await update("done", summary);
  } catch (error) {
    // Issue 794 : l'échec n'était visible nulle part. Le journal reçoit la
    // phase (seul le libellé entre crochets est gardé dans app.log) et une
    // raison nettoyée : adresses réduites à l'hôte, jetons masqués, bornée.
    const reason = sanitizeErrorText(errorText(error));
    console.error(`[recording-import:${phase}] agent import failed`, reason);
    // Avant le résumé, la réunion reste vide : l'échec est gardé dans la note,
    // comme pour un fichier déposé (issue 559). Un résumé en échec a déjà son
    // propre état dans la note, et la transcription y est.
    if (phase !== "summarizing") {
      await recordTranscriptionFailure(
        job.meeting_id,
        new Error(reason),
        isNoSpeechDetectedError(error) ? "no_speech" : AGENT_IMPORT_FAILED_CODE,
      ).catch((persistError: unknown) => {
        console.error(
          "[recording-import] failed to record failure",
          persistError,
        );
      });
    }
    // Provider errors may contain credentials; keep externally readable job errors bounded and generic.
    await update(
      "failed",
      phase === "summarizing" ? "failed" : "pending",
      `${phase} failed or was interrupted. Check the desktop app; completed meeting data was preserved.`,
    );
  } finally {
    clearInterval(timer);
    // Sans effet si le batch a déjà repris le contenu.
    if (uploadId) await discardAudioUpload(uploadId);
  }
}
