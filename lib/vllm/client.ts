import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const VLLM_MODEL = process.env.VLLM_MODEL ?? "mistral-7b-instruct";

export function getVllmProvider() {
	return createOpenAICompatible({
		name: "vllm",
		baseURL: process.env.VLLM_BASE_URL ?? "http://vllm:8000/v1",
		apiKey: process.env.VLLM_API_KEY ?? "none",
	});
}

export const REPORT_SYSTEM_PROMPT = `Tu es un assistant qui génère des comptes rendus de réunion professionnels et concis.
You are an assistant that generates concise, professional meeting reports.

Rules:
- Structure: Participants, Points abordés / Topics covered, Décisions actées / Decisions made, Actions / Action items
- Neutral, factual tone
- French by default, bilingual if English detected
- Never invent content not present in the transcript
- Start directly with the report — no preamble`;
