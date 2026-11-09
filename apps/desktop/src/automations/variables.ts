import { stepDefinition, type StepOutputKind } from "./steps";
import type { AutomationWorkflow } from "./workflows";

// Sorties réutilisables. Dès l'étape 1, toute étape peut lire les variables de
// base de la note ; une étape qui produit un texte ou un fichier le publie
// ensuite pour les étapes suivantes. Dans un champ, une variable s'écrit
// `{{summary}}` (base) ou `{{step:<id de l'étape>}}` (sortie d'une étape) :
// l'identifiant ne change pas quand l'utilisateur renomme la sortie.

export const BASE_VARIABLES = [
  "summary",
  "notes",
  "transcript",
  "title",
  "date",
] as const;
export type BaseVariable = (typeof BASE_VARIABLES)[number];

export type VariableRef =
  | { kind: "base"; name: BaseVariable }
  | { kind: "output"; stepId: string };

/** Variable proposée à une étape, avec ce qu'il faut pour l'afficher. */
export type AvailableVariable =
  | { kind: "base"; name: BaseVariable; token: string }
  | {
      kind: "output";
      stepId: string;
      /** Numéro d'étape affiché (déclencheur = 1, première action = 2). */
      stepNumber: number;
      outputKind: StepOutputKind;
      outputName: string | undefined;
      token: string;
    };

export type BaseVariableLoader = (
  sessionId: string,
  name: BaseVariable,
) => Promise<string>;

export function variableToken(ref: VariableRef): string {
  return ref.kind === "base" ? `{{${ref.name}}}` : `{{step:${ref.stepId}}}`;
}

const TOKEN_PATTERN = /\{\{\s*(step:[\w-]+|[a-z_]+)\s*\}\}/g;

function parseToken(raw: string): VariableRef | null {
  if (raw.startsWith("step:")) {
    return { kind: "output", stepId: raw.slice("step:".length) };
  }
  const name = BASE_VARIABLES.find((item) => item === raw);
  return name ? { kind: "base", name } : null;
}

export function parseVariableTokens(text: string): VariableRef[] {
  return Array.from(text.matchAll(TOKEN_PATTERN)).flatMap((match) => {
    const ref = parseToken(match[1]!);
    return ref ? [ref] : [];
  });
}

/**
 * Variables qu'une action peut insérer : les variables de base, puis les
 * sorties des actions placées avant elle. `actionIndex` est l'index de
 * l'action dans `workflow.steps` (0 pour l'étape 2).
 */
export function availableVariables(
  workflow: Pick<AutomationWorkflow, "steps">,
  actionIndex: number,
): AvailableVariable[] {
  const base = BASE_VARIABLES.map((name) => ({
    kind: "base" as const,
    name,
    token: variableToken({ kind: "base", name }),
  }));
  const outputs = workflow.steps
    .slice(0, Math.max(0, actionIndex))
    .flatMap((step, index) => {
      const outputKind = stepDefinition(step).output;
      return outputKind
        ? [
            {
              kind: "output" as const,
              stepId: step.id,
              stepNumber: index + 2,
              outputKind,
              outputName: step.outputName,
              token: variableToken({ kind: "output", stepId: step.id }),
            },
          ]
        : [];
    });
  return [...base, ...outputs];
}

/**
 * Valeurs d'une exécution : variables de base chargées à la demande (une
 * seule fois chacune) et sorties publiées par les étapes déjà passées.
 */
export type WorkflowVariables = {
  get: (ref: VariableRef) => Promise<string | undefined>;
  publish: (stepId: string, value: string) => void;
  render: (text: string) => Promise<string>;
};

export function createWorkflowVariables(
  sessionId: string,
  loadBase: BaseVariableLoader,
): WorkflowVariables {
  const base = new Map<BaseVariable, Promise<string>>();
  const outputs = new Map<string, string>();

  const get = async (ref: VariableRef) => {
    if (ref.kind === "output") {
      return outputs.get(ref.stepId);
    }
    let value = base.get(ref.name);
    if (!value) {
      value = loadBase(sessionId, ref.name);
      base.set(ref.name, value);
    }
    return await value;
  };

  return {
    get,
    publish: (stepId, value) => {
      outputs.set(stepId, value);
    },
    // Une variable inconnue, ou une sortie pas encore produite, reste écrite
    // telle quelle : l'erreur se voit dans le résultat au lieu d'un vide.
    render: async (text) => {
      const matches = Array.from(text.matchAll(TOKEN_PATTERN));
      const values = await Promise.all(
        matches.map(async (match) => {
          const ref = parseToken(match[1]!);
          return ref ? await get(ref) : undefined;
        }),
      );
      let index = 0;
      return text.replace(TOKEN_PATTERN, (token) => values[index++] ?? token);
    },
  };
}
