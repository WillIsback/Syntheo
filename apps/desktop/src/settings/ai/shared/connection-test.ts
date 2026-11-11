import {
  ProviderCredentialError,
  validateProviderBaseUrl,
} from "@syntheo/provider-validation";

import { providerFetch } from "~/ai/provider-fetch";

// « Tester la connexion » des cartes serveur. `verifyProviderCredentials`
// ne suffit pas ici : il ne sonde pas les serveurs de transcription (leur clé
// est vérifiée à l'ouverture de la session) et ses messages parlent de clé.
// La sonde reprend ses règles (même contrôle d'URL, même `/models`, même
// transport) et ajoute la latence et la détection du protocole.

export type ServerProtocol = "openai" | "nvidia";

export type ServerProbeFailure =
  | "invalid_url"
  | "unreachable"
  | "unauthorized"
  | "not_found"
  | "server_error";

export type ServerProbeResult =
  | {
      ok: true;
      latencyMs: number;
      // `null` : la clé est acceptée mais le protocole n'a pas pu être
      // reconnu (seule la route temps réel répond).
      protocol: ServerProtocol | null;
      models: string[];
    }
  | { ok: false; reason: "invalid_url"; message: string }
  | {
      ok: false;
      reason: Exclude<ServerProbeFailure, "invalid_url">;
      status?: number;
    };

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_MODELS = 200;

export async function probeServer(
  {
    type,
    baseUrl,
    apiKey,
  }: { type: "stt" | "llm"; baseUrl: string; apiKey: string },
  {
    fetcher = providerFetch as Fetcher,
    signal,
    now = () => performance.now(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: {
    fetcher?: Fetcher;
    signal?: AbortSignal;
    now?: () => number;
    timeoutMs?: number;
  } = {},
): Promise<ServerProbeResult> {
  let url: URL;
  try {
    url = validateProviderBaseUrl(baseUrl.trim());
  } catch (error) {
    return {
      ok: false,
      reason: "invalid_url",
      message:
        error instanceof ProviderCredentialError
          ? error.message
          : String(error),
    };
  }

  const headers: Record<string, string> = apiKey.trim()
    ? { Authorization: `Bearer ${apiKey.trim()}` }
    : {};
  const request = (target: string) =>
    timedRequest(target, { headers, fetcher, signal, now, timeoutMs });

  // Le transcripteur OpenAI s'adresse en `/v1` ou `/v1/realtime` : la liste
  // des modèles vit toujours à côté, en `/v1/models`. NeMo-Speech.cpp
  // s'adresse à la racine du serveur : sa liste est en `/v1/models`, plus bas.
  let base = trimTrailingSlashes(url.toString());
  if (type === "stt") base = base.replace(/\/realtime$/, "");

  const models = await request(`${base}/models`);
  if (models.kind === "network") return { ok: false, reason: "unreachable" };
  if (type === "llm" && isRefusal(models.status)) {
    return { ok: false, reason: "unauthorized", status: models.status };
  }
  if (models.ok) {
    const nemo = type === "stt" ? nemoSpeechModels(models.body) : null;
    if (nemo) {
      return {
        ok: true,
        latencyMs: models.latencyMs,
        protocol: "nvidia",
        models: nemo,
      };
    }
    const ids = modelIds(models.body);
    if (ids) {
      return {
        ok: true,
        latencyMs: models.latencyMs,
        protocol: "openai",
        models: ids,
      };
    }
  }

  // NVIDIA NeMo-Speech.cpp expose sa sonde de disponibilité et sa liste de
  // modèles à la racine du serveur.
  if (type === "stt") {
    // Un 401/403 sur une route annexe (`/models`, sonde de santé) ne prouve
    // pas un refus de clé : un proxy (tailnet…) peut n'exposer que la route
    // temps réel et refuser tout le reste, même avec la bonne clé (issue 348).
    // On le note, et la route de transcription tranche plus bas.
    let refusal = isRefusal(models.status) ? models.status : undefined;
    let protocol: ServerProtocol | null = null;
    const health = await request(`${url.origin}/v1/health/ready`);
    if (health.kind === "response") {
      if (isRefusal(health.status)) refusal ??= health.status;
      if (health.ok) {
        // La sonde de santé reste souvent ouverte derrière un proxy
        // authentifié (Caddy…) : elle ne dit rien de la clé. On interroge
        // donc aussi une route protégée de l'API, en lecture seule, qui donne
        // en prime le modèle chargé. Seuls 401 et 403 comptent : une autre
        // réponse montre que la clé a passé le contrôle.
        const authUrl = `${url.origin}/v1/models`;
        const auth =
          authUrl === `${base}/models` ? models : await request(authUrl);
        if (auth.kind === "network") {
          return { ok: false, reason: "unreachable" };
        }
        if (!isRefusal(auth.status)) {
          return {
            ok: true,
            latencyMs: health.latencyMs,
            protocol: "nvidia",
            models: (auth.ok ? nemoSpeechModels(auth.body) : null) ?? [],
          };
        }
        protocol = "nvidia";
        refusal = auth.status;
      }
    }

    if (refusal !== undefined) {
      // La clé voyage dans l'en-tête `Authorization` de la poignée de main
      // WebSocket : un GET simple sur cette même route passe par le même
      // contrôle (proxy ou serveur) sans ouvrir de session. Seul un 401/403
      // ici est un vrai refus de clé ; toute autre réponse (426, 400, 404 d'une
      // route réservée au WebSocket…) montre que la clé a passé le contrôle.
      const realtime = await request(realtimeUrl(url, protocol));
      if (realtime.kind === "network") {
        return { ok: false, reason: "unreachable" };
      }
      if (isRefusal(realtime.status)) {
        return { ok: false, reason: "unauthorized", status: realtime.status };
      }
      if (realtime.status >= 500) {
        return { ok: false, reason: "server_error", status: realtime.status };
      }
      return {
        ok: true,
        latencyMs: realtime.latencyMs,
        protocol,
        models: [],
      };
    }
  }

  return models.status >= 500
    ? { ok: false, reason: "server_error", status: models.status }
    : { ok: false, reason: "not_found", status: models.status };
}

type TimedResponse =
  | { kind: "network" }
  | {
      kind: "response";
      ok: boolean;
      status: number;
      latencyMs: number;
      body: unknown;
    };

async function timedRequest(
  target: string,
  {
    headers,
    fetcher,
    signal,
    now,
    timeoutMs,
  }: {
    headers: Record<string, string>;
    fetcher: Fetcher;
    signal?: AbortSignal;
    now: () => number;
    timeoutMs: number;
  },
): Promise<TimedResponse> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  const started = now();
  try {
    const response = await fetcher(target, {
      method: "GET",
      headers,
      signal: controller.signal,
      redirect: "error",
    });
    const latencyMs = Math.max(0, Math.round(now() - started));
    let body: unknown = undefined;
    if (response.ok) {
      body = await response.json().catch(() => undefined);
    } else {
      await response.body?.cancel().catch(() => undefined);
    }
    return {
      kind: "response",
      ok: response.ok,
      status: response.status,
      latencyMs,
      body,
    };
  } catch {
    return { kind: "network" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

function modelIds(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { data?: unknown; models?: unknown };
  const list = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : null;
  if (!list) return null;

  return list
    .map((entry) =>
      typeof entry === "string"
        ? entry
        : entry && typeof entry === "object" && "id" in entry
          ? String((entry as { id: unknown }).id)
          : "",
    )
    .filter((id) => id.length > 0)
    .slice(0, MAX_MODELS);
}

// NeMo-Speech.cpp décrit chaque modèle de `/v1/models` par sa capacité
// (`transcription`, `diarization`…), ce qu'aucun serveur OpenAI ne fait : c'est
// ce qui le distingue d'un serveur OpenAI-compatible. Seuls les modèles de
// transcription sont proposés.
function nemoSpeechModels(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const list = (body as { data?: unknown }).data;
  if (!Array.isArray(list)) return null;
  const entries = list.filter(
    (entry): entry is { id: unknown; capability: unknown } =>
      !!entry && typeof entry === "object" && "capability" in entry,
  );
  if (entries.length === 0) return null;
  return entries
    .filter((entry) => entry.capability === "transcription")
    .map((entry) => String(entry.id))
    .filter((id) => id.length > 0)
    .slice(0, MAX_MODELS);
}

function isRefusal(status: number) {
  return status === 401 || status === 403;
}

// Même route que l'adaptateur owhisper-client : `/v1/audio/transcriptions/
// realtime` à la racine pour NeMo-Speech.cpp, sinon l'adresse saisie suivie de
// `/realtime`.
function realtimeUrl(url: URL, protocol: ServerProtocol | null) {
  const target = new URL(url.toString());
  const path = trimTrailingSlashes(target.pathname);
  target.search = "";
  target.hash = "";
  if (protocol === "nvidia") {
    target.pathname = "/v1/audio/transcriptions/realtime";
    return target.toString();
  }
  target.pathname = path.endsWith("/realtime") ? path : `${path}/realtime`;
  target.searchParams.set("intent", "transcription");
  return target.toString();
}

function trimTrailingSlashes(value: string) {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end--;
  return value.slice(0, end);
}
