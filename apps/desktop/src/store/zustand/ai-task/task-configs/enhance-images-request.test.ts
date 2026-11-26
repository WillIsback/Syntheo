import type { LanguageModel } from "ai";
import { beforeEach, expect, it, vi } from "vitest";

import { json2md } from "@syntheo/editor/markdown";

import { enhanceTransform } from "./enhance-transform";
import { enhanceWorkflow } from "./enhance-workflow";

// Issue 750, de bout en bout : la collecte d'images, le texte de la note et la
// requête au modèle sont les vrais ; seuls le stockage (note, pièces jointes),
// le rendu Rust des prompts et l'appel réseau sont simulés.

const mocks = vi.hoisted(() => ({
  attachmentList: vi.fn(),
  attachmentRead: vi.fn(),
  loadSessionContentSnapshot: vi.fn(),
  render: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock("@syntheo/plugin-fs-sync", () => ({
  commands: {
    attachmentList: mocks.attachmentList,
    attachmentRead: mocks.attachmentRead,
  },
}));

vi.mock("~/settings/providers", () => ({
  getStoredAiProvider: vi
    .fn()
    .mockResolvedValue({ base_url: "http://gpu.exemple.fr:8000/v1" }),
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
    render: mocks.render,
  },
}));

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  streamText: mocks.streamText,
}));

// Une note telle que l'éditeur l'enregistre : l'image collée n'est désignée
// que par l'identifiant de sa pièce jointe.
const NOTE = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Schéma de l'architecture :" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "image",
          attrs: { attachmentId: "schema-1", editorWidth: 80 },
        },
      ],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Validé en séance." }],
    },
  ],
};

const PNG_BYTES = [137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4];

beforeEach(() => {
  vi.clearAllMocks();
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
  mocks.attachmentList.mockResolvedValue({
    status: "ok",
    data: [
      {
        attachmentId: "schema-1",
        path: "/vault/sessions/session-1/attachments/schema-1.png",
        extension: "png",
        modifiedAt: "",
      },
    ],
  });
  mocks.attachmentRead.mockResolvedValue({ status: "ok", data: PNG_BYTES });
  mocks.render.mockResolvedValue({ status: "ok", data: "Prompt" });
  mocks.streamText.mockImplementation(() => ({
    stream: (async function* () {
      yield { type: "text-delta", id: "1", text: "Synthèse." };
    })(),
  }));
});

async function generate(model: string, imageInput = "{}") {
  const args = await enhanceTransform.transformArgs(
    { sessionId: "session-1", enhancedNoteId: "note-1" },
    {
      ai_language: "fr",
      current_llm_provider: "custom",
      current_llm_model: model,
      llm_image_input: imageInput,
    },
  );
  for await (const _ of enhanceWorkflow.executeWorkflow!({
    model: { provider: "openai.chat" } as LanguageModel,
    args,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
  })) {
    // la sortie du modèle n'importe pas ici
  }
  return { args, request: mocks.streamText.mock.calls[0][0] };
}

it("sends the image pasted in the note to a vision model", async () => {
  // Le Markdown de la note, seul lu avant le correctif, perd l'image.
  expect(json2md(NOTE)).toContain('![]( "char-editor-width=80")');

  const { args, request } = await generate("gpt-4o");

  expect(mocks.attachmentRead).toHaveBeenCalledWith("session-1", "schema-1");
  const parts = request.messages[0].content;
  expect(parts).toContainEqual({
    type: "file",
    data: btoa(String.fromCharCode(...PNG_BYTES)),
    mediaType: "image/png",
  });
  expect(args.postMeetingMemo).toContain("[Image 1]");
  expect(args.postMeetingMemo).not.toContain("char-editor-width");
  expect(parts[0].text).toContain("[Image N] in the notes marks where");
});

it("keeps a readable reference without the image for a text-only model", async () => {
  const { args, request } = await generate("gpt-3.5-turbo");

  expect(mocks.attachmentRead).not.toHaveBeenCalled();
  expect(request.messages).toBeUndefined();
  expect(args.imageContext).toEqual([]);
  expect(args.postMeetingMemo).toContain("[Image]");
  expect(args.postMeetingMemo).not.toContain("char-editor-width");
});

// Les numéros suivent les images réellement jointes : une image introuvable
// reste « [Image] » et ne décale pas la suivante.
it("numbers only the images actually attached", async () => {
  const note = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "image", attrs: { attachmentId: "absente" } },
          { type: "text", text: " puis " },
          { type: "image", attrs: { attachmentId: "schema-1" } },
        ],
      },
    ],
  };
  const snapshot = await mocks.loadSessionContentSnapshot();
  mocks.loadSessionContentSnapshot.mockResolvedValue({
    ...snapshot,
    rawContent: JSON.stringify(note),
    rawMarkdown: json2md(note),
  });

  const { args, request } = await generate("gpt-4o");

  expect(args.postMeetingMemo).toBe("[Image] puis [Image 1]");
  expect(
    request.messages[0].content.filter(
      (part: { type: string }) => part.type === "file",
    ),
  ).toHaveLength(1);
});

// Issue 770 : une image en bloc, entre deux paragraphes, garde son repère
// sur sa propre ligne au lieu de le coller au paragraphe suivant.
it("puts the reference of a block image on its own line", async () => {
  const note = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Schéma de l'architecture :" }],
      },
      { type: "image", attrs: { attachmentId: "schema-1" } },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Suite : validé en séance." }],
      },
    ],
  };
  const snapshot = await mocks.loadSessionContentSnapshot();
  mocks.loadSessionContentSnapshot.mockResolvedValue({
    ...snapshot,
    rawContent: JSON.stringify(note),
    rawMarkdown: json2md(note),
  });

  const withImage = await generate("gpt-4o");
  expect(withImage.args.postMeetingMemo).toBe(
    "Schéma de l'architecture :\n\n[Image 1]\n\nSuite : validé en séance.",
  );

  const withoutImage = await generate("gpt-3.5-turbo");
  expect(withoutImage.args.postMeetingMemo).toBe(
    "Schéma de l'architecture :\n\n[Image]\n\nSuite : validé en séance.",
  );
});

// Issue 770 : même règle pour une image en bloc dans une citation ou un
// élément de liste : le repère est sur sa propre ligne, rien n'y est collé.
it.each([
  [
    "a blockquote",
    {
      type: "blockquote",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Avant l'image." }],
        },
        { type: "image", attrs: { attachmentId: "schema-1" } },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Après l'image." }],
        },
      ],
    },
  ],
  [
    "a list item",
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Avant l'image." }],
            },
            { type: "image", attrs: { attachmentId: "schema-1" } },
            {
              type: "paragraph",
              content: [{ type: "text", text: "Après l'image." }],
            },
          ],
        },
      ],
    },
  ],
])(
  "puts the reference of a block image in %s on its own line",
  async (_, block) => {
    const note = { type: "doc", content: [block] };
    const snapshot = await mocks.loadSessionContentSnapshot();
    mocks.loadSessionContentSnapshot.mockResolvedValue({
      ...snapshot,
      rawContent: JSON.stringify(note),
      rawMarkdown: json2md(note),
    });

    const memo = (await generate("gpt-4o")).args.postMeetingMemo as string;
    const lines = memo.split("\n");
    const marker = lines.find((line) => line.includes("[Image 1]"));
    expect(marker).toBeDefined();
    // Seul le marqueur de bloc (« > », « - ») précède le repère.
    expect(marker).toMatch(/^[>\-*\s]*\[Image 1\]$/);
    expect(memo).not.toMatch(/\[Image 1\]\S/);
    expect(memo).not.toMatch(/\S\[Image 1\]/);
    expect(memo).toContain("Avant l'image.");
    expect(memo).toContain("Après l'image.");
  },
);

// Issue 754 : le réglage « Le modèle lit les images » du serveur et du modèle
// choisis tranche, quel que soit le nom du modèle.
const imageInput = (model: string, entry: Record<string, unknown>) =>
  JSON.stringify({ [`http://gpu.exemple.fr:8000/v1|${model}`]: entry });

it("sends the image when the setting says Yes, whatever the model name", async () => {
  const { request } = await generate(
    "qwen3.8-flash",
    imageInput("qwen3.8-flash", { choice: "yes" }),
  );

  expect(mocks.attachmentRead).toHaveBeenCalledWith("session-1", "schema-1");
  expect(
    request.messages[0].content.some(
      (part: { type: string }) => part.type === "file",
    ),
  ).toBe(true);
});

it("sends the image when Automatic detected that the model reads images", async () => {
  const { request } = await generate(
    "qwen3.8-flash",
    imageInput("qwen3.8-flash", {
      detected: {
        reads: true,
        source: "probe",
        checkedAt: "2026-11-26T10:00:00.000Z",
      },
    }),
  );

  expect(request.messages[0].content).toHaveLength(2);
});

it("sends no image when the setting says No, even for a vision model", async () => {
  const { args, request } = await generate(
    "gpt-4o",
    imageInput("gpt-4o", { choice: "no" }),
  );

  expect(mocks.attachmentRead).not.toHaveBeenCalled();
  expect(request.messages).toBeUndefined();
  expect(args.postMeetingMemo).toContain("[Image]");
});
