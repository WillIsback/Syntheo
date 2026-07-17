import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

const MODEL_ID = "mistralai/Mistral-Small-3.2-24B-Instruct-2506";

const COMPTE_RENDU_SYSTEM_PROMPT =
  "Tu es un assistant spécialisé dans la rédaction de comptes rendus de réunion professionnels en français.\n" +
  "Tu reçois une transcription de réunion et un modèle de compte rendu. Suis exactement les sections définies par le modèle (titres marqués avec #).\n" +
  "Sois concis, factuel et professionnel. Synthétise les échanges — ne retranscris pas mot pour mot.\n" +
  "Tu réponds UNIQUEMENT avec un objet JSON valide, sans balises markdown, sans texte avant ou après.\n" +
  'Format attendu : {"sections":[{"title":"Titre de la section","body":"Contenu rédigé."}]}';

const TEMPLATE_GEN_SYSTEM_PROMPT =
  "Tu es un assistant qui génère des modèles de compte rendu de réunion.\n" +
  "L'utilisateur décrit un type de réunion. Tu génères un modèle en markdown.\n" +
  "Utilise `#` pour chaque titre de section, suivi d'une description de ce que la section doit contenir.\n" +
  "Génère entre 3 et 6 sections pertinentes. Réponds UNIQUEMENT avec le texte markdown, sans balise code, sans texte avant ou après.";

function buildTranscript(
  segments: Array<{ speaker: string; text: string; start: number }>,
  speakerNames: Record<string, string>,
): string {
  return segments
    .map((seg) => {
      const name = speakerNames[seg.speaker] ?? seg.speaker;
      const mm = String(Math.floor(seg.start / 60)).padStart(2, "0");
      const ss = String(Math.floor(seg.start) % 60).padStart(2, "0");
      return `[${mm}:${ss}] ${name} : ${seg.text.trim()}`;
    })
    .join("\n");
}

function extractSectionTitles(content: string): string[] {
  return content
    .split("\n")
    .filter((line) => line.startsWith("#"))
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter(Boolean);
}

function formatSectionBody(body: unknown): string {
  if (typeof body === "string") return body;
  if (Array.isArray(body)) return body.join(". ");
  return "";
}

function parseSections(
  text: string,
  expectedTitles: string[],
): Array<{ title: string; body: string }> {
  const withoutOpeningFence = text.replace(/^```(?:json)?\s*/i, "").trim();
  const cleaned = withoutOpeningFence.endsWith("```")
    ? withoutOpeningFence.slice(0, -3).trim()
    : withoutOpeningFence;

  const parsed: unknown = JSON.parse(cleaned);

  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "sections" in parsed &&
    Array.isArray((parsed as { sections: unknown }).sections)
  ) {
    const sections = (
      parsed as { sections: Array<{ title?: unknown; body?: unknown }> }
    ).sections;
    return sections.map((s, i) => ({
      title:
        typeof s.title === "string"
          ? s.title
          : (expectedTitles[i] ?? `Section ${i + 1}`),
      body: typeof s.body === "string" ? s.body : "",
    }));
  }

  if (parsed !== null && typeof parsed === "object") {
    return Object.entries(parsed as Record<string, unknown>).map(
      ([title, body]) => ({ title, body: formatSectionBody(body) }),
    );
  }

  throw new Error("Unexpected LLM response shape");
}

function makeAlbertClient() {
  return createOpenAICompatible({
    name: "albert",
    baseURL: process.env.LLM_BAS_URL ?? "",
    apiKey: process.env.LLM_API_KEY ?? "",
  });
}

export const generateCompteRendu = async (params: {
  templateContent: string;
  segments: Array<{ speaker: string; text: string; start: number }>;
  speakerNames: Record<string, string>;
  filename: string;
}): Promise<Array<{ title: string; body: string }>> => {
  const albert = makeAlbertClient();
  const transcript = buildTranscript(params.segments, params.speakerNames);
  const expectedTitles = extractSectionTitles(params.templateContent);

  const prompt =
    `Fichier : ${params.filename}\n\n` +
    `<transcription>\n${transcript}\n</transcription>\n\n` +
    `<modele>\n${params.templateContent}\n</modele>`;

  const { text } = await generateText({
    model: albert(MODEL_ID),
    system: COMPTE_RENDU_SYSTEM_PROMPT,
    prompt,
  });

  return parseSections(text, expectedTitles);
};

export const generateTemplateContent = async (
  description: string,
): Promise<string> => {
  const albert = makeAlbertClient();

  const { text } = await generateText({
    model: albert(MODEL_ID),
    system: TEMPLATE_GEN_SYSTEM_PROMPT,
    prompt: `<description>\n${description}\n</description>`,
  });

  return text.trim();
};
