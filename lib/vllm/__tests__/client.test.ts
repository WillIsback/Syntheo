import { describe, expect, it } from "vitest";
import { getVllmProvider } from "../client";

describe("getVllmProvider", () => {
	it("returns a provider with correct baseURL", () => {
		process.env.VLLM_BASE_URL = "http://vllm:8000/v1";
		const provider = getVllmProvider();
		expect(provider).toBeDefined();
		expect(typeof provider).toBe("function");
	});
});
