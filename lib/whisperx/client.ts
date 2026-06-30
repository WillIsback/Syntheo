import type { Segment } from "@/lib/db/queries";

const WHISPERX_URL = process.env.WHISPERX_URL ?? "http://whisperx:30050";
const WHISPERX_API_KEY = process.env.WHISPERX_API_KEY ?? "";

export interface WhisperXResult {
	jobId: string;
	status: "completed" | "failed";
	segments: Segment[];
	numSpeakers: number;
	durationS: number;
}

export async function submitTranscription(
	audio: Blob,
	language = "fr",
): Promise<{ jobId: string }> {
	const form = new FormData();
	form.append("audio_file", audio, "audio.wav");
	form.append("language", language);

	const res = await fetch(`${WHISPERX_URL}/asr/v1/transcribe`, {
		method: "POST",
		headers: { Authorization: `Bearer ${WHISPERX_API_KEY}` },
		body: form,
	});
	if (!res.ok) throw new Error(`WhisperX submit failed: ${res.status}`);
	const data = await res.json();
	return { jobId: data.job_id };
}

export async function pollJob(jobId: string): Promise<WhisperXResult | null> {
	const res = await fetch(`${WHISPERX_URL}/asr/v1/jobs/${jobId}`, {
		headers: { Authorization: `Bearer ${WHISPERX_API_KEY}` },
	});
	if (!res.ok) throw new Error(`WhisperX poll failed: ${res.status}`);
	const data = await res.json();
	if (data.status === "pending" || data.status === "processing") return null;
	return {
		jobId: data.job_id,
		status: data.status,
		segments: (data.segments ?? []) as Segment[],
		numSpeakers: data.num_speakers ?? 0,
		durationS: data.duration_s ?? 0,
	};
}
