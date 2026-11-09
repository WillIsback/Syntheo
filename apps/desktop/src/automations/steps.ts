import type { MarkdownExportOptions } from "@syntheo/plugin-local-api";

import {
  DEFAULT_MARKDOWN_EXPORT_OPTIONS,
  hasMarkdownExportContent,
  parseMarkdownExportOptions,
} from "./markdown-export";
import {
  DEFAULT_WEBHOOK_BODY,
  isWebhookBodyTemplateValid,
  parseWebhookUrl,
} from "./webhook";

import { id } from "~/shared/utils";

// Étapes d'une automatisation : une union discriminée par `type`. Chaque
// action ajoute un membre à `WorkflowStep` et une entrée à
// `STEP_DEFINITIONS` ; le moteur, l'éditeur et les modèles suivent.

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

export type GenerateTextStep = StepBase & {
  type: "generate_text";
  /** Consigne envoyée au modèle local, avec variables. */
  prompt: string;
};

export type VaultWriteMode = "create" | "append";

export type VaultWriteStep = StepBase & {
  type: "vault_write";
  /** Dossier du coffre (vide : à la racine), avec variables. */
  folder: string;
  title: string;
  content: string;
  /** Nouvelle note, ou ajout à la note du même titre dans ce dossier. */
  mode: VaultWriteMode;
};

export type ClipboardStep = StepBase & {
  type: "clipboard";
  content: string;
};

export type NotificationStep = StepBase & {
  type: "notification";
  title: string;
  message: string;
};

export type WebhookStep = StepBase & {
  type: "webhook";
  url: string;
  /** Corps JSON ; les variables y sont insérées comme texte JSON échappé. */
  body: string;
};

export type CommandStep = StepBase & {
  type: "command";
  /** Programme lancé sans interpréteur de commandes. */
  program: string;
  /** Un argument par entrée, avec variables (chemin du fichier exporté…). */
  args: string[];
};

export type WorkflowStep =
  | MarkdownExportStep
  | GenerateTextStep
  | VaultWriteStep
  | ClipboardStep
  | NotificationStep
  | WebhookStep
  | CommandStep;
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
  /** Rangée sous « Avancé » dans le menu « Ajouter une étape ». */
  advanced: boolean;
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
  advanced: false,
};

const str = (record: Record<string, unknown>, key: string): string =>
  typeof record[key] === "string" ? record[key] : "";

const filled = (value: string) => value.trim().length > 0;

const generateText: StepDefinition<"generate_text"> = {
  type: "generate_text",
  create: (stepId) => ({ id: stepId, type: "generate_text", prompt: "" }),
  parse: (record, stepId) => ({
    id: stepId,
    type: "generate_text",
    prompt: str(record, "prompt"),
  }),
  isReady: (step) => filled(step.prompt),
  output: "text",
  rerunsOnSummary: false,
  advanced: false,
};

const vaultWrite: StepDefinition<"vault_write"> = {
  type: "vault_write",
  create: (stepId) => ({
    id: stepId,
    type: "vault_write",
    folder: "",
    title: "",
    content: "",
    mode: "create",
  }),
  parse: (record, stepId) => ({
    id: stepId,
    type: "vault_write",
    folder: str(record, "folder"),
    title: str(record, "title"),
    content: str(record, "content"),
    mode: record.mode === "append" ? "append" : "create",
  }),
  isReady: (step) => filled(step.title) && filled(step.content),
  output: null,
  rerunsOnSummary: false,
  advanced: false,
};

const clipboard: StepDefinition<"clipboard"> = {
  type: "clipboard",
  create: (stepId) => ({ id: stepId, type: "clipboard", content: "" }),
  parse: (record, stepId) => ({
    id: stepId,
    type: "clipboard",
    content: str(record, "content"),
  }),
  isReady: (step) => filled(step.content),
  output: null,
  rerunsOnSummary: false,
  advanced: false,
};

const notification: StepDefinition<"notification"> = {
  type: "notification",
  create: (stepId) => ({
    id: stepId,
    type: "notification",
    title: "",
    message: "",
  }),
  parse: (record, stepId) => ({
    id: stepId,
    type: "notification",
    title: str(record, "title"),
    message: str(record, "message"),
  }),
  isReady: (step) => filled(step.title) || filled(step.message),
  output: null,
  rerunsOnSummary: false,
  advanced: false,
};

const webhook: StepDefinition<"webhook"> = {
  type: "webhook",
  create: (stepId) => ({
    id: stepId,
    type: "webhook",
    url: "",
    body: DEFAULT_WEBHOOK_BODY,
  }),
  parse: (record, stepId) => ({
    id: stepId,
    type: "webhook",
    url: str(record, "url"),
    body: str(record, "body"),
  }),
  isReady: (step) =>
    parseWebhookUrl(step.url) !== null && isWebhookBodyTemplateValid(step.body),
  output: null,
  rerunsOnSummary: false,
  advanced: true,
};

const command: StepDefinition<"command"> = {
  type: "command",
  create: (stepId) => ({ id: stepId, type: "command", program: "", args: [] }),
  parse: (record, stepId) => ({
    id: stepId,
    type: "command",
    program: str(record, "program"),
    args: Array.isArray(record.args)
      ? record.args.filter((arg): arg is string => typeof arg === "string")
      : [],
  }),
  isReady: (step) => filled(step.program),
  output: "text",
  rerunsOnSummary: false,
  advanced: true,
};

export const STEP_DEFINITIONS: {
  [T in WorkflowStepType]: StepDefinition<T>;
} = {
  markdown_export: markdownExport,
  generate_text: generateText,
  vault_write: vaultWrite,
  clipboard,
  notification,
  webhook,
  command,
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
