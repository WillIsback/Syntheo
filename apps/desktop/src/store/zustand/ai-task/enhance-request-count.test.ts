import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TASK_CONFIGS } from "./task-configs";
import { createTasksSlice } from "./tasks";

// Issue 779 : une génération de synthèse ne doit envoyer qu'une requête
// `stream` au serveur LLM. La validation précoce coupait le flux et relançait
// une seconde requête sur des débuts de réponse pourtant acceptables.

vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: vi.fn(async () => ({
    values: {},
    hasValues: new Set(),
  })),
}));

vi.mock("@syntheo/plugin-template", () => ({
  commands: {
    render: vi.fn(async () => ({ status: "ok", data: "Prompt" })),
  },
}));

const originalEnhanceConfig = { ...TASK_CONFIGS.enhance };

afterEach(() => {
  Object.assign(TASK_CONFIGS.enhance, originalEnhanceConfig);
  vi.restoreAllMocks();
});

function createStore() {
  let state: ReturnType<typeof createTasksSlice>;
  const set = (updater: any) => {
    state =
      typeof updater === "function" ? updater(state) : { ...state, ...updater };
  };
  const get = () => state;
  state = createTasksSlice(set, get);
  return () => state;
}

// Découpe la réponse en petits morceaux, comme les jetons d'un vrai flux.
function tokenize(text: string): string[] {
  return text.match(/.{1,4}/gsu) ?? [];
}

function createModel(output: string) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "1" },
          ...tokenize(output).map((delta) => ({
            type: "text-delta",
            id: "1",
            delta,
          })),
          { type: "text-end", id: "1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          },
        ] as any,
      }),
    }),
  });
}

async function generateSummary(output: string, sectionTitle: string | null) {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const model = createModel(output);

  TASK_CONFIGS.enhance.transformArgs = vi.fn(async () => ({
    sessionId: "session-1",
    enhancedNoteId: "note-1",
    language: "fr",
    formatOverride: "",
    session: { title: "Orion", startedAt: null, endedAt: null, event: null },
    participants: [],
    template: sectionTitle
      ? {
          title: "Modèle Orion",
          description: "",
          sections: [{ title: sectionTitle, description: "" }],
        }
      : null,
    transcripts: [],
    preMeetingMemo: "",
    postMeetingMemo: "",
    imageContext: [],
    dictionaryTerms: [],
    lengthPolicy: null,
  })) as any;
  TASK_CONFIGS.enhance.onSuccess = vi.fn(async () => {});

  const getState = createStore();
  await getState().generate("note-1-enhance" as any, {
    model,
    taskType: "enhance",
    args: { sessionId: "session-1", enhancedNoteId: "note-1" },
  });

  const task = getState().tasks["note-1-enhance"];
  expect(task?.error).toBeUndefined();
  expect(task?.status).toBe("success");
  return model.doStreamCalls.length;
}

describe("summary generation request count", () => {
  it.each([
    {
      name: "exact first section heading",
      output: "# Résumé\n\n- Budget validé.\n",
      section: "Résumé",
    },
    {
      name: "section heading without accents",
      output: "# Resume\n\n- Budget validé.\n",
      section: "Résumé",
    },
    {
      name: "level-two first heading",
      output: "## Résumé\n\n- Budget validé.\n",
      section: "Résumé",
    },
    {
      name: "level-two heading without template",
      output: "## Décisions\n\n- Budget validé.\n",
      section: null,
    },
    {
      name: "short preamble before the heading",
      output: "Voici le compte rendu :\n\n# Résumé\n\n- Budget validé.\n",
      section: "Résumé",
    },
  ])(
    "sends one stream request for an acceptable start: $name",
    async ({ output, section }) => {
      expect(await generateSummary(output, section)).toBe(1);
    },
  );

  it("still retries once when the output ignores the expected format", async () => {
    expect(
      await generateSummary(
        "Bonjour à toutes et à tous.\n\nLe budget est validé.\n",
        "Résumé",
      ),
    ).toBe(2);
  });
});
