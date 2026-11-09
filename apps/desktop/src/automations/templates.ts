import {
  createWorkflowStep,
  isStepTypeAvailable,
  type WorkflowStep,
} from "./steps";
import {
  type AutomationWorkflow,
  createEmptyWorkflow,
  type WorkflowTrigger,
} from "./workflows";

// « Partir d'un modèle » : un modèle n'est qu'un gabarit qui crée une
// automatisation ordinaire, modifiable ensuite dans le même éditeur.

export type AutomationTemplate = {
  id: string;
  trigger: WorkflowTrigger;
  /** Types d'étape, dans l'ordre ; un type absent de l'app masque le modèle. */
  stepTypes: readonly string[];
};

export const AUTOMATION_TEMPLATES: readonly AutomationTemplate[] = [
  {
    id: "markdown-export",
    trigger: "meeting_completed",
    stepTypes: ["markdown_export"],
  },
  // Dépend des actions « Générer avec le modèle local » et « Écrire dans le
  // coffre » (issue 442) : déclaré ici, proposé dès qu'elles existent.
  {
    id: "extract-tasks",
    trigger: "note_enhanced",
    stepTypes: ["generate_text", "vault_write"],
  },
];

export function isTemplateAvailable(template: AutomationTemplate): boolean {
  return template.stepTypes.every(isStepTypeAvailable);
}

export function availableTemplates(
  templates: readonly AutomationTemplate[] = AUTOMATION_TEMPLATES,
): AutomationTemplate[] {
  return templates.filter(isTemplateAvailable);
}

/** L'automatisation créée par un modèle, désactivée tant qu'elle n'est pas réglée. */
export function createWorkflowFromTemplate(
  template: AutomationTemplate,
  title: string,
): AutomationWorkflow | null {
  if (!isTemplateAvailable(template)) {
    return null;
  }
  const steps: WorkflowStep[] = template.stepTypes.flatMap((type) =>
    isStepTypeAvailable(type) ? [createWorkflowStep(type)] : [],
  );
  return createEmptyWorkflow({
    title,
    templateId: template.id,
    trigger: template.trigger,
    steps,
  });
}
