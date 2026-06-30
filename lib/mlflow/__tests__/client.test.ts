import { describe, expect, it, vi } from "vitest";

global.fetch = vi.fn();

import { logWhisperXRun } from "../client";

describe("logWhisperXRun", () => {
	it("creates run and logs params, returns runId", async () => {
		(fetch as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ experiment_id: "exp-1" }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ run: { info: { run_id: "run-abc" } } }),
			})
			.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
			.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

		const result = await logWhisperXRun({
			durationAudioS: 42,
			durationInferenceMs: 5000,
			numSpeakers: 2,
			languageDetected: "fr",
			modelName: "whisper-large-v3",
			modelVersion: "latest",
		});

		expect(result.runId).toBe("run-abc");
	});
});
