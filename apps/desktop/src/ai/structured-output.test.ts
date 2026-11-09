import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { i18n } from "@lingui/core";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { generateStructured, StructuredOutputError } from "./structured-output";

import { messages as frMessages } from "~/i18n/locales/fr/messages";

// Issue 530 : avec un serveur compatible OpenAI (vLLM), la première
// génération structurée échouait (AI_NoOutputGeneratedError) et la seconde
// réussissait. Une seule nouvelle tentative, en JSON demandé par consigne et
// validé par zod, puis un message clair.

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

type Reply = { text: string; finish?: "stop" | "length" } | Error;

function scriptedModel(replies: Reply[]) {
  const calls: LanguageModelV3CallOptions[] = [];
  let turn = 0;
  const model = new MockLanguageModelV3({
    doGenerate: (options) => {
      calls.push(options);
      const reply = replies[Math.min(turn++, replies.length - 1)]!;
      if (reply instanceof Error) return Promise.reject(reply);
      const finish = reply.finish ?? "stop";
      return Promise.resolve({
        content: reply.text ? [{ type: "text", text: reply.text }] : [],
        finishReason: { unified: finish, raw: finish },
        usage,
        warnings: [],
      });
    },
  });
  return { model, calls };
}

const schema = z.object({ items: z.array(z.string()) });

function generate(model: MockLanguageModelV3, signal?: AbortSignal) {
  return generateStructured({
    model,
    instructions: "Return the agenda.",
    prompt: "{}",
    schema,
    maxOutputTokens: 100,
    maxRetries: 0,
    abortSignal: signal,
  });
}

describe("generateStructured", () => {
  afterEach(() => {
    i18n.activate("en");
  });

  it("asks once for a JSON schema response and returns the object", async () => {
    const { model, calls } = scriptedModel([{ text: '{"items":["Budget"]}' }]);

    await expect(generate(model)).resolves.toEqual({ items: ["Budget"] });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.responseFormat).toMatchObject({ type: "json" });
  });

  it("retries once after NoOutputGeneratedError, with the schema in the instructions", async () => {
    const { model, calls } = scriptedModel([
      // Toute la réponse est partie dans le raisonnement : aucun texte.
      { text: "", finish: "length" },
      { text: '```json\n{"items":["Budget","Planning"]}\n```' },
    ]);

    await expect(generate(model)).resolves.toEqual({
      items: ["Budget", "Planning"],
    });
    expect(calls).toHaveLength(2);
    const retry = calls[1]!;
    expect(retry.responseFormat?.type ?? "text").toBe("text");
    expect(JSON.stringify(retry.prompt)).toContain('\\"items\\"');
    expect(retry.maxOutputTokens).toBe(200);
  });

  it("retries once after invalid JSON", async () => {
    const { model, calls } = scriptedModel([
      { text: '{"items": [' },
      { text: 'Voici : {"items":["Budget"]}' },
    ]);

    await expect(generate(model)).resolves.toEqual({ items: ["Budget"] });
    expect(calls).toHaveLength(2);
  });

  it("retries once when the server rejects the JSON schema format", async () => {
    const { model, calls } = scriptedModel([
      new Error("response_format json_schema is not supported"),
      { text: '{"items":["Budget"]}' },
    ]);

    await expect(generate(model)).resolves.toEqual({ items: ["Budget"] });
    expect(calls).toHaveLength(2);
  });

  it("fails with a clear French message after the second failure", async () => {
    i18n.load("fr", frMessages);
    i18n.activate("fr");
    const { model, calls } = scriptedModel([
      { text: "", finish: "length" },
      { text: "pas de JSON" },
    ]);

    const error = await generate(model).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StructuredOutputError);
    expect((error as Error).message).toMatch(/modèle de langage/);
    expect(calls).toHaveLength(2);
  });

  it("does not retry once the request is cancelled", async () => {
    const controller = new AbortController();
    const { model, calls } = scriptedModel([
      { text: "", finish: "length" },
      { text: '{"items":[]}' },
    ]);
    controller.abort();

    await expect(generate(model, controller.signal)).rejects.toThrow();
    expect(calls.length).toBeLessThanOrEqual(1);
  });
});
