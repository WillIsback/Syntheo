import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

import type { StepOutputKind, WorkflowStepType } from "./steps";
import type { TemplateTexts } from "./templates";
import type { AvailableVariable, BaseVariable } from "./variables";
import type { AutomationWorkflow, WorkflowTrigger } from "./workflows";

// Libellés traduits des automatisations, partagés par la page, l'éditeur, la
// barre latérale et les points de lancement depuis une note.

export type AutomationLabels = {
  trigger: Record<WorkflowTrigger, { short: string; long: string }>;
  step: Record<WorkflowStepType, { title: string; description: string }>;
  variable: Record<BaseVariable, string>;
  output: Record<StepOutputKind, string>;
  /** Nom par défaut de la sortie, quand il dépend du type d'étape. */
  stepOutput: Partial<Record<WorkflowStepType, string>>;
  template: Record<
    string,
    { title: string; description: string; texts?: TemplateTexts }
  >;
  untitled: string;
};

export function useAutomationLabels(): AutomationLabels {
  const { t } = useLingui();
  return useMemo(
    () => ({
      trigger: {
        meeting_completed: {
          short: t`Meeting ends`,
          long: t`When the meeting ends`,
        },
        note_enhanced: {
          short: t`Meeting summary ready`,
          long: t`When the meeting summary is ready`,
        },
        manual: {
          short: t`Launched by hand`,
          long: t`When you launch it from a note`,
        },
      },
      step: {
        markdown_export: {
          title: t`Export as Markdown`,
          description: t`Writes the note to a folder on your computer.`,
        },
        generate_text: {
          title: t`Generate with the local model`,
          description: t`Applies an instruction (tasks, short summary, follow-up message); the result feeds the next steps.`,
        },
        vault_write: {
          title: t`Write to the vault`,
          description: t`Creates or completes a note in the vault.`,
        },
        clipboard: {
          title: t`Copy to the clipboard`,
          description: t`Ready to paste into a message or a document.`,
        },
        notification: {
          title: t`System notification`,
          description: t`Lets you know when the automation has finished.`,
        },
        webhook: {
          title: t`Send to an address (webhook)`,
          description: t`JSON to n8n, Home Assistant or a home server. The only step that leaves your computer.`,
        },
        command: {
          title: t`Run a command`,
          description: t`Local script with the path of the exported file. Asks for confirmation the first time.`,
        },
      },
      variable: {
        summary: t({ message: "Summary", context: "automation variable" }),
        notes: t({ message: "Notes", context: "automation variable" }),
        transcript: t({
          message: "Transcript",
          context: "automation variable",
        }),
        title: t({ message: "Title", context: "automation variable" }),
        date: t({ message: "Date", context: "automation variable" }),
      },
      output: {
        file: t`Exported file`,
        text: t`Generated text`,
      },
      stepOutput: {
        command: t`Command output`,
      },
      template: {
        "markdown-export": {
          title: t`Export as Markdown`,
          description: t`Every finished meeting is saved as a Markdown file in a folder.`,
        },
        "extract-tasks": {
          title: t`Extract tasks`,
          description: t`The local model lists the actions to take and adds them to the vault.`,
          texts: {
            prompt: t`List the action items decided during the meeting, one per line, with the person responsible. Meeting summary:`,
            noteTitle: t({ message: "Tasks –", context: "vault note title" }),
            folder: t({ message: "Tasks", context: "vault folder" }),
          },
        },
      },
      untitled: t`Untitled automation`,
    }),
    [t],
  );
}

export function workflowTitle(
  workflow: Pick<AutomationWorkflow, "title" | "templateId">,
  labels: AutomationLabels,
): string {
  return (
    workflow.title.trim() ||
    (workflow.templateId
      ? labels.template[workflow.templateId]?.title
      : undefined) ||
    labels.untitled
  );
}

/** « Fin de réunion → Exporter en Markdown » : le déclencheur puis les actions. */
export function workflowChain(
  workflow: Pick<AutomationWorkflow, "trigger" | "steps">,
  labels: AutomationLabels,
): string {
  return [
    labels.trigger[workflow.trigger].short,
    ...workflow.steps.map((step) => labels.step[step.type].title),
  ].join(" → ");
}

export function variableLabel(
  variable: AvailableVariable,
  labels: AutomationLabels,
): string {
  if (variable.kind === "base") {
    return labels.variable[variable.name];
  }
  return (
    variable.outputName?.trim() ||
    defaultOutputName(variable.stepType, variable.outputKind, labels)
  );
}

export function defaultOutputName(
  stepType: WorkflowStepType,
  kind: StepOutputKind,
  labels: AutomationLabels,
): string {
  return labels.stepOutput[stepType] ?? labels.output[kind];
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** « il y a 20 heures », « hier » : date relative dans une langue donnée. */
export function formatRelativeTime(
  at: string | Date,
  locale: string,
  now: number = Date.now(),
): string {
  const seconds = Math.round((new Date(at).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return format.format(0, "minute");
}

/** Date relative dans la langue active de l'interface. */
export function useRelativeTime(): (at: string | Date) => string {
  const { i18n } = useLingui();
  return (at) => formatRelativeTime(at, i18n.locale);
}
