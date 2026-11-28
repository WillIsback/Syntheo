import { modelSupportsImageInput } from "./model-capabilities";

import { providerFetch } from "~/ai/provider-fetch";

// « Le modèle lit les images » (issue 754). Automatique : Syntheo demande au
// serveur de synthèse si le modèle lit les images, d'abord dans ses
// métadonnées quand il en publie, sinon par une requête minimale qui joint
// une petite image de test embarquée. Le résultat est gardé par adresse de
// serveur et par modèle, et relu à chaque génération : aucune sonde par
// synthèse. Sans réponse nette (réseau, délai, erreur du serveur, réponse
// ambiguë), le nom du modèle tranche, comme avant. Oui et Non forcent le
// choix. « Tester avec une image » envoie toujours l'image de test, même
// quand le serveur publie des métadonnées (issue 771).
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

/**
 * Image de test (96×64, fond blanc : un disque bleu, une flèche noire, un
 * carré orange). La sonde demande la couleur du disque : seule une réponse
 * « bleu » prouve que le modèle a vu l'image.
 */
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

/** Question posée avec l'image de test ; la réponse attendue est « blue ». */
export const IMAGE_INPUT_PROBE_QUESTION =
  "What color is the circle in this image? Answer with one word.";
/** Assez de place pour un modèle qui raisonne avant de répondre. */
const PROBE_MAX_TOKENS = 64;
const PROBE_EXPECTED_RE = /\b(?:blue|bleue?)\b/i;
/**
 * Le modèle dit ne pas voir d'image : même s'il cite le bleu ensuite (« I
 * cannot see any image, but it might be blue »), il devine, et la réponse
 * ne prouve pas que l'image a été lue.
 */
const PROBE_NO_IMAGE_RE =
  /\b(?:can ?not|can['’]t|could(?: not|n['’]t)|do(?:es)?(?: not|n['’]t)|unable to|not able to) (?:see|view|access|read|open|process|perceive|look at)\b|\bno (?:image|picture|attachment|visual)|\bpas d['’](?:image|illustration)|\bne (?:vois|distingue) (?:pas|aucune?|rien)\b|\bje ne peux pas (?:voir|lire|afficher|ouvrir)\b|\bn['’]arrive pas à (?:voir|lire)\b|\baucune image\b/i;

/**
 * Pourquoi l'envoi de l'image de test ne tranche pas :
 * - `unreachable` : pas de réponse (réseau, délai dépassé) ;
 * - `error` : erreur du serveur sans refus explicite de l'image (clé
 *   refusée, 5xx, 4xx d'une autre nature) ;
 * - `no-answer` : le serveur accepte la requête (2xx) mais ne renvoie aucun
 *   texte lisible (corps non JSON, `choices` vide, réponse vide ou coupée
 *   avant la fin du raisonnement) : rien ne dit que l'image a été lue ;
 * - `unrelated` : le serveur accepte la requête et le modèle répond, mais
 *   pas la couleur du disque, ou dit ne pas voir d'image même s'il devine
 *   ensuite « bleu ». Une passerelle peut retirer l'image sans le
 *   dire, ou un modèle texte répondre au hasard : la requête acceptée ne
 *   prouve pas que l'image a été lue.
 * Dans ces cas rien n'est gardé : le nom du modèle sert de repli, et Oui ou
 * Non reste au choix de l'utilisateur.
 */
export type ImageProbeUnclearReason =
  | "unreachable"
  | "error"
  | "no-answer"
  | "unrelated";

export type ImageProbeResult =
  | { status: "reads"; detection: ImageInputDetection }
  | { status: "refused"; detection: ImageInputDetection }
  | { status: "unclear"; reason: ImageProbeUnclearReason };

/**
 * Résultat d'Automatique. Sans réponse nette, la raison reste connue : un
 * serveur qui a répondu sans décrire l'image (issue 784) n'est pas un
 * serveur injoignable, et le texte de la carte le dit.
 */
export type ImageDetectionResult =
  | { status: "detected"; detection: ImageInputDetection }
  | { status: "unclear"; reason: ImageProbeUnclearReason };

/** Le serveur a répondu (2xx) sans que le modèle décrive l'image. */
export function serverAnsweredWithoutImage(
  reason: ImageProbeUnclearReason,
): boolean {
  return reason === "unrelated" || reason === "no-answer";
}

type ServerTarget = { baseUrl: string; apiKey: string; model: string };

function prepare(
  { baseUrl, apiKey, model }: ServerTarget,
  {
    fetcher = providerFetch as Fetcher,
    signal,
    now = () => new Date(),
  }: DetectOptions,
) {
  const base = baseUrl.trim().replace(/\/+$/, "");
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
  return {
    base,
    model: model.trim(),
    send,
    at: () => now().toISOString(),
  };
}

/**
 * Automatique : le modèle lit-il les images ? Les métadonnées du serveur
 * d'abord, sinon l'envoi de l'image de test. « unclear » quand rien n'a
 * répondu nettement : l'appelant garde alors le repli sur le nom du modèle.
 */
export async function detectImageInput(
  server: ServerTarget,
  options: DetectOptions = {},
): Promise<ImageDetectionResult> {
  const { base, model, send, at } = prepare(server, options);
  if (!base || !model) return { status: "unclear", reason: "unreachable" };
  const metadataTimeoutMs = options.metadataTimeoutMs ?? METADATA_TIMEOUT_MS;

  const fromMetadata = await readMetadata(base, model, (url, init) =>
    send(url, init, metadataTimeoutMs),
  );
  if (fromMetadata !== null) {
    return {
      status: "detected",
      detection: { reads: fromMetadata, source: "metadata", checkedAt: at() },
    };
  }

  const probed = await probeImageInput(server, options);
  return probed.status === "unclear"
    ? probed
    : { status: "detected", detection: probed.detection };
}

/**
 * « Tester avec une image » : envoie toujours l'image de test, sans lire les
 * métadonnées, et ne conclut que sur la réponse du modèle (issue 771).
 */
export async function probeImageInput(
  server: ServerTarget,
  options: DetectOptions = {},
): Promise<ImageProbeResult> {
  const { base, model, send, at } = prepare(server, options);
  if (!base || !model) return { status: "unclear", reason: "unreachable" };
  const detection = (reads: boolean): ImageInputDetection => ({
    reads,
    source: "probe",
    checkedAt: at(),
  });

  const response = await send(
    `${base}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        // Pas de `temperature` : certains modèles qui raisonnent la refusent
        // ou imposent la leur, et la réponse attendue n'en dépend pas.
        max_tokens: PROBE_MAX_TOKENS,
        stream: false,
        messages: [
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
        ],
      }),
    },
    options.probeTimeoutMs ?? PROBE_TIMEOUT_MS,
  );
  if (!response) return { status: "unclear", reason: "unreachable" };

  const body = await response.text().catch(() => "");
  if (!response.ok) {
    return IMAGE_REFUSAL_RE.test(body)
      ? { status: "refused", detection: detection(false) }
      : { status: "unclear", reason: "error" };
  }
  const answer = probeAnswerText(body);
  if (!answer.trim()) return { status: "unclear", reason: "no-answer" };
  return PROBE_EXPECTED_RE.test(answer) && !PROBE_NO_IMAGE_RE.test(answer)
    ? { status: "reads", detection: detection(true) }
    : { status: "unclear", reason: "unrelated" };
}

/**
 * Texte de la réponse : le contenu du message. Le raisonnement que certains
 * serveurs renvoient à part (`reasoning_content`, `reasoning`) n'est lu que
 * si le contenu est vide, pour un modèle coupé avant sa réponse finale : un
 * raisonnement qui envisage « bleu » ne doit pas l'emporter sur une réponse
 * finale qui dit autre chose.
 */
function probeAnswerText(body: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return "";
  }
  const message = (
    parsed as { choices?: Array<{ message?: Record<string, unknown> }> } | null
  )?.choices?.[0]?.message;
  if (!message) return "";
  const text = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (!Array.isArray(value)) return "";
    return value
      .map((part) => (part as { text?: unknown } | null)?.text)
      .filter((part): part is string => typeof part === "string")
      .join("\n");
  };
  for (const field of [
    message.content,
    message.reasoning_content,
    message.reasoning,
  ]) {
    const found = text(field);
    if (found.trim()) return found;
  }
  return "";
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
