import type { MarkdownExportOptions } from "@syntheo/plugin-local-api";

import {
  DEFAULT_MARKDOWN_EXPORT_OPTIONS,
  hasMarkdownExportContent,
  parseMarkdownExportOptions,
} from "./markdown-export";

import { id } from "~/shared/utils";

// Étapes d'une automatisation : une union discriminée par `type`. Chaque
// nouvelle action (issue 442) ajoute un membre à `WorkflowStep` et une entrée
// à `STEP_DEFINITIONS` ; le moteur, l'éditeur et les modèles suivent.

type StepBase = {
  id: string;
  /**
   * Nom choisi par l'utilisateur pour la sortie de l'étape, proposé aux
   * étapes suivantes. Absent : le nom par défaut du type d'étape.
   */
  outputName?: string;
};

export type MarkdownExportStep = StepBase & {
  type: "markdown_export";
  directory: string;
  options?: MarkdownExportOptions;
};

export type WorkflowStep = MarkdownExportStep;
export type WorkflowStepType = WorkflowStep["type"];
type StepOf<T extends WorkflowStepType> = Extract<WorkflowStep, { type: T }>;

/** Ce qu'une étape publie pour les suivantes : du texte ou un fichier. */
export type StepOutputKind = "text" | "file";

export type StepDefinition<T extends WorkflowStepType> = {
  type: T;
  create: (stepId: string) => StepOf<T>;
  parse: (record: Record<string, unknown>, stepId: string) => StepOf<T> | null;
  isReady: (step: StepOf<T>) => boolean;
  /** Sortie publiée sous un nom pour les étapes suivantes, ou rien. */
  output: StepOutputKind | null;
  /**
   * Étape sans effet cumulatif (elle réécrit le même fichier) : relancée
   * quand la synthèse est régénérée ou arrive après la fin de réunion.
   */
  rerunsOnSummary: boolean;
};

const markdownExport: StepDefinition<"markdown_export"> = {
  type: "markdown_export",
  create: (stepId) => ({
    id: stepId,
    type: "markdown_export",
    directory: "",
    options: { ...DEFAULT_MARKDOWN_EXPORT_OPTIONS },
  }),
  parse: (record, stepId) => ({
    id: stepId,
    type: "markdown_export",
    directory: typeof record.directory === "string" ? record.directory : "",
    ...(record.options !== undefined
      ? { options: parseMarkdownExportOptions(record.options) }
      : {}),
  }),
  isReady: (step) =>
    step.directory.trim().length > 0 &&
    hasMarkdownExportContent(step.options ?? DEFAULT_MARKDOWN_EXPORT_OPTIONS),
  output: "file",
  rerunsOnSummary: true,
};

export const STEP_DEFINITIONS: {
  [T in WorkflowStepType]: StepDefinition<T>;
} = {
  markdown_export: markdownExport,
};

export const WORKFLOW_STEP_TYPES = Object.keys(
  STEP_DEFINITIONS,
) as WorkflowStepType[];

/** Un type d'étape existe dans cette version de l'application. */
export function isStepTypeAvailable(type: string): type is WorkflowStepType {
  return Object.prototype.hasOwnProperty.call(STEP_DEFINITIONS, type);
}

export function stepDefinition<S extends WorkflowStep>(
  step: S,
): StepDefinition<S["type"]> {
  return STEP_DEFINITIONS[step.type] as unknown as StepDefinition<S["type"]>;
}

export function createWorkflowStep(type: WorkflowStepType): WorkflowStep {
  return STEP_DEFINITIONS[type].create(id());
}

export function isWorkflowStepReady(step: WorkflowStep): boolean {
  return stepDefinition(step).isReady(step);
}

/** Lit une étape enregistrée ; `null` pour un type inconnu (étape cloud). */
export function parseWorkflowStep(value: unknown): WorkflowStep | null {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as Record<string, unknown>).id !== "string"
  ) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== "string" || !isStepTypeAvailable(type)) {
    return null;
  }
  const step = STEP_DEFINITIONS[type].parse(record, record.id as string);
  if (!step) {
    return null;
  }
  return typeof record.outputName === "string" && record.outputName.trim()
    ? { ...step, outputName: record.outputName }
    : step;
}
