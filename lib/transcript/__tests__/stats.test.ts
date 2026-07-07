import { describe, expect, it } from "vitest";
import type { Segment } from "@/lib/db/queries";
import {
	computeStats,
	formatClock,
	formatDuration,
} from "@/lib/transcript/stats";

const segments: Segment[] = [
	{ start: 0, end: 10, speaker: "SPEAKER_00", text: "bonjour à tous" }, // 3 words, 10s
	{ start: 10, end: 40, speaker: "SPEAKER_01", text: "ok merci" }, //     2 words, 30s
	{ start: 40, end: 60, speaker: "SPEAKER_00", text: "on continue" }, //  2 words, 20s
];

describe("computeStats", () => {
	it("counts participants, duration, words, turns", () => {
		const s = computeStats(segments);
		expect(s.participants).toBe(2);
		expect(s.durationSec).toBe(60);
		expect(s.words).toBe(7);
		expect(s.turns).toBe(3);
	});

	it("computes per-speaker share sorted by talk time desc", () => {
		const s = computeStats(segments);
		// SPEAKER_00: 30s, SPEAKER_01: 30s -> 50/50, order stable by first appearance on tie
		expect(s.speakers).toHaveLength(2);
		expect(s.speakers[0].speaker).toBe("SPEAKER_00");
		expect(s.speakers[0].seconds).toBe(30);
		expect(s.speakers[0].sharePct).toBe(50);
		expect(s.speakers[0].index).toBe(0);
		expect(s.speakers[1].index).toBe(1);
	});

	it("preserves first-appearance order in index when sort order differs", () => {
		// Fixture: SPEAKER_00 appears first but talks less, SPEAKER_01 appears second but talks more
		const discriminatingSegments: Segment[] = [
			{ start: 0, end: 5, speaker: "SPEAKER_00", text: "hi" }, // 5s, appears first
			{ start: 5, end: 55, speaker: "SPEAKER_01", text: "ok thanks a lot" }, // 50s, appears second
		];
		const s = computeStats(discriminatingSegments);
		expect(s.speakers).toHaveLength(2);
		// Sorted by talk time: SPEAKER_01 (50s) comes first
		expect(s.speakers[0].speaker).toBe("SPEAKER_01");
		expect(s.speakers[0].seconds).toBe(50);
		expect(s.speakers[0].index).toBe(1); // appeared second
		// SPEAKER_00 (5s) comes second in sorted order
		expect(s.speakers[1].speaker).toBe("SPEAKER_00");
		expect(s.speakers[1].seconds).toBe(5);
		expect(s.speakers[1].index).toBe(0); // appeared first — index NOT post-sort position
	});

	it("handles empty input without dividing by zero", () => {
		const s = computeStats([]);
		expect(s).toEqual({
			participants: 0,
			durationSec: 0,
			words: 0,
			turns: 0,
			speakers: [],
		});
	});
});

describe("formatters", () => {
	it("formatDuration rounds to whole minutes", () => {
		expect(formatDuration(60)).toBe("1 min");
		expect(formatDuration(150)).toBe("3 min"); // 2.5 -> 3
		expect(formatDuration(0)).toBe("0 min");
	});
	it("formatClock renders M:SS", () => {
		expect(formatClock(0)).toBe("0:00");
		expect(formatClock(75)).toBe("1:15");
	});
});
