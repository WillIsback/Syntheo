import { describe, expect, it, vi } from "vitest";

global.fetch = vi.fn();

import { pollJob, submitTranscription } from "../client";

describe("submitTranscription", () => {
	it("returns jobId from WhisperX response", async () => {
		(fetch as any).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ job_id: "job-123", status: "pending" }),
		});
		const blob = new Blob(["audio"], { type: "audio/wav" });
		const result = await submitTranscription(blob, "fr");
		expect(result.jobId).toBe("job-123");
	});
});

describe("pollJob", () => {
	it("returns null when job is still pending", async () => {
		(fetch as any).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ status: "pending" }),
		});
		const result = await pollJob("job-123");
		expect(result).toBeNull();
	});

	it("returns segments when completed", async () => {
		(fetch as any).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				status: "completed",
				job_id: "job-123",
				duration_s: 10,
				num_speakers: 2,
				segments: [{ start: 0, end: 3, speaker: "SPEAKER_00", text: "Hello" }],
			}),
		});
		const result = await pollJob("job-123");
		expect(result?.segments[0].text).toBe("Hello");
	});
});
