import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/db/queries", () => ({
	createSession: vi.fn().mockResolvedValue({ id: "sess-uuid" }),
}));

import { getDb } from "@/lib/db/client";
import { createSession } from "@/lib/db/queries";
import { POST } from "../route";

const mockClient = { release: vi.fn(), query: vi.fn() };
// biome-ignore lint/suspicious/noExplicitAny: vitest mock cast required
(getDb as any).mockResolvedValue(mockClient);

describe("POST /api/sessions", () => {
	it("creates session and returns sessionId", async () => {
		const req = new NextRequest("http://localhost/api/sessions", {
			method: "POST",
			headers: { "x-user-id": "user-uuid", "x-forwarded-for": "127.0.0.1" },
			body: JSON.stringify({ consentHash: "abc", consentVersion: "1.0" }),
		});
		const res = await POST(req);
		const body = await res.json();
		expect(res.status).toBe(201);
		expect(body.sessionId).toBe("sess-uuid");
		expect(createSession).toHaveBeenCalledWith(
			mockClient,
			expect.objectContaining({ consentHash: "abc", consentVersion: "1.0" }),
		);
	});

	it("returns 401 without user header", async () => {
		const req = new NextRequest("http://localhost/api/sessions", {
			method: "POST",
			body: JSON.stringify({ consentHash: "abc", consentVersion: "1.0" }),
		});
		const res = await POST(req);
		expect(res.status).toBe(401);
	});
});
