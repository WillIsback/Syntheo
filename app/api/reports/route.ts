import { streamText } from "ai";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { createReport } from "@/lib/db/queries";
import { logVllmRun } from "@/lib/mlflow/client";
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
	const startMs = Date.now();

	const result = streamText({
		model: provider(VLLM_MODEL),
		system: REPORT_SYSTEM_PROMPT,
		prompt: `Transcription:\n\n${transcriptionText}`,
		maxOutputTokens: 1024,
		onFinish: async ({ text, usage }) => {
			const latencyMs = Date.now() - startMs;
			const { runId } = await logVllmRun({
				promptTokens: usage.inputTokens ?? 0,
				completionTokens: usage.outputTokens ?? 0,
				latencyMs,
				modelName: VLLM_MODEL,
				modelVersion: "latest",
			});
			const client = await getDb(userId);
			try {
				await createReport(client, {
					sessionId,
					contentPlain: text,
					vllmRunId: runId,
					modelVersion: VLLM_MODEL,
				});
			} finally {
				client.release();
			}
		},
	});

	return result.toTextStreamResponse();
}
