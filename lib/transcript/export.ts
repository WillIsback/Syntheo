import type { Segment } from "@/lib/db/queries";
import { formatClock } from "@/lib/transcript/stats";

/** Build a plain-text transcript and trigger a client-side download. RAM only. */
export function downloadTranscript(
	segments: Segment[],
	filename: string,
): void {
	if (segments.length === 0) return;
	const body = segments
		.map((s) => `[${formatClock(s.start)}] ${s.speaker}: ${s.text}`)
		.join("\n\n");
	const header =
		"Transcription générée par IA — susceptible d'erreurs.\n" +
		"AI-generated transcription — may contain errors.\n\n";
	const blob = new Blob([header + body], { type: "text/plain;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
