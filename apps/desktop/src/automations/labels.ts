import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

import type { StepOutputKind, WorkflowStepType } from "./steps";
import type { AvailableVariable, BaseVariable } from "./variables";
import type { AutomationWorkflow, WorkflowTrigger } from "./workflows";

// Libellés traduits des automatisations, partagés par la page, l'éditeur, la
// barre latérale et les points de lancement depuis une note.

export type AutomationLabels = {
  trigger: Record<WorkflowTrigger, { short: string; long: string }>;
  step: Record<WorkflowStepType, { title: string; description: string }>;
  variable: Record<BaseVariable, string>;
  output: Record<StepOutputKind, string>;
  template: Record<string, { title: string; description: string }>;
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
      template: {
        "markdown-export": {
          title: t`Export as Markdown`,
          description: t`Every finished meeting is saved as a Markdown file in a folder.`,
        },
        "extract-tasks": {
          title: t`Extract tasks`,
          description: t`The local model lists the actions to take and adds them to the vault.`,
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
  return variable.outputName?.trim() || labels.output[variable.outputKind];
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
