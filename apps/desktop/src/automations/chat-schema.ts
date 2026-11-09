import { z } from "zod";

import { DEFAULT_MARKDOWN_EXPORT_OPTIONS } from "./markdown-export";
import {
  parseWorkflowStep,
  STEP_DEFINITIONS,
  type WorkflowStep,
  type WorkflowStepType,
} from "./steps";
import { BASE_VARIABLES, danglingOutputRefs, stepTexts } from "./variables";

// Ce que le chat de l'éditeur peut écrire dans une étape : un schéma strict par
// type du registre (`STEP_DEFINITIONS`). Le type `satisfies` oblige à décrire
// chaque nouvelle action ; un champ inconnu ou un type absent est refusé.

/** Identifiant choisi par le modèle pour citer la sortie d'une étape. */
export const STEP_ID_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/;

const stepId = z
  .string()
  .regex(STEP_ID_PATTERN)
  .describe(
    "Short id for this step (lowercase letters, digits, - or _), e.g. tasks. Later steps insert its result with {{step:<id>}}. Omit for steps whose result is not reused.",
  );
const outputName = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .describe("Name shown to the user for this step's result, e.g. Tasks.");
const field = (description: string) =>
  z.string().max(20_000).describe(description);
const required = (description: string) =>
  z.string().trim().min(1).max(20_000).describe(description);

const base = { id: stepId.optional(), outputName: outputName.optional() };

export const STEP_INPUT_SCHEMAS = {
  markdown_export: z.strictObject({
    type: z.literal("markdown_export"),
    ...base,
    directory: field(
      "Folder on the user's computer. Leave it out unless the user gave the exact path; they pick it in the editor.",
    ).optional(),
    include_memo: z.boolean().optional(),
    include_summary: z.boolean().optional(),
    include_transcript: z.boolean().optional(),
    include_action_items: z.boolean().optional(),
  }),
  generate_text: z.strictObject({
    type: z.literal("generate_text"),
    ...base,
    prompt: required(
      "Instruction for the local model, with the variables it needs, e.g. List the tasks in this summary: {{summary}}",
    ),
  }),
  vault_write: z.strictObject({
    type: z.literal("vault_write"),
    ...base,
    folder: field("Vault folder; empty for the vault root.").optional(),
    title: required("Title of the vault note, e.g. Tasks – {{title}}"),
    content: required("Content of the note, e.g. {{step:tasks}}"),
    mode: z
      .enum(["create", "append"])
      .optional()
      .describe(
        "create a new note (default) or append to the note with the same title.",
      ),
  }),
  clipboard: z.strictObject({
    type: z.literal("clipboard"),
    ...base,
    content: required("Text copied to the clipboard."),
  }),
  notification: z
    .strictObject({
      type: z.literal("notification"),
      ...base,
      title: field("Notification title.").optional(),
      message: field("Notification text.").optional(),
    })
    .refine((step) => Boolean(step.title?.trim() || step.message?.trim()), {
      message: "A notification needs a title or a message.",
    }),
  webhook: z.strictObject({
    type: z.literal("webhook"),
    ...base,
    url: required("http or https address given by the user. Never invent one."),
    body: field(
      'JSON body with variables, e.g. {"summary": "{{summary}}"}. Omit for the default body.',
    ).optional(),
  }),
  command: z.strictObject({
    type: z.literal("command"),
    ...base,
    program: required("Program or script path given by the user."),
    args: z
      .array(z.string().max(2_000))
      .max(32)
      .optional()
      .describe("One argument per entry, with variables."),
  }),
} satisfies { [T in WorkflowStepType]: z.ZodType<{ type: T }> };

export const stepInputSchema = z.discriminatedUnion("type", [
  STEP_INPUT_SCHEMAS.markdown_export,
  STEP_INPUT_SCHEMAS.generate_text,
  STEP_INPUT_SCHEMAS.vault_write,
  STEP_INPUT_SCHEMAS.clipboard,
  STEP_INPUT_SCHEMAS.notification,
  STEP_INPUT_SCHEMAS.webhook,
  STEP_INPUT_SCHEMAS.command,
]);
export type StepInput = z.infer<typeof stepInputSchema>;

export const triggerSchema = z
  .enum(["note_enhanced", "meeting_completed", "manual"])
  .describe(
    "note_enhanced: when the meeting summary is ready; meeting_completed: when the meeting ends; manual: launched by hand from a note.",
  );

/** Une étape du registre construite depuis la saisie du modèle. */
export function stepFromInput(input: StepInput, id: string): WorkflowStep {
  const created = STEP_DEFINITIONS[input.type].create(id);
  const { id: _id, outputName: name, type: _type, ...fields } = input;
  const record: Record<string, unknown> = { ...created, ...fields, id };
  if (input.type === "markdown_export") {
    const options: Record<string, unknown> = {
      ...DEFAULT_MARKDOWN_EXPORT_OPTIONS,
    };
    for (const key of [
      "include_memo",
      "include_summary",
      "include_transcript",
      "include_action_items",
    ] as const) {
      delete record[key];
      if (input[key] !== undefined) {
        options[key] = input[key];
      }
    }
    record.options = options;
  }
  if (name) {
    record.outputName = name;
  }
  // Repasse par le lecteur du registre : mêmes valeurs par défaut qu'au chargement.
  const step = parseWorkflowStep(record);
  if (!step) {
    throw new Error(`Unknown step type: ${String(input.type)}`);
  }
  return step;
}

/** Une étape, dans la forme que le modèle écrit (pour `get_automation`). */
export function stepToInput(step: WorkflowStep): Record<string, unknown> {
  const { options, ...rest } =
    step.type === "markdown_export" ? step : { ...step, options: undefined };
  return {
    ...rest,
    ...(step.type === "markdown_export"
      ? {
          include_memo: options?.include_memo,
          include_summary: options?.include_summary,
          include_transcript: options?.include_transcript,
          include_action_items: options?.include_action_items,
        }
      : {}),
  };
}

const ANY_TOKEN = /\{\{\s*([^{}]*?)\s*\}\}/g;

/**
 * Erreurs de variables d'une liste d'étapes : variable de base inconnue,
 * sortie d'une étape absente, placée après, ou qui ne produit rien.
 */
export function variableErrors(steps: WorkflowStep[]): string[] {
  const unknown = steps.flatMap((step) =>
    stepTexts(step).flatMap((text) =>
      Array.from(text.matchAll(ANY_TOKEN)).flatMap((match) => {
        const name = match[1]!;
        if (/^step:[\w-]+$/.test(name)) return [];
        return (BASE_VARIABLES as readonly string[]).includes(name)
          ? []
          : [
              `Unknown variable {{${name}}} in step ${step.id}. Use ${BASE_VARIABLES.map((item) => `{{${item}}}`).join(", ")} or {{step:<id>}}.`,
            ];
      }),
    ),
  );
  const dangling = danglingOutputRefs({ steps }).map(
    ({ stepId, missingStepId }) =>
      `Step ${stepId} uses {{step:${missingStepId}}}, but no earlier step with id ${missingStepId} produces a result.`,
  );
  return [...unknown, ...dangling];
}

/** Les étapes avancées (webhook, commande) : jamais sans confirmation. */
export function isAdvancedStepType(type: WorkflowStepType): boolean {
  return STEP_DEFINITIONS[type].advanced;
}
