import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { expect, test, vi } from "vitest";

import { listCustomModels } from "./list-openai";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

test("discovers models from an authenticated local provider that rejects foreign origins", async () => {
  vi.mocked(tauriFetch).mockImplementation(async (_input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get("Origin") !== "")
      return new Response(null, { status: 403 });
    if (headers.get("Authorization") !== "Bearer local-key")
      return new Response(null, { status: 401 });
    return Response.json({
      data: [{ id: "mtplx-qwen38-27b-optimized-quality" }],
    });
  });

  const result = await listCustomModels(
    "http://127.0.0.1:8000/v1",
    "local-key",
  );
  expect(result.models).toEqual(["mtplx-qwen38-27b-optimized-quality"]);
});
