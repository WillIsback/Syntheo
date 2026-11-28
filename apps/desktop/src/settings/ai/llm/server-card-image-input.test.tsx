import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { json2md } from "@syntheo/editor/markdown";

import { LlmServerCard } from "./server-card";

import { enhanceTransform } from "~/store/zustand/ai-task/task-configs/enhance-transform";
import { enhanceWorkflow } from "~/store/zustand/ai-task/task-configs/enhance-workflow";

// Issue 768, de bout en bout : la carte « Mon serveur » et la requête de
// synthèse sont les vraies. Sont simulés : le stockage des réglages, l'état
// de connexion, la détection des images, la note et ses pièces jointes, et
// le serveur de synthèse (au niveau HTTP).

const { BASE, MODEL, PNG_BYTES } = vi.hoisted(() => ({
  BASE: "http://gpu.exemple.fr:8000/v1",
  MODEL: "qwen3.8-flash",
  PNG_BYTES: [137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4],
}));
const KEY = `${BASE}|${MODEL}`;

type ConnectionState = { status: string; [field: string]: unknown };

const mocks = vi.hoisted(() => ({
  settings: {} as Record<string, string>,
  state: { status: "connected" } as ConnectionState,
  test: vi.fn(),
  detect: vi.fn(),
  loadSessionContentSnapshot: vi.fn(),
}));

vi.mock("~/shared/config", () => ({
  useConfigValue: (key: string) => mocks.settings[key],
  useConfigValues: (keys: readonly string[]) =>
    Object.fromEntries(keys.map((key) => [key, mocks.settings[key]])),
}));

vi.mock("~/settings/queries", () => ({
  updateSettingValue: async (
    key: string,
    update: (current: string | undefined) => string,
  ) => {
    mocks.settings[key] = update(mocks.settings[key]);
    return mocks.settings[key];
  },
  useSettingsReady: () => true,
  setSettingValues: vi.fn().mockResolvedValue(undefined),
  useSetSettingValue: () => vi.fn(),
  useSetSettingValues: () => vi.fn(),
}));

vi.mock("~/settings/ai/shared/server-connection", () => ({
  useServerConnection: () => ({
    state: mocks.state,
    baseUrl: BASE,
    apiKey: "",
    disabled: false,
    test: mocks.test,
  }),
}));

vi.mock("~/settings/ai/shared/server-address", () => ({
  ServerAddressForm: ({ onTest }: { onTest: () => void }) => (
    <button type="button" onClick={onTest}>
      Test the connection
    </button>
  ),
}));

vi.mock("~/settings/ai/shared/list-openai", () => ({
  listCustomModels: vi.fn().mockResolvedValue({ models: [MODEL] }),
}));

vi.mock("./health", () => ({
  useConnectionHealth: () => ({ status: "ok" }),
}));

vi.mock("~/settings/ai/shared/image-input", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/settings/ai/shared/image-input")
  >()),
  detectImageInput: mocks.detect,
}));

// Côté synthèse : la note, sa pièce jointe et les prompts.
vi.mock("@syntheo/plugin-fs-sync", () => ({
  commands: {
    attachmentList: vi.fn().mockResolvedValue({
      status: "ok",
      data: [
        {
          attachmentId: "schema-1",
          path: "/vault/sessions/session-1/attachments/schema-1.png",
          extension: "png",
          modifiedAt: "",
        },
      ],
    }),
    attachmentRead: vi
      .fn()
      .mockResolvedValue({ status: "ok", data: PNG_BYTES }),
  },
}));

vi.mock("~/settings/providers", () => ({
  getStoredAiProvider: vi.fn().mockResolvedValue({ base_url: BASE }),
}));

vi.mock("~/session/content-queries", () => ({
  loadSessionContentSnapshot: mocks.loadSessionContentSnapshot,
}));

vi.mock("~/templates/queries", () => ({
  getTemplateById: vi.fn().mockResolvedValue(null),
}));

vi.mock("~/stt/meeting-chat-records", () => ({
  formatMeetingChatContext: () => "",
  loadMeetingChatRecords: vi.fn().mockResolvedValue([]),
}));

vi.mock("@syntheo/plugin-transcription", () => ({
  commands: {
    renderSessionTranscript: vi
      .fn()
      .mockResolvedValue({ status: "ok", data: null }),
  },
}));

vi.mock("@syntheo/plugin-template", () => ({
  commands: {
    dominantLanguage: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    summaryLengthPolicy: vi.fn().mockResolvedValue({
      status: "ok",
      data: {
        transcript_characters: 0,
        guidance: { max_characters: 800, min_sections: 1, max_sections: 3 },
      },
    }),
    render: vi.fn().mockResolvedValue({ status: "ok", data: "Prompt" }),
  },
}));

const NOTE = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Schéma de l'architecture :" }],
    },
    { type: "image", attrs: { attachmentId: "schema-1" } },
  ],
};

const DETECTED_YES = {
  reads: true,
  source: "probe",
  checkedAt: "2026-11-26T10:00:00.000Z",
};

beforeEach(() => {
  mocks.settings = {
    ai_language: "fr",
    current_llm_provider: "custom",
    current_llm_model: MODEL,
    llm_image_input: JSON.stringify({ [KEY]: { detected: DETECTED_YES } }),
  };
  mocks.state = { status: "connected", models: [MODEL] };
  mocks.test.mockReset();
  mocks.detect.mockReset();
  mocks.loadSessionContentSnapshot.mockResolvedValue({
    sessionId: "session-1",
    ownerUserId: "user-1",
    title: "Revue d'architecture",
    createdAt: "2026-11-20T09:00:00.000Z",
    event: null,
    sourceApps: [],
    eventId: null,
    rawNoteId: "session-1",
    rawTemplateId: "",
    rawUpdatedAt: "",
    rawHeadingsUpdatedAt: "",
    rawAppliedTemplate: null,
    rawContent: JSON.stringify(NOTE),
    rawContentFormat: "json",
    rawMarkdown: json2md(NOTE),
    enhancedNotes: [],
    transcripts: [],
    participants: [],
  });
});

afterEach(cleanup);

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = () => (
    <QueryClientProvider client={client}>
      <LlmServerCard />
    </QueryClientProvider>
  );
  const view = render(tree());
  return { rerender: () => view.rerender(tree()) };
}

/** « Tester la connexion » : le test passe par « testing » puis réussit. */
async function testConnection(card: { rerender: () => void }) {
  fireEvent.click(screen.getByRole("button", { name: "Test the connection" }));
  expect(mocks.test).toHaveBeenCalledTimes(1);
  mocks.state = { status: "testing" };
  card.rerender();
  mocks.state = { status: "connected", models: [MODEL] };
  card.rerender();
}

/** Corps JSON de la requête de synthèse envoyée au serveur. */
async function summaryRequestBody(): Promise<{
  messages: Array<{ content: unknown }>;
}> {
  const bodies: string[] = [];
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    bodies.push(typeof init?.body === "string" ? init.body : "");
    const chunk = (delta: Record<string, unknown>, finish: string | null) =>
      `data: ${JSON.stringify({
        id: "1",
        object: "chat.completion.chunk",
        created: 0,
        model: MODEL,
        choices: [{ index: 0, delta, finish_reason: finish }],
      })}\n\n`;
    return new Response(
      chunk({ role: "assistant", content: "Synthèse." }, null) +
        chunk({}, "stop") +
        "data: [DONE]\n\n",
      { headers: { "Content-Type": "text/event-stream" } },
    );
  });
  const model = createOpenAICompatible({
    name: "custom",
    baseURL: BASE,
    fetch: fetch as typeof globalThis.fetch,
  }).chatModel(MODEL);
  const args = await enhanceTransform.transformArgs(
    { sessionId: "session-1", enhancedNoteId: "note-1" },
    { ...mocks.settings },
  );
  for await (const _ of enhanceWorkflow.executeWorkflow!({
    model,
    args,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
  })) {
    // la sortie du modèle n'importe pas ici
  }
  expect(bodies).toHaveLength(1);
  return JSON.parse(bodies[0]);
}

const imageUrlParts = (body: { messages: Array<{ content: unknown }> }) =>
  body.messages.flatMap((message) =>
    Array.isArray(message.content)
      ? message.content.filter(
          (part: { type?: string }) => part.type === "image_url",
        )
      : [],
  );

it("keeps the image detection through Test the connection, and the next summary still sends the image", async () => {
  // La nouvelle détection ne tranche pas (serveur occupé, réponse ambiguë).
  mocks.detect.mockResolvedValue({ status: "unclear", reason: "unrelated" });
  const card = renderCard();
  expect(
    screen.getByText(/^The model accepted the test image and described it/),
  ).toBeTruthy();
  expect(mocks.detect).not.toHaveBeenCalled();

  await testConnection(card);

  // La détection est refaite, sans effacer le résultat gardé.
  await waitFor(() => expect(mocks.detect).toHaveBeenCalledTimes(1));
  expect(JSON.parse(mocks.settings.llm_image_input)[KEY]).toEqual({
    detected: DETECTED_YES,
  });
  card.rerender();
  expect(
    screen.getByText(/^The model accepted the test image and described it/),
  ).toBeTruthy();

  const body = await summaryRequestBody();
  expect(imageUrlParts(body)).toEqual([
    {
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${btoa(String.fromCharCode(...PNG_BYTES))}`,
      },
    },
  ]);
});

it("saves a clear new detection made after Test the connection", async () => {
  mocks.detect.mockResolvedValue({
    status: "detected",
    detection: {
      reads: false,
      source: "metadata",
      checkedAt: "2026-11-26T12:00:00.000Z",
    },
  });
  const card = renderCard();

  await testConnection(card);

  await waitFor(() =>
    expect(JSON.parse(mocks.settings.llm_image_input)[KEY].detected).toEqual({
      reads: false,
      source: "metadata",
      checkedAt: "2026-11-26T12:00:00.000Z",
    }),
  );
});

it("never touches a forced choice on Test the connection", async () => {
  mocks.settings.llm_image_input = JSON.stringify({
    [KEY]: { choice: "yes" },
  });
  const card = renderCard();

  await testConnection(card);
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(mocks.detect).not.toHaveBeenCalled();
  expect(JSON.parse(mocks.settings.llm_image_input)[KEY]).toEqual({
    choice: "yes",
  });
  const body = await summaryRequestBody();
  expect(imageUrlParts(body)).toHaveLength(1);
});
