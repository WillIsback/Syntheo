import { streamText } from "ai";
import type { NextRequest } from "next/server";
import {
	getVllmProvider,
	REPORT_SYSTEM_PROMPT,
	VLLM_MODEL,
} from "@/lib/vllm/client";

export async function POST(req: NextRequest) {
	const userId = req.headers.get("x-user-id");
	if (!userId) return new Response("Unauthorized", { status: 401 });

	const body = await req.json();
	const { transcriptionText, sessionId } = body;

	if (!transcriptionText)
		return new Response("Missing transcriptionText", { status: 400 });
	if (!sessionId) return new Response("Missing sessionId", { status: 400 });

	const provider = getVllmProvider();

	const result = streamText({
		model: provider(VLLM_MODEL),
		system: REPORT_SYSTEM_PROMPT,
		prompt: `Transcription:\n\n${transcriptionText}`,
		maxOutputTokens: 1024,
		// Task 9: MLflow logging added here
	});

	return result.toTextStreamResponse();
}
