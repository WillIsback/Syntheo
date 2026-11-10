import {
  createWorkflowStep,
  isStepTypeAvailable,
  type WorkflowStep,
} from "./steps";
import { variableToken } from "./variables";
import {
  type AutomationWorkflow,
  createEmptyWorkflow,
  type WorkflowTrigger,
} from "./workflows";

// « Partir d'un modèle » : un modèle n'est qu'un gabarit qui crée une
// automatisation ordinaire, modifiable ensuite dans le même éditeur.

/** Textes traduits que le modèle place dans les étapes qu'il crée. */
export type TemplateTexts = {
  prompt?: string;
  noteTitle?: string;
  folder?: string;
};

export type AutomationTemplate = {
  id: string;
  trigger: WorkflowTrigger;
  /** Types d'étape, dans l'ordre ; un type absent de l'app masque le modèle. */
  stepTypes: readonly string[];
  /** Préremplit les étapes créées pour que l'automatisation soit prête. */
  configure?: (steps: WorkflowStep[], texts: TemplateTexts) => WorkflowStep[];
};

export const AUTOMATION_TEMPLATES: readonly AutomationTemplate[] = [
  {
    id: "markdown-export",
    trigger: "meeting_completed",
    stepTypes: ["markdown_export"],
  },
  // Synthèse prête → le modèle local liste les tâches → une note du coffre.
  {
    id: "extract-tasks",
    trigger: "note_enhanced",
    stepTypes: ["generate_text", "vault_write"],
    configure: (steps, texts) => {
      const generate = steps.find((step) => step.type === "generate_text");
      return steps.map((step) => {
        if (step.type === "generate_text") {
          return {
            ...step,
            prompt:
              `${texts.prompt ?? ""}\n\n${variableToken({ kind: "base", name: "summary" })}`.trim(),
          };
        }
        if (step.type === "vault_write" && generate) {
          return {
            ...step,
            folder: texts.folder ?? "",
            title:
              `${texts.noteTitle ?? ""} ${variableToken({ kind: "base", name: "title" })}`.trim(),
            content: variableToken({ kind: "output", stepId: generate.id }),
            mode: "create",
          };
        }
        return step;
      });
    },
  },
];

function isTemplateAvailable(template: AutomationTemplate): boolean {
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
  texts: TemplateTexts = {},
): AutomationWorkflow | null {
  if (!isTemplateAvailable(template)) {
    return null;
  }
  const created: WorkflowStep[] = template.stepTypes.flatMap((type) =>
    isStepTypeAvailable(type) ? [createWorkflowStep(type)] : [],
  );
  const steps = template.configure
    ? template.configure(created, texts)
    : created;
  return createEmptyWorkflow({
    title,
    templateId: template.id,
    trigger: template.trigger,
    steps,
  });
}
