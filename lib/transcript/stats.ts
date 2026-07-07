import type { Segment } from "@/lib/db/queries";

export type SpeakerStat = {
	speaker: string;
	index: number;
	seconds: number;
	sharePct: number;
};

export type TranscriptStats = {
	participants: number;
	durationSec: number;
	words: number;
	turns: number;
	speakers: SpeakerStat[];
};

/** Derive display stats from transcript segments. Pure — no I/O. */
export function computeStats(segments: Segment[]): TranscriptStats {
	if (segments.length === 0) {
		return {
			participants: 0,
			durationSec: 0,
			words: 0,
			turns: 0,
			speakers: [],
		};
	}

	const order: string[] = [];
	const seconds = new Map<string, number>();
	let words = 0;
	let durationSec = 0;

	for (const seg of segments) {
		if (!seconds.has(seg.speaker)) {
			seconds.set(seg.speaker, 0);
			order.push(seg.speaker);
		}
		seconds.set(
			seg.speaker,
			(seconds.get(seg.speaker) ?? 0) + (seg.end - seg.start),
		);
		words += seg.text.trim() ? seg.text.trim().split(/\s+/).length : 0;
		durationSec = Math.max(durationSec, seg.end);
	}

	const totalTalk = [...seconds.values()].reduce((a, b) => a + b, 0) || 1;

	const speakers: SpeakerStat[] = order
		.map((speaker) => ({
			speaker,
			index: order.indexOf(speaker),
			seconds: seconds.get(speaker) ?? 0,
			sharePct: Math.round(((seconds.get(speaker) ?? 0) / totalTalk) * 100),
		}))
		.sort((a, b) => b.seconds - a.seconds);

	return {
		participants: order.length,
		durationSec,
		words,
		turns: segments.length,
		speakers,
	};
}

export function formatDuration(sec: number): string {
	return `${Math.round(sec / 60)} min`;
}

export function formatClock(sec: number): string {
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}
