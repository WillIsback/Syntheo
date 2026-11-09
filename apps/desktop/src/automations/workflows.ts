import {
  isWorkflowStepReady,
  parseWorkflowStep,
  type WorkflowStep,
} from "./steps";
import type { AutomationRunRecord } from "./types";
import { danglingOutputRefs } from "./variables";

import {
  getStoredSettingValues,
  setSettingValue,
  useStoredSettingValue,
} from "~/settings/queries";
import { id } from "~/shared/utils";

export {
  createWorkflowStep,
  isWorkflowStepReady,
  type WorkflowStep,
  type WorkflowStepType,
} from "./steps";

// Déclencheurs : la synthèse est prête, la réunion est terminée, ou un
// lancement à la main depuis une note (menu ⋯, capsule, « Demander à la
// note »). Une automatisation « manual » ne part jamais d'elle-même.
export const WORKFLOW_TRIGGERS = [
  "note_enhanced",
  "meeting_completed",
  "manual",
] as const;
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];
export type AutomaticWorkflowTrigger = Exclude<WorkflowTrigger, "manual">;

export type AutomationWorkflow = {
  id: string;
  /** Vide : l'interface affiche un titre par défaut traduit. */
  title: string;
  enabled: boolean;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  lastRun: AutomationRunRecord | null;
  processedSessionIds: string[];
  chatGroupId: string | null;
  /** Modèle d'origine (« Partir d'un modèle », migration) ; sert de titre par défaut. */
  templateId?: string;
};

export function createEmptyWorkflow(
  overrides: Partial<AutomationWorkflow> = {},
): AutomationWorkflow {
  return {
    id: overrides.id ?? id(),
    title: overrides.title ?? "",
    enabled: overrides.enabled ?? false,
    trigger: overrides.trigger ?? "note_enhanced",
    steps: overrides.steps ?? [],
    lastRun: overrides.lastRun ?? null,
    processedSessionIds: overrides.processedSessionIds ?? [],
    chatGroupId: overrides.chatGroupId ?? null,
    ...(overrides.templateId ? { templateId: overrides.templateId } : {}),
  };
}

export function isWorkflowReady(workflow: AutomationWorkflow): boolean {
  return (
    workflow.steps.length > 0 &&
    workflow.steps.every(isWorkflowStepReady) &&
    danglingOutputRefs(workflow).length === 0
  );
}

export function parseAutomationWorkflows(
  value: string | undefined,
): AutomationWorkflow[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item) => {
      const workflow = parseWorkflow(item);
      return workflow ? [workflow] : [];
    });
  } catch {
    return [];
  }
}

export function serializeAutomationWorkflows(
  workflows: AutomationWorkflow[],
): string {
  return JSON.stringify(workflows);
}

export async function saveAutomationWorkflows(
  workflows: AutomationWorkflow[],
): Promise<void> {
  await setSettingValue(
    "automation_workflows",
    serializeAutomationWorkflows(workflows),
  );
}

export function useAutomationWorkflows(): AutomationWorkflow[] {
  return parseAutomationWorkflows(
    useStoredSettingValue("automation_workflows").value,
  );
}

function parseWorkflow(value: unknown): AutomationWorkflow | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }

  const trigger = WORKFLOW_TRIGGERS.find((item) => item === value.trigger);
  const steps = Array.isArray(value.steps)
    ? value.steps.flatMap((step) => {
        const parsed = parseWorkflowStep(step);
        return parsed ? [parsed] : [];
      })
    : [];

  return {
    id: value.id,
    title: typeof value.title === "string" ? value.title : "",
    enabled: value.enabled === true,
    trigger: trigger ?? "note_enhanced",
    steps,
    lastRun: parseLastRun(value.lastRun),
    processedSessionIds: Array.isArray(value.processedSessionIds)
      ? value.processedSessionIds.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    chatGroupId:
      typeof value.chatGroupId === "string" ? value.chatGroupId : null,
    ...(typeof value.templateId === "string" && value.templateId
      ? { templateId: value.templateId }
      : {}),
  };
}

function parseLastRun(value: unknown): AutomationRunRecord | null {
  if (
    isRecord(value) &&
    typeof value.at === "string" &&
    (value.status === "success" || value.status === "error") &&
    typeof value.detail === "string"
  ) {
    return {
      at: value.at,
      status: value.status,
      detail: value.detail,
    };
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

let workflowWriteQueue: Promise<void> = Promise.resolve();

export function mutateAutomationWorkflows(
  update: (workflows: AutomationWorkflow[]) => AutomationWorkflow[],
): Promise<void> {
  const next = workflowWriteQueue.then(async () => {
    const { values } = await getStoredSettingValues();
    await setSettingValue(
      "automation_workflows",
      serializeAutomationWorkflows(
        update(parseAutomationWorkflows(values.automation_workflows)),
      ),
    );
  });
  workflowWriteQueue = next.catch(() => {});
  return next;
}
