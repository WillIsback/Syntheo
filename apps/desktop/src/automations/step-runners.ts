import {
  commands as localApiCommands,
  type MarkdownExportFile,
  type MarkdownExportOptions,
} from "@syntheo/plugin-local-api";

import {
  runClipboardStep,
  runCommandStep,
  runGenerateTextStep,
  runNotificationStep,
  runVaultWriteStep,
  runWebhookStep,
} from "./action-runners";
import { hasMarkdownExportContent } from "./markdown-export";
import type { MarkdownExportStep, WorkflowStep } from "./steps";
import type { WorkflowVariables } from "./variables";

import { getStoredSettingValues, setSettingValue } from "~/settings/queries";

// Exécution d'une étape. Un exécuteur par type d'étape ; la sortie éventuelle
// est publiée par le moteur pour les étapes suivantes.

export type StepRunContext = {
  sessionId: string;
  workflowId: string;
  workflowTitle: string;
  variables: WorkflowVariables;
  /**
   * À blanc : les étapes à effet réel décrivent ce qu'elles feraient sans
   * agir (test d'une automatisation).
   */
  dryRun?: boolean;
};

export type StepRunResult = {
  /** Résumé lisible pour la dernière exécution (chemin du fichier…). */
  detail: string;
  /** Valeur publiée pour les étapes suivantes. */
  output?: string;
  /** Fichier écrit ou note du coffre produite, ouvrable depuis un test. */
  artifact?: StepArtifact;
};

export type StepArtifact =
  | { kind: "file"; path: string }
  | { kind: "note"; sessionId: string; title: string };

type StepRunners = {
  [T in WorkflowStep["type"]]: (
    step: Extract<WorkflowStep, { type: T }>,
    context: StepRunContext,
  ) => Promise<StepRunResult>;
};

const STEP_RUNNERS: StepRunners = {
  markdown_export: runMarkdownExportStep,
  generate_text: runGenerateTextStep,
  vault_write: runVaultWriteStep,
  clipboard: runClipboardStep,
  notification: runNotificationStep,
  webhook: runWebhookStep,
  command: runCommandStep,
};

export async function runWorkflowStep(
  step: WorkflowStep,
  context: StepRunContext,
): Promise<StepRunResult> {
  const runner = STEP_RUNNERS[step.type] as (
    step: WorkflowStep,
    context: StepRunContext,
  ) => Promise<StepRunResult>;
  return await runner(step, context);
}

async function runMarkdownExportStep(
  step: MarkdownExportStep,
  { sessionId, workflowId, dryRun }: StepRunContext,
): Promise<StepRunResult> {
  const directory = step.directory.trim();
  if (!directory) {
    throw new Error("choose an export folder first");
  }
  if (step.options && !hasMarkdownExportContent(step.options)) {
    throw new Error("choose at least one element to export");
  }
  if (dryRun) {
    return { detail: directory };
  }
  const path = await exportConfiguredMarkdown(
    sessionId,
    directory,
    step.options,
    `${workflowId}:${step.id}:${sessionId}`,
  );
  return { detail: path, output: path, artifact: { kind: "file", path } };
}

type StoredMarkdownExportFile = MarkdownExportFile & { key: string };

const MAX_MARKDOWN_EXPORT_FILES = 200;

// A changed title renames the file, so the exporter replaces the one this step
// wrote last time unless another step now writes to that path.
async function exportConfiguredMarkdown(
  sessionId: string,
  directory: string,
  options: MarkdownExportOptions | undefined,
  key: string,
): Promise<string> {
  return await serializeSettingsUpdate(async () => {
    const { values } = await getStoredSettingValues();
    const files = parseMarkdownExportFiles(
      values.automation_markdown_export_files,
    );
    const others = files.filter((file) => file.key !== key);
    const previous = files.find((file) => file.key === key);
    const replaceable =
      previous &&
      !others.some(
        (file) => file.path.toLowerCase() === previous.path.toLowerCase(),
      )
        ? { path: previous.path, sha256: previous.sha256 }
        : null;
    const result = await localApiCommands.exportMeetingMarkdown(
      sessionId,
      directory,
      options ?? null,
      replaceable,
    );
    if (result.status === "error") {
      throw new Error(result.error);
    }
    const file = result.data;
    await setSettingValue(
      "automation_markdown_export_files",
      JSON.stringify(
        [...others, { key, ...file }].slice(-MAX_MARKDOWN_EXPORT_FILES),
      ),
    );
    return file.path;
  });
}

let settingsUpdates: Promise<unknown> = Promise.resolve();

// Concurrent runs read and rewrite the same stored list, so run each
// read-modify-write after the previous one finishes.
function serializeSettingsUpdate<T>(update: () => Promise<T>): Promise<T> {
  const next = settingsUpdates.then(update, update);
  settingsUpdates = next.catch(() => undefined);
  return next;
}

function parseMarkdownExportFiles(
  value: string | undefined,
): StoredMarkdownExportFile[] {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is StoredMarkdownExportFile =>
            typeof entry === "object" &&
            entry !== null &&
            ["key", "path", "sha256"].every(
              (field) =>
                typeof (entry as Record<string, unknown>)[field] === "string",
            ),
        )
      : [];
  } catch {
    return [];
  }
}
