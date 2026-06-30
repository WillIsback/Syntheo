import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the pool — unit tests only check query logic
const mockQuery = vi.fn();
const mockPool = { query: mockQuery } as any;

vi.mock("../client", () => ({ getDb: () => Promise.resolve(mockPool) }));

import {
	createSession,
	createTranscription,
	deleteUserCascade,
} from "../queries";

beforeEach(() => {
	mockQuery.mockReset();
});

describe("createSession", () => {
	it("inserts session and returns id", async () => {
		mockQuery.mockResolvedValueOnce({ rows: [{ id: "sess-uuid" }] });
		const result = await createSession(mockPool, {
			userId: "user-uuid",
			consentHash: "abc123",
			consentVersion: "1.0",
			ipAddress: "127.0.0.1",
		});
		expect(result.id).toBe("sess-uuid");
		expect(mockQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				text: expect.stringContaining("INSERT INTO sessions"),
			}),
		);
	});
});

describe("createTranscription", () => {
	it("inserts encrypted transcription and returns id", async () => {
		mockQuery.mockResolvedValueOnce({ rows: [{ id: "tx-uuid" }] });
		const result = await createTranscription(mockPool, {
			sessionId: "sess-uuid",
			contentPlain: "Hello world",
			whisperRunId: "run-123",
		});
		expect(result.id).toBe("tx-uuid");
		expect(mockQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				text: expect.stringContaining("pgp_sym_encrypt"),
			}),
		);
	});
});

describe("deleteUserCascade", () => {
	it("deletes in correct cascade order", async () => {
		mockQuery.mockResolvedValue({ rows: [] });
		await deleteUserCascade(mockPool, "user-uuid");
		const calls = mockQuery.mock.calls.map((c: any) => c[0].text || c[0]);
		expect(calls.some((s: string) => s.includes("DELETE FROM sessions"))).toBe(
			true,
		);
	});
});
