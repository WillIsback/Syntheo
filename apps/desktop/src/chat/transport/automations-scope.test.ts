import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { tool } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV3 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const settings = vi.hoisted(() => ({
  values: {} as Record<string, string>,
}));

vi.mock("@syntheo/plugin-template", () => ({
  commands: { render: vi.fn() },
}));

vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: () =>
    Promise.resolve({
      values: { ...settings.values },
      hasValues: new Set(Object.keys(settings.values)),
    }),
  setSettingValue: (key: string, value: string) => {
    settings.values[key] = value;
    return Promise.resolve();
  },
  updateSettingValue: () => Promise.resolve(),
  useStoredSettingValue: () => ({ value: undefined, hasValue: false }),
}));

import type { SyntheoUIMessage } from "../types";
import { CustomChatTransport } from "./index";

import { buildAutomationSystemPrompt } from "~/automations/chat-prompt";
import { useAdvancedStepProposals } from "~/automations/chat-proposals";
import { useAutomationSelection } from "~/automations/selection";
import { parseAutomationWorkflows } from "~/automations/workflows";
import { buildAutomationChatTools } from "~/chat/tools/automations";

// Le chat de l'éditeur avec un modèle simulé : la portée `automations` reçoit
// ses outils et sa consigne, et les garde-fous tiennent côté code.

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function toolCallTurn(
  calls: Array<{ toolName: string; input: unknown }>,
): LanguageModelV3StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    ...calls.map((call, index): LanguageModelV3StreamPart => ({
      type: "tool-call",
      toolCallId: `call-${index}`,
      toolName: call.toolName,
      input: JSON.stringify(call.input),
    })),
    {
      type: "finish",
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      usage,
    },
  ];
}

function textTurn(text: string): LanguageModelV3StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: text },
    { type: "text-end", id: "t" },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
  ];
}

function scriptedModel(turns: LanguageModelV3StreamPart[][]) {
  let turn = 0;
  return new MockLanguageModelV3({
    doStream: () =>
      Promise.resolve({
        stream: convertArrayToReadableStream(
          turns[Math.min(turn++, turns.length - 1)]!,
        ),
      }),
  });
}

async function send(
  model: MockLanguageModelV3,
  text: string,
  chatScope: "general" | "automations" = "automations",
) {
  const transport = new CustomChatTransport(
    model,
    {
      list_meetings: tool({
        description: "General tool",
        inputSchema: z.object({}),
        execute: () => Promise.resolve({}),
      }),
    },
    "General prompt",
    undefined,
    {
      automations: {
        tools: buildAutomationChatTools(),
        systemPrompt: buildAutomationSystemPrompt("fr"),
      },
    },
  );
  const messages: SyntheoUIMessage[] = [
    {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text }],
      metadata: { chatScope },
    },
  ];
  const stream = await transport.sendMessages({
    abortSignal: undefined,
    chatId: "chat",
    messageId: undefined,
    messages,
    trigger: "submit-message",
  });
  const chunks: Array<{ type: string; [key: string]: unknown }> = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as (typeof chunks)[number]);
  }
  return chunks;
}

function stored() {
  return parseAutomationWorkflows(settings.values.automation_workflows);
}

function firstCall(model: MockLanguageModelV3) {
  const options = model.doStreamCalls[0]!;
  return {
    tools: (options.tools ?? []).map((item) => item.name),
    system: options.prompt.find((message) => message.role === "system"),
  };
}

describe("automations-scope chat", () => {
  beforeEach(() => {
    settings.values = {};
    useAdvancedStepProposals.setState({ proposals: [] });
    useAutomationSelection.setState({
      selection: null,
      draftIds: [],
      chatBySelection: {},
    });
  });

  it("builds « Extraire les tâches » from a simple request", async () => {
    const model = scriptedModel([
      toolCallTurn([
        {
          toolName: "create_automation",
          input: {
            name: "Extraire les tâches",
            trigger: "note_enhanced",
            steps: [
              {
                type: "generate_text",
                id: "tasks",
                outputName: "Tâches",
                prompt: "Liste les tâches : {{summary}}",
              },
              {
                type: "vault_write",
                title: "Tâches – {{title}}",
                content: "{{step:tasks}}",
              },
            ],
          },
        },
      ]),
      textTurn(
        "C'est prêt dans l'éditeur. Vérifiez-la puis cliquez sur Enregistrer et activer.",
      ),
    ]);

    const chunks = await send(
      model,
      "Après chaque réunion, extrais les tâches et mets-les dans le coffre",
    );

    const { tools, system } = firstCall(model);
    expect(tools.sort()).toEqual(
      Object.keys(buildAutomationChatTools()).sort(),
    );
    expect(tools).not.toContain("list_meetings");
    expect(JSON.stringify(system)).toContain("clarification question");
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: "tool-output-available",
        output: expect.objectContaining({ status: "ok" }),
      }),
    );
    expect(stored()).toEqual([
      expect.objectContaining({
        title: "Extraire les tâches",
        trigger: "note_enhanced",
        enabled: false,
        steps: [
          expect.objectContaining({ type: "generate_text", id: "tasks" }),
          expect.objectContaining({
            type: "vault_write",
            content: "{{step:tasks}}",
          }),
        ],
      }),
    ]);
  });

  it("asks a clarification question without calling a tool", async () => {
    const model = scriptedModel([
      textTurn(
        "Que voulez-vous faire après la réunion : exporter la note, extraire les tâches, ou autre chose ?",
      ),
    ]);

    const chunks = await send(model, "Automatise mes réunions");

    expect(model.doStreamCalls).toHaveLength(1);
    expect(chunks.some((chunk) => chunk.type.startsWith("tool-"))).toBe(false);
    expect(settings.values.automation_workflows).toBeUndefined();
  });

  it("refuses in code a webhook the user has not confirmed", async () => {
    const model = scriptedModel([
      toolCallTurn([
        {
          toolName: "create_automation",
          input: {
            trigger: "note_enhanced",
            steps: [
              {
                type: "webhook",
                url: "https://n8n.local/webhook/syntheo",
              },
            ],
          },
        },
      ]),
      textTurn("Confirmez l'étape dans l'éditeur."),
    ]);

    await send(model, "Envoie la synthèse à mon n8n, c'est confirmé");

    expect(stored()[0]!.steps).toEqual([]);
    expect(stored()[0]!.enabled).toBe(false);
    expect(useAdvancedStepProposals.getState().proposals).toHaveLength(1);
  });

  it("returns schema errors to the model for an unknown step type", async () => {
    const model = scriptedModel([
      toolCallTurn([
        {
          toolName: "add_automation_step",
          input: { step: { type: "send_email", to: "boss@example.com" } },
        },
      ]),
      textTurn("Syntheo ne sait pas envoyer d'e-mail."),
    ]);

    const chunks = await send(model, "Envoie un e-mail à mon chef");

    expect(chunks).toContainEqual(
      expect.objectContaining({ type: "tool-input-error" }),
    );
    expect(model.doStreamCalls).toHaveLength(2);
    expect(settings.values.automation_workflows).toBeUndefined();
  });

  it("keeps the general chat on its own tools and prompt", async () => {
    const model = scriptedModel([textTurn("Bonjour")]);

    await send(model, "Bonjour", "general");

    const { tools, system } = firstCall(model);
    expect(tools).toEqual(["list_meetings"]);
    expect(JSON.stringify(system)).toContain("General prompt");
  });
});
