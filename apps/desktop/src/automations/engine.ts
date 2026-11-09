import { ensureLegacyAutomationsMigrated } from "./migration";
import { runWorkflowStep, type StepArtifact } from "./step-runners";
import { stepDefinition, type WorkflowStep } from "./steps";
import { type AutomationRunRecord, parseAutomationRunRecord } from "./types";
import { type BaseVariableLoader, createWorkflowVariables } from "./variables";
import {
  type AutomaticWorkflowTrigger,
  type AutomationWorkflow,
  mutateAutomationWorkflows,
  parseAutomationWorkflows,
} from "./workflows";

import { getStoredSettingValues } from "~/settings/queries";

export type { AutomationRunRecord };
export { parseAutomationRunRecord };

// Un seul chemin d'exécution : un événement de note (fin de réunion,
// synthèse prête) ou un lancement à la main choisit les étapes à exécuter,
// puis `runWorkflowSteps` les enchaîne dans l'ordre, chaque sortie étant
// publiée pour les étapes suivantes.

const MAX_PROCESSED_SESSIONS = 50;

export async function runMeetingCompletedAutomations(
  sessionId: string,
): Promise<void> {
  await runAutomationsForEvent(sessionId, "meeting_completed");
}

export async function runNoteEnhancedAutomations(
  sessionId: string,
): Promise<void> {
  await runAutomationsForEvent(sessionId, "note_enhanced");
}

async function runAutomationsForEvent(
  sessionId: string,
  trigger: AutomaticWorkflowTrigger,
): Promise<void> {
  try {
    await enqueueWorkflowRun(async () => {
      await ensureLegacyAutomationsMigrated();
      const { values } = await getStoredSettingValues();
      for (const workflow of parseAutomationWorkflows(
        values.automation_workflows,
      )) {
        const steps = planEventRun(workflow, sessionId, trigger);
        if (steps.length === 0) {
          continue;
        }
        try {
          await runWorkflowSteps(sessionId, workflow, steps, {
            markProcessed: true,
          });
        } catch (error) {
          console.error("[automations] workflow run failed", error);
        }
      }
    });
  } catch (error) {
    console.error(`[automations] ${trigger} run failed`, error);
  }
}

/**
 * Étapes à lancer pour un événement. Une note déjà traitée ne relance que les
 * étapes sans effet cumulatif (un export réécrit le même fichier) ; la
 * synthèse prête rafraîchit aussi ces étapes pour une automatisation de fin
 * de réunion, lancée avant que la synthèse n'existe.
 */
export function planEventRun(
  workflow: AutomationWorkflow,
  sessionId: string,
  trigger: AutomaticWorkflowTrigger,
): WorkflowStep[] {
  if (!workflow.enabled || workflow.trigger === "manual") {
    return [];
  }
  const processed = workflow.processedSessionIds.includes(sessionId);
  const rerunnable = () =>
    workflow.steps.filter((step) => stepDefinition(step).rerunsOnSummary);
  if (workflow.trigger === trigger) {
    return processed ? rerunnable() : workflow.steps;
  }
  if (
    trigger === "note_enhanced" &&
    workflow.trigger === "meeting_completed" &&
    processed
  ) {
    return rerunnable();
  }
  return [];
}

/**
 * Lance une automatisation sur une note précise, quel que soit son
 * déclencheur et son état. Met à jour la dernière exécution, mais pas la
 * liste des notes traitées : les déclencheurs automatiques restent inchangés.
 */
export async function runWorkflowOnNote(
  workflowId: string,
  sessionId: string,
): Promise<AutomationRunRecord> {
  return await enqueueWorkflowRun(async () => {
    await ensureLegacyAutomationsMigrated();
    const { values } = await getStoredSettingValues();
    const workflow = parseAutomationWorkflows(values.automation_workflows).find(
      (item) => item.id === workflowId,
    );
    if (!workflow) {
      throw new Error("automation not found");
    }
    return await runWorkflowSteps(sessionId, workflow, workflow.steps, {
      markProcessed: false,
    });
  });
}

let workflowQueue: Promise<unknown> = Promise.resolve();
function enqueueWorkflowRun<T>(run: () => Promise<T>): Promise<T> {
  const next = workflowQueue.then(run);
  workflowQueue = next.catch(() => {});
  return next;
}

let baseVariableLoader: BaseVariableLoader = async (sessionId, name) => {
  const { loadBaseVariable } = await import("./variables-loader");
  return await loadBaseVariable(sessionId, name);
};

/** Tests : remplace la lecture des variables de base dans la base locale. */
export function setBaseVariableLoaderForTests(loader: BaseVariableLoader) {
  baseVariableLoader = loader;
}

export type WorkflowTestResult = {
  status: AutomationRunRecord["status"];
  /** Une entrée par action, dans l'ordre d'exécution. */
  steps: StepOutcome[];
  durationMs: number;
};

/**
 * Teste une automatisation telle qu'elle est éditée, même non enregistrée,
 * sur une note existante. Rien n'est enregistré sur l'automatisation : ni la
 * dernière exécution, ni la liste des notes traitées. `simulate` lance les
 * étapes à effet réel à blanc (elles décrivent ce qu'elles feraient).
 */
export async function testWorkflowOnNote(
  workflow: AutomationWorkflow,
  sessionId: string,
  { simulate = false }: { simulate?: boolean } = {},
): Promise<WorkflowTestResult> {
  return await enqueueWorkflowRun(async () => {
    const started = Date.now();
    const steps = await executeWorkflowSteps(
      sessionId,
      workflow,
      workflow.steps,
      { dryRun: simulate },
    );
    return {
      status: steps.some((step) => step.status === "error")
        ? "error"
        : "success",
      steps,
      durationMs: Date.now() - started,
    };
  });
}

async function runWorkflowSteps(
  sessionId: string,
  workflow: AutomationWorkflow,
  steps: WorkflowStep[],
  { markProcessed }: { markProcessed: boolean },
): Promise<AutomationRunRecord> {
  const at = new Date().toISOString();
  let processed = false;
  const outcomes = await executeWorkflowSteps(sessionId, workflow, steps, {
    afterStep: async () => {
      if (markProcessed && !processed) {
        processed = true;
        await persistWorkflowResult(workflow.id, { sessionId });
      }
    },
  });
  const failed = outcomes.some((outcome) => outcome.status === "error");
  const detail = outcomes
    .filter((outcome) => outcome.status !== "skipped")
    .map((outcome) => outcome.detail)
    .filter(Boolean)
    .join(" · ");
  const record: AutomationRunRecord = {
    at,
    status: failed ? "error" : "success",
    detail: detail || (failed ? "" : "ok"),
  };
  await persistWorkflowResult(workflow.id, { record });
  return record;
}

/** Résultat d'une étape lancée par le moteur. */
export type StepOutcome = {
  stepId: string;
  /** « skipped » : non lancée, une étape précédente a échoué. */
  status: "success" | "error" | "skipped";
  /** Résumé lisible, ou message d'erreur. */
  detail: string;
  output?: string;
  artifact?: StepArtifact;
  /** Lancée à blanc : l'étape a décrit son effet sans agir. */
  simulated: boolean;
};

async function executeWorkflowSteps(
  sessionId: string,
  workflow: AutomationWorkflow,
  steps: WorkflowStep[],
  {
    dryRun = false,
    afterStep,
  }: { dryRun?: boolean; afterStep?: () => Promise<void> },
): Promise<StepOutcome[]> {
  const variables = createWorkflowVariables(sessionId, baseVariableLoader);
  const outcomes: StepOutcome[] = [];
  let failed = false;
  for (const step of steps) {
    // Une étape en échec arrête la suite : les suivantes dépendent peut-être
    // de sa sortie.
    if (failed) {
      outcomes.push({
        stepId: step.id,
        status: "skipped",
        detail: "",
        simulated: false,
      });
      continue;
    }
    const simulated = dryRun && stepDefinition(step).effect !== null;
    try {
      const result = await runWorkflowStep(step, {
        sessionId,
        workflowId: workflow.id,
        workflowTitle: workflow.title,
        variables,
        dryRun,
      });
      if (result.output !== undefined && stepDefinition(step).output) {
        variables.publish(step.id, result.output);
      }
      outcomes.push({
        stepId: step.id,
        status: "success",
        detail: result.detail,
        ...(result.output !== undefined ? { output: result.output } : {}),
        ...(result.artifact ? { artifact: result.artifact } : {}),
        simulated,
      });
      await afterStep?.();
    } catch (error) {
      failed = true;
      outcomes.push({
        stepId: step.id,
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
        simulated,
      });
      console.error("[automations] workflow failed", error);
    }
  }
  return outcomes;
}

async function persistWorkflowResult(
  workflowId: string,
  {
    record,
    sessionId,
  }: {
    record?: AutomationRunRecord;
    sessionId?: string;
  },
): Promise<void> {
  await mutateAutomationWorkflows((workflows) =>
    workflows.map((workflow) => {
      if (workflow.id !== workflowId) return workflow;
      return {
        ...workflow,
        lastRun: record ?? workflow.lastRun,
        processedSessionIds: sessionId
          ? appendProcessedSession(workflow.processedSessionIds, sessionId)
          : workflow.processedSessionIds,
      };
    }),
  );
}

function appendProcessedSession(
  processed: string[],
  sessionId: string,
): string[] {
  if (processed.includes(sessionId)) {
    return processed;
  }
  return [...processed, sessionId].slice(-MAX_PROCESSED_SESSIONS);
}
