import { modelSupportsImageInput } from "./model-capabilities";

import { providerFetch } from "~/ai/provider-fetch";

// « Le modèle lit les images » (issue 754). Automatique : Syntheo demande au
// serveur de synthèse si le modèle lit les images, d'abord dans ses
// métadonnées quand il en publie, sinon par une requête minimale qui joint
// une petite image de test embarquée. Le résultat est gardé par adresse de
// serveur et par modèle, et relu à chaque génération : aucune sonde par
// synthèse. Sans réponse nette (réseau, délai, erreur du serveur), le nom du
// modèle tranche, comme avant. Oui et Non forcent le choix.
// La sonde ne part que vers le serveur configuré, et n'envoie aucune donnée
// de l'utilisateur : seulement l'image de test ci-dessous.

export type ImageInputChoice = "auto" | "yes" | "no";

export type ImageInputDetection = {
  reads: boolean;
  /** `metadata` : le serveur le publie ; `probe` : requête avec l'image de test. */
  source: "metadata" | "probe";
  /** Date ISO de la vérification. */
  checkedAt: string;
};

export type ImageInputEntry = {
  choice?: ImageInputChoice;
  detected?: ImageInputDetection;
};

export type ImageInputSettings = Record<string, ImageInputEntry>;

/** Image de test (96×64 : un disque bleu, une flèche, un carré orange). */
export const IMAGE_INPUT_PROBE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAIAAABqVuVZAAAA1ElEQVR42u3ZyQ0CMQwF0CnCdzqjDgqjJtoAxAkhzR7GmeR9pYE8KYvt4SmTGRAAAgQIECBAgAAJIECAAAECBAiQAAKUDHS53qvaxuMWRdYuoDfK2OodaIKmEqZMoIU6uUZpQKt0Eo1ygDbo/MMoImoE2qxT3Cg+ATQDNG10NNBOnbJG8RVAM0BjRqcHiqIBtJrpUKAiOj9GTQE5Yi5pz3yfQH7SSo2WitV6qnn9IB1FPemue9KmGi3MxUxWAQECBAiQAAIECBAgQIAACSBAgAABOkFefLuufJxwqGAAAAAASUVORK5CYII=";

/** Entrées gardées au plus : une par serveur et modèle essayés. */
const MAX_ENTRIES = 50;
const METADATA_TIMEOUT_MS = 3_000;
const PROBE_TIMEOUT_MS = 15_000;

/**
 * Refus explicite d'une image par le serveur. Textes relevés dans les
 * sources : vLLM « … is not a multimodal model » (vllm/entrypoints/
 * chat_utils.py), llama.cpp « image input is not supported » (tools/server/
 * server-common.cpp), Ollama « does not support » suivi de « vision »
 * (server/images.go) ; plus les formulations voisines des passerelles.
 */
const IMAGE_REFUSAL_RE =
  /not a multimodal model|does not support (?:vision|images?|multimodal)|image input is not supported|at most 0 image|images? (?:are |is )?not supported|unsupported (?:image|content type)|multimodal (?:input |data )?(?:is |are )?not supported/i;

export function imageInputKey(baseUrl: string, model: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}|${model.trim()}`;
}

export function parseImageInputSettings(value: unknown): ImageInputSettings {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: ImageInputSettings = {};
    for (const [key, raw] of Object.entries(parsed)) {
      const entry = parseEntry(raw);
      if (entry) out[key] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

function parseEntry(raw: unknown): ImageInputEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const entry: ImageInputEntry = {};
  if (
    value.choice === "auto" ||
    value.choice === "yes" ||
    value.choice === "no"
  ) {
    entry.choice = value.choice;
  }
  const detected = value.detected as Record<string, unknown> | undefined;
  if (
    detected &&
    typeof detected.reads === "boolean" &&
    (detected.source === "metadata" || detected.source === "probe") &&
    typeof detected.checkedAt === "string"
  ) {
    entry.detected = {
      reads: detected.reads,
      source: detected.source,
      checkedAt: detected.checkedAt,
    };
  }
  return entry;
}

/** Réglages mis à jour pour une entrée, bornés aux dernières entrées. */
export function withImageInputEntry(
  settings: ImageInputSettings,
  key: string,
  update: (entry: ImageInputEntry) => ImageInputEntry,
): string {
  const { [key]: current, ...others } = settings;
  const entries = Object.entries(others).slice(-(MAX_ENTRIES - 1));
  return JSON.stringify(
    Object.fromEntries([...entries, [key, update(current ?? {})]]),
  );
}

export type ImageInputDecision = {
  reads: boolean;
  /** `forced` : Oui ou Non ; `detected` : vérifié ; `name` : repli sur le nom. */
  basis: "forced" | "detected" | "name";
};

/** Le modèle reçoit-il les images de la note ? */
export function decideImageInput(
  entry: ImageInputEntry | undefined,
  model: string,
): ImageInputDecision {
  if (entry?.choice === "yes") return { reads: true, basis: "forced" };
  if (entry?.choice === "no") return { reads: false, basis: "forced" };
  if (entry?.detected)
    return { reads: entry.detected.reads, basis: "detected" };
  return { reads: modelSupportsImageInput("custom", model), basis: "name" };
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

type DetectOptions = {
  fetcher?: Fetcher;
  signal?: AbortSignal;
  now?: () => Date;
  metadataTimeoutMs?: number;
  probeTimeoutMs?: number;
};

/**
 * Le modèle lit-il les images ? `null` quand rien n'a répondu nettement :
 * l'appelant garde alors le repli sur le nom du modèle.
 */
export async function detectImageInput(
  {
    baseUrl,
    apiKey,
    model,
  }: { baseUrl: string; apiKey: string; model: string },
  {
    fetcher = providerFetch as Fetcher,
    signal,
    now = () => new Date(),
    metadataTimeoutMs = METADATA_TIMEOUT_MS,
    probeTimeoutMs = PROBE_TIMEOUT_MS,
  }: DetectOptions = {},
): Promise<ImageInputDetection | null> {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base || !model.trim()) return null;
  const headers: Record<string, string> = apiKey.trim()
    ? { Authorization: `Bearer ${apiKey.trim()}` }
    : {};
  const send = (url: string, init: RequestInit, timeoutMs: number) =>
    timedFetch(
      fetcher,
      url,
      { ...init, headers: { ...headers, ...init.headers } },
      timeoutMs,
      signal,
    );
  const at = () => now().toISOString();

  const fromMetadata = await readMetadata(base, model, (url, init) =>
    send(url, init, metadataTimeoutMs),
  );
  if (fromMetadata !== null) {
    return { reads: fromMetadata, source: "metadata", checkedAt: at() };
  }

  const response = await send(
    `${base}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        stream: false,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Reply with OK." },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${IMAGE_INPUT_PROBE_PNG}`,
                },
              },
            ],
          },
        ],
      }),
    },
    probeTimeoutMs,
  );
  if (!response) return null;
  if (response.ok) return { reads: true, source: "probe", checkedAt: at() };
  const body = await response.text().catch(() => "");
  if (IMAGE_REFUSAL_RE.test(body)) {
    return { reads: false, source: "probe", checkedAt: at() };
  }
  return null;
}

/**
 * Métadonnées publiées par le serveur, vérifiées dans leurs sources :
 * Ollama `POST /api/show` → `capabilities` (contient « vision ») ;
 * LM Studio `GET /api/v0/models` → `type` (« vlm » ou « llm ») ;
 * llama.cpp `GET /props` → `modalities.vision`. vLLM n'en publie pas.
 */
async function readMetadata(
  base: string,
  model: string,
  send: (url: string, init: RequestInit) => Promise<Response | null>,
): Promise<boolean | null> {
  const root = base.replace(/\/v1$/, "");
  const json = async (response: Response | null) => {
    if (!response?.ok) return null;
    try {
      return (await response.json()) as unknown;
    } catch {
      return null;
    }
  };
  const [ollama, lmStudio, llamaCpp] = await Promise.all([
    send(`${root}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    }).then(json),
    send(`${root}/api/v0/models`, { method: "GET" }).then(json),
    send(`${root}/props`, { method: "GET" }).then(json),
  ]);

  const capabilities = (ollama as { capabilities?: unknown } | null)
    ?.capabilities;
  if (Array.isArray(capabilities)) return capabilities.includes("vision");

  const listed = (lmStudio as { data?: unknown } | null)?.data;
  if (Array.isArray(listed)) {
    const entry = listed.find(
      (item) => (item as { id?: unknown })?.id === model,
    ) as { type?: unknown } | undefined;
    if (entry?.type === "vlm") return true;
    if (entry?.type === "llm") return false;
  }

  const vision = (llamaCpp as { modalities?: { vision?: unknown } } | null)
    ?.modalities?.vision;
  if (typeof vision === "boolean") return vision;

  return null;
}

async function timedFetch(
  fetcher: Fetcher,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
