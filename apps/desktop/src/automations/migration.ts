import { isStepTypeAvailable } from "./steps";
import { parseAutomationRunRecord } from "./types";
import {
  type AutomationWorkflow,
  createEmptyWorkflow,
  isWorkflowReady,
  mutateAutomationWorkflows,
} from "./workflows";

import { getStoredSettingValues, setSettingValues } from "~/settings/queries";

// Migration au démarrage (issue 439) : l'ancien modèle « export Markdown » et
// ses clés de réglage deviennent une automatisation ordinaire, et les étapes
// cloud héritées (Slack, Notion, Linear, Google Drive) sont retirées des
// automatisations enregistrées.

export const LEGACY_MARKDOWN_WORKFLOW_ID = "legacy-markdown-export";
const LEGACY_STARTER_ID = "markdown-export";

export async function migrateLegacyAutomations(): Promise<void> {
  const { values } = await getStoredSettingValues();
  const enabled = values.automation_markdown_export_enabled === true;
  const directory = (values.automation_markdown_export_directory ?? "").trim();
  const lastRunValue = values.automation_markdown_export_last_run ?? "";
  const draftTemplate = values.automation_draft_template ?? "";
  const hasLegacyKeys =
    enabled || directory !== "" || lastRunValue !== "" || draftTemplate !== "";
  const strippedWorkflowIds = workflowsWithUnsupportedSteps(
    values.automation_workflows,
  );

  if (!hasLegacyKeys && strippedWorkflowIds.size === 0) {
    return;
  }

  // Activé, ou gardé comme brouillon sur la page : on conserve la
  // configuration. Retiré (désactivé et plus affiché) : rien à recréer.
  const keepLegacyExport =
    directory !== "" && (enabled || draftTemplate === LEGACY_STARTER_ID);

  await mutateAutomationWorkflows((current) => {
    const cleaned = current.map((workflow) =>
      strippedWorkflowIds.has(workflow.id) && !isWorkflowReady(workflow)
        ? { ...workflow, enabled: false }
        : workflow,
    );
    if (
      !keepLegacyExport ||
      cleaned.some((workflow) => workflow.id === LEGACY_MARKDOWN_WORKFLOW_ID)
    ) {
      return cleaned;
    }
    return [
      legacyMarkdownWorkflow({
        directory,
        enabled,
        lastRun: parseAutomationRunRecord(lastRunValue),
      }),
      ...cleaned,
    ];
  });

  if (hasLegacyKeys) {
    await setSettingValues({
      automation_markdown_export_enabled: false,
      automation_markdown_export_directory: "",
      automation_markdown_export_last_run: "",
      automation_draft_template: "",
    });
  }
}

/**
 * L'ancien export : fin de réunion → exporter, sans options (le fichier est
 * le même qu'avant), rafraîchi quand la synthèse est prête.
 */
function legacyMarkdownWorkflow({
  directory,
  enabled,
  lastRun,
}: Pick<AutomationWorkflow, "enabled" | "lastRun"> & {
  directory: string;
}): AutomationWorkflow {
  return createEmptyWorkflow({
    id: LEGACY_MARKDOWN_WORKFLOW_ID,
    templateId: LEGACY_STARTER_ID,
    enabled,
    trigger: "meeting_completed",
    steps: [
      {
        id: `${LEGACY_MARKDOWN_WORKFLOW_ID}-step`,
        type: "markdown_export",
        directory,
      },
    ],
    lastRun,
  });
}

/** Automatisations enregistrées qui contiennent une étape d'un type retiré. */
function workflowsWithUnsupportedSteps(raw: string | undefined): Set<string> {
  const ids = new Set<string>();
  if (!raw) {
    return ids;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return ids;
    }
    for (const item of parsed) {
      const record = item as { id?: unknown; steps?: unknown } | null;
      if (
        typeof record?.id === "string" &&
        Array.isArray(record.steps) &&
        record.steps.some(
          (step: { type?: unknown } | null) =>
            typeof step?.type !== "string" || !isStepTypeAvailable(step.type),
        )
      ) {
        ids.add(record.id);
      }
    }
  } catch {
    // Liste illisible : la lecture normale l'ignore déjà.
  }
  return ids;
}

let migration: Promise<void> | null = null;

/** Lance la migration une fois ; un échec est retenté au prochain appel. */
export function ensureLegacyAutomationsMigrated(): Promise<void> {
  migration ??= migrateLegacyAutomations().catch((error: unknown) => {
    console.error("[automations] legacy migration failed", error);
    migration = null;
  });
  return migration;
}

/** Tests : oublie la migration déjà faite dans ce processus. */
export function resetLegacyMigrationForTests() {
  migration = null;
}
