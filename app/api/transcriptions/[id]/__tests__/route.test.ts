import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/db/queries", () => ({
	updateTranscriptionSpeakers: vi.fn().mockResolvedValue(undefined),
}));

import { getDb } from "@/lib/db/client";
import { updateTranscriptionSpeakers } from "@/lib/db/queries";
import { PATCH } from "../route";

const mockClient = { release: vi.fn(), query: vi.fn() };
// biome-ignore lint/suspicious/noExplicitAny: vitest mock cast required
(getDb as any).mockResolvedValue(mockClient);

const SEGMENTS = [
	{ start: 0, end: 5.2, speaker: "Alice", text: "Bonjour tout le monde." },
	{ start: 5.5, end: 10.1, speaker: "Bob", text: "Merci d'être là." },
];

function makeRequest(
	transcriptionId: string,
	body: unknown,
	headers: Record<string, string> = {},
) {
	return new NextRequest(
		`http://localhost/api/transcriptions/${transcriptionId}`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json", ...headers },
			body: JSON.stringify(body),
		},
	);
}

describe("PATCH /api/transcriptions/[id]", () => {
	it("returns 401 when x-user-id header is missing", async () => {
		const req = makeRequest("tx-uuid", { segments: SEGMENTS });
		const params = Promise.resolve({ id: "tx-uuid" });
		const res = await PATCH(req, { params });
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error).toBe("Unauthorized");
	});

	it("calls updateTranscriptionSpeakers and returns ok:true", async () => {
		const req = makeRequest(
			"tx-uuid",
			{ segments: SEGMENTS },
			{ "x-user-id": "user-uuid" },
		);
		const params = Promise.resolve({ id: "tx-uuid" });
		const res = await PATCH(req, { params });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(updateTranscriptionSpeakers).toHaveBeenCalledWith(
			mockClient,
			"tx-uuid",
			SEGMENTS,
		);
		expect(mockClient.release).toHaveBeenCalled();
	});

	it("releases client even when updateTranscriptionSpeakers throws", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: vitest mock cast required
		(updateTranscriptionSpeakers as any).mockRejectedValueOnce(
			new Error("DB failure"),
		);
		const req = makeRequest(
			"tx-uuid",
			{ segments: SEGMENTS },
			{ "x-user-id": "user-uuid" },
		);
		const params = Promise.resolve({ id: "tx-uuid" });
		await expect(PATCH(req, { params })).rejects.toThrow("DB failure");
		expect(mockClient.release).toHaveBeenCalled();
	});
});
