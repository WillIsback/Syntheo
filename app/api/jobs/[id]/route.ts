import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { createTranscription } from "@/lib/db/queries";
import { logWhisperXRun } from "@/lib/mlflow/client";
import { pollJob } from "@/lib/whisperx/client";

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const userId = req.headers.get("x-user-id");
	if (!userId)
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { id } = await params;
	const sessionId = req.nextUrl.searchParams.get("session_id");

	const result = await pollJob(id);
	if (!result) return NextResponse.json({ status: "pending" });

	// First completed response: log MLflow run and persist transcription to DB
	if (sessionId) {
		const { runId } = await logWhisperXRun({
			durationAudioS: result.durationS ?? 0,
			durationInferenceMs: 0,
			numSpeakers: result.numSpeakers ?? 0,
			languageDetected: "fr",
			modelName: "whisper-large-v3",
			modelVersion: "latest",
		});

		const client = await getDb(userId);
		try {
			const contentPlain = result.segments
				.map((s) => `[${s.speaker}] ${s.text}`)
				.join("\n");
			await createTranscription(client, {
				sessionId,
				contentPlain,
				whisperRunId: runId,
				speakers: result.segments,
			});
		} finally {
			client.release();
		}

		return NextResponse.json({ ...result, mlflowRunId: runId });
	}

	return NextResponse.json(result);
}
