import { automationEditorButtons } from "./chat-prompt";
import {
  type AdvancedStepProposal,
  pendingProposals,
  proposeAdvancedStep,
} from "./chat-proposals";
import {
  isAdvancedStepType,
  type StepInput,
  stepFromInput,
  stepToInput,
  variableErrors,
} from "./chat-schema";
import { type AutomationSelection, useAutomationSelection } from "./selection";
import {
  isWorkflowStepReady,
  stepDefinition,
  type WorkflowStep,
} from "./steps";
import {
  type AutomationWorkflow,
  createEmptyWorkflow,
  isWorkflowReady,
  mutateAutomationWorkflows,
  parseAutomationWorkflows,
  type WorkflowTrigger,
} from "./workflows";

import { useChatContext } from "~/chat/state/chat-context";
import { getStoredSettingValues } from "~/settings/queries";
import { id } from "~/shared/utils";

// Le chat de l'éditeur construit l'automatisation ouverte, qui s'enregistre
// comme brouillon (désactivée) : l'éditeur la montre se construire en direct.
// Deux règles tenues ici, pas par la consigne du modèle :
// - une modification du chat ne l'active jamais, et désactive une
//   automatisation active, que l'utilisateur réactive lui-même ;
// - une étape avancée (webhook, commande) devient une proposition que
//   l'utilisateur confirme dans l'éditeur (voir chat-proposals.ts).

export type EditedWorkflowRef = { id?: string; chatGroupId?: string };

export function editedWorkflowRef(
  selection: AutomationSelection | null,
): EditedWorkflowRef | null {
  switch (selection?.kind) {
    case "workflow":
      return { id: selection.workflowId };
    case "draft":
      return { id: selection.draftId };
    case "chat":
      return { chatGroupId: selection.groupId };
    default:
      return null;
  }
}

function findWorkflow(
  workflows: AutomationWorkflow[],
  ref: EditedWorkflowRef,
): AutomationWorkflow | undefined {
  return workflows.find((workflow) =>
    ref.id ? workflow.id === ref.id : workflow.chatGroupId === ref.chatGroupId,
  );
}

function currentRef(): EditedWorkflowRef | null {
  return editedWorkflowRef(useAutomationSelection.getState().selection);
}

export async function loadEditedWorkflow(): Promise<AutomationWorkflow | null> {
  const ref = currentRef();
  if (!ref) {
    return null;
  }
  const { values } = await getStoredSettingValues();
  return (
    findWorkflow(parseAutomationWorkflows(values.automation_workflows), ref) ??
    createEmptyWorkflow({ id: ref.id, chatGroupId: ref.chatGroupId ?? null })
  );
}

export const NO_OPEN_AUTOMATION =
  "No automation is open in the editor. Call create_automation first.";

/** Ce que le modèle lit de l'automatisation, dans la forme qu'il écrit. */
export function describeWorkflow(workflow: AutomationWorkflow) {
  return {
    name: workflow.title,
    trigger: workflow.trigger,
    enabled: workflow.enabled,
    ready: isWorkflowReady(workflow),
    steps: workflow.steps.map((step, index) => ({
      number: index + 2,
      ...stepToInput(step),
      ready: isWorkflowStepReady(step),
      result: stepDefinition(step).output ? `{{step:${step.id}}}` : null,
    })),
    waiting_for_user_confirmation: pendingProposals(workflow.id).map(
      (proposal) => ({
        type: proposal.step.type,
        number: proposal.index + 2,
        ...(proposal.replacesStepId
          ? { replaces_step: proposal.replacesStepId }
          : {}),
      }),
    ),
  };
}

export type ChatEditOutcome =
  | {
      status: "ok";
      automation: ReturnType<typeof describeWorkflow>;
      message: string;
    }
  | { status: "error"; message: string };

type Plan = {
  steps: WorkflowStep[];
  proposals: Array<Omit<AdvancedStepProposal, "id" | "workflowId">>;
};

/** Insère des étapes : les avancées deviennent des propositions. */
export function planInsert(
  existing: WorkflowStep[],
  inputs: StepInput[],
  index: number,
): Plan | string {
  const taken = new Set(existing.map((step) => step.id));
  const built: WorkflowStep[] = [];
  for (const input of inputs) {
    if (input.id && taken.has(input.id)) {
      return `Step id ${input.id} is already used. Pick another id.`;
    }
    const stepId = input.id ?? id();
    taken.add(stepId);
    built.push(stepFromInput(input, stepId));
  }
  const at = Math.max(0, Math.min(index, existing.length));
  const full = [...existing.slice(0, at), ...built, ...existing.slice(at)];
  const errors = variableErrors(full);
  if (errors.length > 0) {
    return errors.join(" ");
  }
  return {
    steps: full.filter(
      (step) => !isAdvancedStepType(step.type) || existing.includes(step),
    ),
    proposals: full.flatMap((step, position) =>
      built.includes(step) && isAdvancedStepType(step.type)
        ? [{ step, index: position }]
        : [],
    ),
  };
}

/** Remplace une étape ; une étape avancée attend la confirmation. */
export function planReplace(
  existing: WorkflowStep[],
  stepId: string,
  input: StepInput,
): Plan | string {
  const index = existing.findIndex((step) => step.id === stepId);
  if (index < 0) {
    return unknownStep(stepId);
  }
  const step = stepFromInput(input, stepId);
  const full = existing.map((item) => (item.id === stepId ? step : item));
  const errors = variableErrors(full);
  if (errors.length > 0) {
    return errors.join(" ");
  }
  return isAdvancedStepType(step.type)
    ? { steps: existing, proposals: [{ step, index, replacesStepId: stepId }] }
    : { steps: full, proposals: [] };
}

export function planMove(
  existing: WorkflowStep[],
  stepId: string,
  index: number,
): Plan | string {
  const from = existing.findIndex((step) => step.id === stepId);
  if (from < 0) {
    return unknownStep(stepId);
  }
  const steps = existing.filter((step) => step.id !== stepId);
  steps.splice(Math.max(0, Math.min(index, steps.length)), 0, existing[from]!);
  const errors = variableErrors(steps);
  return errors.length > 0
    ? `This order breaks a reused result. ${errors.join(" ")}`
    : { steps, proposals: [] };
}

function unknownStep(stepId: string): string {
  return `No step with id ${stepId}. Call get_automation to read the step ids.`;
}

/** Numéro affiché dans l'éditeur (2 = première action) vers un index. */
export function positionToIndex(
  position: number | undefined,
  length: number,
): number {
  return position === undefined ? length : Math.max(0, position - 2);
}

type WorkflowChange = {
  title?: string;
  trigger?: WorkflowTrigger;
  plan?: (steps: WorkflowStep[]) => Plan | string;
};

// Libellés traduits des boutons de l'éditeur (issue 529), lus au moment de
// l'appel : la réponse du chat cite le bouton que l'utilisateur voit.
function savedAsDraft(): string {
  return `The editor shows the change. The automation stays a disabled draft: only the user saves and enables it with ${automationEditorButtons().saveAndEnable}.`;
}

function advancedStepsProposed(): string {
  const { addStep, applyChange, decline } = automationEditorButtons();
  return `Advanced steps (webhook, command) were NOT added: the editor shows a proposal card and the user decides. Tell the user to click ${addStep} on that card (${applyChange} when it changes an existing step), or ${decline}; never say it was added.`;
}

/** Applique une modification du chat à l'automatisation ouverte. */
export async function changeEditedWorkflow(
  change: WorkflowChange,
): Promise<ChatEditOutcome> {
  const ref = currentRef();
  if (!ref) {
    return { status: "error", message: NO_OPEN_AUTOMATION };
  }
  let outcome: ChatEditOutcome = { status: "error", message: "Not saved." };
  await mutateAutomationWorkflows((workflows) => {
    const existing = findWorkflow(workflows, ref);
    const workflow =
      existing ??
      createEmptyWorkflow({ id: ref.id, chatGroupId: ref.chatGroupId ?? null });
    const plan = change.plan ? change.plan(workflow.steps) : null;
    if (typeof plan === "string") {
      outcome = { status: "error", message: plan };
      return workflows;
    }
    const next: AutomationWorkflow = {
      ...workflow,
      title: change.title ?? workflow.title,
      trigger: change.trigger ?? workflow.trigger,
      steps: plan ? plan.steps : workflow.steps,
      // Jamais activée par le chat ; une automatisation active repasse en brouillon.
      enabled: false,
    };
    for (const proposal of plan?.proposals ?? []) {
      proposeAdvancedStep({ ...proposal, workflowId: next.id });
    }
    const notes = [savedAsDraft()];
    if (workflow.enabled && workflow.trigger !== "manual") {
      notes.push(
        "It was enabled, so it is now disabled until the user enables it again.",
      );
    }
    if (plan && plan.proposals.length > 0) {
      notes.push(advancedStepsProposed());
    }
    outcome = {
      status: "ok",
      automation: describeWorkflow(next),
      message: notes.join(" "),
    };
    return existing
      ? workflows.map((item) => (item.id === next.id ? next : item))
      : [next, ...workflows];
  });
  return outcome;
}

/**
 * Crée l'automatisation demandée. Une automatisation ouverte et vide est
 * remplie ; sans automatisation ouverte, une nouvelle s'ouvre dans l'éditeur,
 * rattachée au fil du chat en cours.
 */
export async function createWorkflowFromChat(input: {
  name?: string;
  trigger: WorkflowTrigger;
  steps: StepInput[];
}): Promise<ChatEditOutcome> {
  const open = await loadEditedWorkflow();
  if (open && open.steps.length > 0) {
    return {
      status: "error",
      message:
        "The automation open in the editor already has steps. Change it with the step tools, or ask the user to create a new automation first.",
    };
  }
  if (!open) {
    const plan = planInsert([], input.steps, 0);
    if (typeof plan === "string") {
      return { status: "error", message: plan };
    }
    const workflow = createEmptyWorkflow({
      chatGroupId:
        useChatContext.getState().chatByScope.automations.groupId ?? null,
    });
    await mutateAutomationWorkflows((workflows) => [workflow, ...workflows]);
    useAutomationSelection.getState().adoptWorkflow(workflow.id);
  }
  return changeEditedWorkflow({
    title: input.name?.trim() || undefined,
    trigger: input.trigger,
    plan: () => planInsert([], input.steps, 0),
  });
}
