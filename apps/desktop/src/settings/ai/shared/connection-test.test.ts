import { describe, expect, test, vi } from "vitest";

import { probeServer } from "./connection-test";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

const clock = () => {
  let current = 0;
  return () => (current += 42);
};

const routes =
  (table: Record<string, () => Response | Promise<Response>>) =>
  async (url: string, _init?: RequestInit) => {
    const handler = table[url];
    if (!handler) return new Response(null, { status: 404 });
    return handler();
  };

describe("probeServer", () => {
  test("refuse une adresse invalide sans requête", async () => {
    const fetcher = vi.fn();
    const result = await probeServer(
      { type: "llm", baseUrl: "http://8.8.8.8/v1", apiKey: "" },
      { fetcher, now: clock() },
    );

    expect(result).toMatchObject({ ok: false, reason: "invalid_url" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("mesure la latence et liste les modèles d'un serveur OpenAI", async () => {
    const fetcher = vi.fn(
      routes({
        "http://localhost:8000/v1/models": () =>
          Response.json({ data: [{ id: "qwen3" }, { id: "mistral-small" }] }),
      }),
    );

    const result = await probeServer(
      { type: "llm", baseUrl: "http://localhost:8000/v1/", apiKey: "secret" },
      { fetcher, now: clock() },
    );

    expect(result).toEqual({
      ok: true,
      latencyMs: 42,
      protocol: "openai",
      models: ["qwen3", "mistral-small"],
    });
    const init = fetcher.mock.calls[0]?.[1] ?? {};
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer secret",
    );
  });

  test("détecte le protocole OpenAI derrière une adresse /realtime", async () => {
    const fetcher = vi.fn(
      routes({
        "https://asr.example.com/v1/models": () =>
          Response.json({ data: [{ id: "voxtral-mini" }] }),
      }),
    );

    const result = await probeServer(
      {
        type: "stt",
        baseUrl: "https://asr.example.com/v1/realtime",
        apiKey: "",
      },
      { fetcher, now: clock() },
    );

    expect(result).toMatchObject({
      ok: true,
      protocol: "openai",
      models: ["voxtral-mini"],
    });
  });

  test("détecte un NIM par sa sonde de disponibilité", async () => {
    const fetcher = vi.fn(
      routes({
        "http://192.168.1.20:9000/v1/health/ready": () =>
          Response.json({ status: "ready" }),
      }),
    );

    const result = await probeServer(
      {
        type: "stt",
        baseUrl: "http://192.168.1.20:9000/v1/realtime",
        apiKey: "",
      },
      { fetcher, now: clock() },
    );

    expect(result).toMatchObject({ ok: true, protocol: "nvidia", models: [] });
  });

  test("NIM sans proxy (tout ouvert) : connecté, sans liste de modèles", async () => {
    const fetcher = vi.fn(
      routes({
        "http://192.168.1.20:9000/v1/health/ready": () =>
          Response.json({ status: "ready" }),
      }),
    );

    const result = await probeServer(
      { type: "stt", baseUrl: "http://192.168.1.20:9000", apiKey: "" },
      { fetcher, now: clock() },
    );

    expect(result).toMatchObject({ ok: true, protocol: "nvidia", models: [] });
    // La sonde d'authentification interroge bien une route protégée.
    expect(fetcher.mock.calls.map(([url]) => url)).toContain(
      "http://192.168.1.20:9000/v1/models",
    );
  });

  // Proxy authentifié (Caddy) devant un NIM : la sonde de santé reste
  // ouverte, les routes de l'API (`/v1/*`) exigent la bonne clé ; hors de
  // l'API, le NIM répond 404. C'est le cas qui affichait « connecté » à tort :
  // `/models` à la racine ne disait rien de la clé.
  const nimBehindProxy = (expectedKey: string) =>
    vi.fn(async (url: string, init?: RequestInit) => {
      const { pathname } = new URL(url);
      if (pathname === "/v1/health/ready") {
        return Response.json({ status: "ready" });
      }
      if (!pathname.startsWith("/v1/")) {
        return new Response(null, { status: 404 });
      }
      const auth = new Headers(init?.headers).get("Authorization");
      if (auth !== `Bearer ${expectedKey}`) {
        return new Response(null, { status: 401 });
      }
      return new Response(null, { status: 404 });
    });

  test("NIM derrière un proxy avec la bonne clé : connecté", async () => {
    const result = await probeServer(
      {
        type: "stt",
        baseUrl: "https://asr.tail6cba9f.ts.net",
        apiKey: "bonne-cle",
      },
      { fetcher: nimBehindProxy("bonne-cle"), now: clock() },
    );

    expect(result).toMatchObject({ ok: true, protocol: "nvidia", models: [] });
  });

  test.each([
    ["fausse", "mauvaise-cle"],
    ["absente", ""],
  ])(
    "NIM derrière un proxy avec une clé %s : clé refusée",
    async (_label, apiKey) => {
      const result = await probeServer(
        { type: "stt", baseUrl: "https://asr.tail6cba9f.ts.net", apiKey },
        { fetcher: nimBehindProxy("bonne-cle"), now: clock() },
      );

      expect(result).toEqual({
        ok: false,
        reason: "unauthorized",
        status: 401,
      });
    },
  );

  test("NIM derrière un proxy qui répond 403 : clé refusée", async () => {
    // Le proxy refuse la clé sur toute l'API, route temps réel comprise.
    const fetcher = vi.fn(async (url: string) => {
      const { pathname } = new URL(url);
      if (pathname === "/v1/health/ready") {
        return Response.json({ status: "ready" });
      }
      return new Response(null, {
        status: pathname.startsWith("/v1/") ? 403 : 404,
      });
    });

    const result = await probeServer(
      { type: "stt", baseUrl: "http://192.168.1.20:9000", apiKey: "x" },
      { fetcher, now: clock() },
    );

    expect(result).toEqual({ ok: false, reason: "unauthorized", status: 403 });
    expect(fetcher.mock.calls.map(([url]) => url)).toContain(
      "http://192.168.1.20:9000/v1/realtime?intent=transcription",
    );
  });

  // Issue #348 : transcripteur temps réel joignable en
  // `https://<nom>.ts.net/v1/realtime`. Le proxy n'expose que la route temps
  // réel et refuse tout le reste (`/v1/models`, sonde de santé) quelle que
  // soit la clé ; la route temps réel, elle, vérifie la clé avant la poignée
  // de main WebSocket (un GET simple y répond 426 quand la clé est bonne).
  const realtimeOnly = (expectedKey: string, refusal = 401) =>
    vi.fn(async (url: string, init?: RequestInit) => {
      const { pathname } = new URL(url);
      if (pathname !== "/v1/realtime") {
        return new Response(null, { status: refusal });
      }
      const auth = new Headers(init?.headers).get("Authorization");
      return new Response(null, {
        status: auth === `Bearer ${expectedKey}` ? 426 : 401,
      });
    });

  test.each([401, 403])(
    "temps réel seul (tailnet), bonne clé, %i ailleurs : connecté",
    async (refusal) => {
      const fetcher = realtimeOnly("bonne-cle", refusal);
      const result = await probeServer(
        {
          type: "stt",
          baseUrl: "https://spark-787d-1.tail6cba9f.ts.net/v1/realtime",
          apiKey: "bonne-cle",
        },
        { fetcher, now: clock() },
      );

      expect(result).toEqual({
        ok: true,
        latencyMs: 42,
        protocol: null,
        models: [],
      });
      // La clé est vérifiée sur la route qu'utilise la transcription.
      expect(fetcher.mock.calls.map(([url]) => url)).toContain(
        "https://spark-787d-1.tail6cba9f.ts.net/v1/realtime?intent=transcription",
      );
    },
  );

  test.each([
    ["fausse", "mauvaise-cle"],
    ["absente", ""],
  ])(
    "temps réel seul (tailnet), clé %s : clé refusée",
    async (_label, apiKey) => {
      const result = await probeServer(
        {
          type: "stt",
          baseUrl: "https://spark-787d-1.tail6cba9f.ts.net/v1/realtime",
          apiKey,
        },
        { fetcher: realtimeOnly("bonne-cle"), now: clock() },
      );

      expect(result).toEqual({
        ok: false,
        reason: "unauthorized",
        status: 401,
      });
    },
  );

  test("transcripteur qui refuse la clé partout : clé refusée", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 401 }));

    const result = await probeServer(
      {
        type: "stt",
        baseUrl: "https://asr.example.com/v1/realtime",
        apiKey: "bad",
      },
      { fetcher, now: clock() },
    );

    expect(result).toEqual({ ok: false, reason: "unauthorized", status: 401 });
  });

  test("signale un serveur injoignable", async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError("connection refused");
    });

    const result = await probeServer(
      { type: "stt", baseUrl: "http://localhost:9000", apiKey: "" },
      { fetcher, now: clock() },
    );

    expect(result).toEqual({ ok: false, reason: "unreachable" });
  });

  test("signale une clé refusée", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 401 }));

    const result = await probeServer(
      { type: "llm", baseUrl: "http://localhost:8000/v1", apiKey: "bad" },
      { fetcher, now: clock() },
    );

    expect(result).toEqual({ ok: false, reason: "unauthorized", status: 401 });
  });

  test("distingue une erreur du serveur d'une mauvaise adresse", async () => {
    const failing = vi.fn(async () => new Response(null, { status: 503 }));
    const missing = vi.fn(async () => new Response(null, { status: 404 }));

    await expect(
      probeServer(
        { type: "llm", baseUrl: "http://localhost:8000/v1", apiKey: "" },
        { fetcher: failing, now: clock() },
      ),
    ).resolves.toEqual({ ok: false, reason: "server_error", status: 503 });
    await expect(
      probeServer(
        { type: "llm", baseUrl: "http://localhost:8000", apiKey: "" },
        { fetcher: missing, now: clock() },
      ),
    ).resolves.toEqual({ ok: false, reason: "not_found", status: 404 });
  });

  test("abandonne au bout du délai", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );

    const pending = probeServer(
      { type: "llm", baseUrl: "http://localhost:8000/v1", apiKey: "" },
      { fetcher, now: clock(), timeoutMs: 1_000 },
    );
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toEqual({
      ok: false,
      reason: "unreachable",
    });
    vi.useRealTimers();
  });
});
