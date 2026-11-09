import { t } from "@lingui/core/macro";
import { generateText, type LanguageModel, Output } from "ai";
import { z } from "zod";

// Génération structurée fiable avec un serveur compatible OpenAI (issue 530).
//
// Premier essai : sortie structurée du SDK (`response_format: json_schema`).
// S'il échoue faute de réponse exploitable (aucun texte, par exemple quand le
// raisonnement a consommé tout le budget, JSON invalide, schéma non respecté
// ou format refusé par le serveur), une seule nouvelle tentative : le schéma
// est donné dans la consigne, sans `response_format`, avec un budget de
// réponse doublé, et la réponse est validée par zod. Sinon, une erreur au
// message clair dans la langue de l'interface.

export class StructuredOutputError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(
      t`The language model did not return a usable answer. Try again, or check the model in the settings.`,
    );
    this.name = "StructuredOutputError";
    this.cause = cause;
  }
}

export type StructuredGenerationOptions<T> = {
  model: LanguageModel;
  instructions: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  maxRetries?: number;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
};

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return (
    Boolean(signal?.aborted) ||
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

function jsonInstructions(instructions: string, schema: z.ZodType): string {
  return `${instructions}

Reply with one JSON object only, without Markdown fences or any text around it. It must match this JSON Schema:
${JSON.stringify(z.toJSONSchema(schema))}`;
}

/** Extrait l'objet JSON d'une réponse texte (bloc ```json ou accolades). */
export function extractJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  const source = (fenced ?? text).trim();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new SyntaxError("No JSON object in the response");
  }
  return JSON.parse(source.slice(start, end + 1));
}

export async function generateStructured<T>({
  model,
  instructions,
  prompt,
  schema,
  maxOutputTokens,
  maxRetries = 2,
  timeoutMs,
  abortSignal,
}: StructuredGenerationOptions<T>): Promise<T> {
  const common = {
    model,
    prompt,
    maxRetries,
    ...(timeoutMs ? { timeout: { totalMs: timeoutMs } } : {}),
    abortSignal,
  };

  try {
    const result = await generateText({
      ...common,
      instructions,
      output: Output.object({ schema }),
      maxOutputTokens,
    });
    // Lire `output` lève AI_NoOutputGeneratedError quand il n'y en a pas.
    return result.output;
  } catch (error) {
    if (isAbort(error, abortSignal)) throw error;
    console.warn("[ai] structured output failed, retrying once", error);
  }

  try {
    const { text } = await generateText({
      ...common,
      instructions: jsonInstructions(instructions, schema),
      maxOutputTokens: maxOutputTokens ? maxOutputTokens * 2 : undefined,
    });
    return schema.parse(extractJsonObject(text));
  } catch (error) {
    if (isAbort(error, abortSignal)) throw error;
    throw new StructuredOutputError(error);
  }
}
