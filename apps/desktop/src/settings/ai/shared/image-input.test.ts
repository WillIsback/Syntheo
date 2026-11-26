import { describe, expect, it, vi } from "vitest";

import {
  decideImageInput,
  detectImageInput,
  IMAGE_INPUT_PROBE_PNG,
  IMAGE_INPUT_PROBE_QUESTION,
  imageInputKey,
  parseImageInputSettings,
  probeImageInput,
  withImageInputEntry,
} from "./image-input";

// Issue 754 : Automatique interroge le serveur au lieu de deviner d'après le
// nom. Réponses simulées : seule la sonde est réelle.

const NOW = new Date("2026-11-26T10:00:00.000Z");
const SERVER = {
  baseUrl: "http://gpu.exemple.fr:8000/v1",
  apiKey: "",
  model: "qwen3.8-flash",
};

type Route = (init: RequestInit) => Response | Promise<Response>;

function server(routes: Record<string, Route>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const route = routes[url];
    return route ? route(init) : new Response("Not Found", { status: 404 });
  });
  return { fetcher, calls };
}

const detect = (
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
) => detectImageInput(SERVER, { fetcher, now: () => NOW });

const CHAT = "http://gpu.exemple.fr:8000/v1/chat/completions";

/** Réponse OpenAI-compatible d'un modèle à la question de la sonde. */
const answer = (message: Record<string, unknown>) =>
  new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });

describe("detectImageInput, probe with the test image", () => {
  it("reads images when the model names the colour of the disc", async () => {
    const { fetcher, calls } = server({
      [CHAT]: () => answer({ role: "assistant", content: "Blue." }),
    });

    await expect(detect(fetcher)).resolves.toEqual({
      reads: true,
      source: "probe",
      checkedAt: NOW.toISOString(),
    });
    const probe = calls.find((call) => call.url === CHAT);
    const body = JSON.parse(String(probe?.init.body));
    expect(body.model).toBe("qwen3.8-flash");
    expect(body.max_tokens).toBe(64);
    // Pas de température imposée : certains modèles qui raisonnent la
    // refusent ou la fixent eux-mêmes.
    expect(body).not.toHaveProperty("temperature");
    // Seule l'image de test embarquée part : aucune donnée de l'utilisateur.
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: IMAGE_INPUT_PROBE_QUESTION },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${IMAGE_INPUT_PROBE_PNG}`,
            },
          },
        ],
      },
    ]);
  });

  it.each([
    [
      "vLLM",
      400,
      '{"error":{"message":"qwen3.8-flash is not a multimodal model"}}',
    ],
    [
      "llama.cpp",
      400,
      '{"error":{"message":"image input is not supported - hint: if this is unexpected, you may need to provide the mmproj"}}',
    ],
    ["Ollama", 400, '{"error":"\\"qwen3.8-flash\\" does not support vision"}'],
    ["proxy", 422, "At most 0 image(s) may be provided in one request."],
  ])(
    "does not read images on an explicit image refusal (%s)",
    async (_, status, body) => {
      const { fetcher } = server({
        [CHAT]: () => new Response(body, { status }),
      });

      await expect(detect(fetcher)).resolves.toEqual({
        reads: false,
        source: "probe",
        checkedAt: NOW.toISOString(),
      });
    },
  );

  it.each([
    ["network error", () => Promise.reject(new TypeError("Failed to fetch"))],
    [
      "server error",
      () => new Response("Internal Server Error", { status: 500 }),
    ],
    [
      "refused key",
      () => new Response('{"error":"invalid api key"}', { status: 401 }),
    ],
  ])("gives no result on another failure (%s)", async (_, route) => {
    const { fetcher } = server({ [CHAT]: route as Route });

    await expect(detect(fetcher)).resolves.toBeNull();
  });

  it("gives up after the timeout", async () => {
    const fetcher = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );

    await expect(
      detectImageInput(SERVER, {
        fetcher,
        metadataTimeoutMs: 5,
        probeTimeoutMs: 5,
      }),
    ).resolves.toBeNull();
  });
});

// Issue 771 : une réponse 2xx ne suffit pas, le modèle doit avoir vu
// l'image. Les cas ambigus ne concluent pas.
describe("probeImageInput, always sends the test image", () => {
  const probe = (
    fetcher: (url: string, init: RequestInit) => Promise<Response>,
  ) => probeImageInput(SERVER, { fetcher, now: () => NOW });

  it("sends the image even when the server publishes metadata", async () => {
    const { fetcher, calls } = server({
      "http://gpu.exemple.fr:8000/api/show": () =>
        new Response(JSON.stringify({ capabilities: ["vision"] })),
      [CHAT]: () => answer({ content: "blue" }),
    });

    await expect(probe(fetcher)).resolves.toEqual({
      status: "reads",
      detection: { reads: true, source: "probe", checkedAt: NOW.toISOString() },
    });
    expect(calls.map((call) => call.url)).toEqual([CHAT]);
  });

  it("accepts the answer found in the reasoning of a thinking model", async () => {
    const { fetcher } = server({
      [CHAT]: () =>
        answer({
          content: "",
          reasoning_content: "The image shows a blue circle, an arrow and",
        }),
    });

    await expect(probe(fetcher)).resolves.toMatchObject({ status: "reads" });
  });

  it("reads the reasoning of a thinking model given as text parts", async () => {
    const { fetcher } = server({
      [CHAT]: () =>
        answer({
          content: [{ type: "text", text: "  " }],
          reasoning: [{ type: "text", text: "A blue disc on white." }],
        }),
    });

    await expect(probe(fetcher)).resolves.toMatchObject({ status: "reads" });
  });

  it("reports an explicit refusal of the image", async () => {
    const { fetcher } = server({
      [CHAT]: () =>
        new Response(
          '{"error":{"message":"qwen3.8-flash is not a multimodal model"}}',
          { status: 400 },
        ),
    });

    await expect(probe(fetcher)).resolves.toEqual({
      status: "refused",
      detection: {
        reads: false,
        source: "probe",
        checkedAt: NOW.toISOString(),
      },
    });
  });

  it.each<[string, Route, string]>([
    [
      "an answer about something else",
      () => answer({ content: "OK" }),
      "unrelated",
    ],
    ["the wrong colour", () => answer({ content: "Red." }), "unrelated"],
    [
      "a model that says it sees no image",
      () => answer({ content: "I cannot see any image." }),
      "unrelated",
    ],
    ...[
      "I cannot see any image, but it might be blue.",
      "I can't see the picture; my guess is blue.",
      "I don't see an image. Blue?",
      "There is no image attached, so: blue.",
      "I am not able to view images. Blue.",
      "Je ne vois pas d'image, mais je dirais bleu.",
      "Je ne peux pas voir l'image : bleu ?",
      "Il n'y a pas d'image ; peut-être bleue.",
    ].map((content): [string, Route, string] => [
      `a model that says it sees no image but guesses: ${content}`,
      () => answer({ content }),
      "unrelated",
    ]),
    [
      "a final answer that contradicts the reasoning",
      () => answer({ content: "Red.", reasoning_content: "Maybe blue…" }),
      "unrelated",
    ],
    ["an empty answer", () => answer({ content: "" }), "no-answer"],
    [
      "no choice",
      () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      "no-answer",
    ],
    ["a body that is not JSON", () => new Response("OK"), "no-answer"],
    [
      "a server error",
      () => new Response("Internal Server Error", { status: 500 }),
      "error",
    ],
    [
      "a refused key",
      () => new Response('{"error":"invalid api key"}', { status: 401 }),
      "error",
    ],
  ])("does not conclude on %s", async (_, respond, reason) => {
    const { fetcher } = server({ [CHAT]: respond });

    await expect(probe(fetcher)).resolves.toEqual({
      status: "unclear",
      reason,
    });
    // Automatique ne garde rien non plus : le nom du modèle tranche.
    const again = server({ [CHAT]: respond });
    await expect(detect(again.fetcher)).resolves.toBeNull();
  });

  it("reports an unreachable server", async () => {
    const { fetcher } = server({
      [CHAT]: () => Promise.reject(new TypeError("Failed to fetch")),
    });

    await expect(probe(fetcher)).resolves.toEqual({
      status: "unclear",
      reason: "unreachable",
    });
  });
});

describe("detectImageInput, server metadata", () => {
  it("reads Ollama capabilities before probing", async () => {
    const { fetcher, calls } = server({
      "http://gpu.exemple.fr:8000/api/show": (init) => {
        expect(JSON.parse(String(init.body))).toEqual({
          model: "qwen3.8-flash",
        });
        return new Response(
          JSON.stringify({ capabilities: ["completion", "vision"] }),
        );
      },
    });

    await expect(detect(fetcher)).resolves.toMatchObject({
      reads: true,
      source: "metadata",
    });
    expect(calls.some((call) => call.url === CHAT)).toBe(false);
  });

  it("reads the LM Studio model type", async () => {
    const { fetcher } = server({
      "http://gpu.exemple.fr:8000/api/v0/models": () =>
        new Response(
          JSON.stringify({
            data: [
              { id: "other", type: "vlm" },
              { id: "qwen3.8-flash", type: "llm" },
            ],
          }),
        ),
    });

    await expect(detect(fetcher)).resolves.toMatchObject({
      reads: false,
      source: "metadata",
    });
  });

  it("reads the llama.cpp modalities", async () => {
    const { fetcher } = server({
      "http://gpu.exemple.fr:8000/props": () =>
        new Response(
          JSON.stringify({ modalities: { vision: true, audio: false } }),
        ),
    });

    await expect(detect(fetcher)).resolves.toMatchObject({
      reads: true,
      source: "metadata",
    });
  });
});

describe("decideImageInput", () => {
  const unknown = "qwen3.8-flash";
  const known = "gpt-4o";

  it("forces the choice with Yes or No", () => {
    expect(decideImageInput({ choice: "yes" }, unknown)).toEqual({
      reads: true,
      basis: "forced",
    });
    expect(
      decideImageInput(
        {
          choice: "no",
          detected: { reads: true, source: "probe", checkedAt: "" },
        },
        known,
      ),
    ).toEqual({ reads: false, basis: "forced" });
  });

  it("uses the kept detection in Automatic, without probing again", () => {
    expect(
      decideImageInput(
        { detected: { reads: true, source: "probe", checkedAt: "" } },
        unknown,
      ),
    ).toEqual({ reads: true, basis: "detected" });
  });

  it("falls back to the model name only without a detection", () => {
    expect(decideImageInput(undefined, unknown)).toEqual({
      reads: false,
      basis: "name",
    });
    expect(decideImageInput({ choice: "auto" }, known)).toEqual({
      reads: true,
      basis: "name",
    });
  });
});

describe("image input settings", () => {
  it("keeps one entry per server address and model", () => {
    const key = imageInputKey(
      "http://gpu.exemple.fr:8000/v1/",
      " qwen3.8-flash ",
    );
    expect(key).toBe("http://gpu.exemple.fr:8000/v1|qwen3.8-flash");

    const detected = {
      reads: true,
      source: "probe" as const,
      checkedAt: NOW.toISOString(),
    };
    const once = withImageInputEntry({}, key, (entry) => ({
      ...entry,
      detected,
    }));
    const twice = withImageInputEntry(
      parseImageInputSettings(once),
      key,
      (entry) => ({
        ...entry,
        choice: "no",
      }),
    );
    expect(parseImageInputSettings(twice)).toEqual({
      [key]: { detected, choice: "no" },
    });
  });

  it("ignores malformed stored values", () => {
    expect(parseImageInputSettings("not json")).toEqual({});
    expect(
      parseImageInputSettings(
        JSON.stringify({ k: { choice: "maybe", detected: { reads: "yes" } } }),
      ),
    ).toEqual({ k: {} });
  });

  it("keeps at most the 50 latest entries", () => {
    let stored = "{}";
    for (let index = 0; index < 60; index += 1) {
      stored = withImageInputEntry(
        parseImageInputSettings(stored),
        `k${index}`,
        () => ({
          choice: "yes",
        }),
      );
    }
    const keys = Object.keys(parseImageInputSettings(stored));
    expect(keys).toHaveLength(50);
    expect(keys[keys.length - 1]).toBe("k59");
    expect(keys[0]).toBe("k10");
  });
});
