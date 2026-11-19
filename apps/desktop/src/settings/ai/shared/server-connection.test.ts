import { describe, expect, test, vi } from "vitest";

import { toConnectionState } from "./server-connection";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

describe("toConnectionState", () => {
  test("sans adresse, rien n'est à tester", () => {
    expect(toConnectionState("", { isFetching: false })).toEqual({
      status: "unconfigured",
    });
  });

  test("garde la capacité de diarisation annoncée par NeMo-Speech.cpp", () => {
    expect(
      toConnectionState("http://192.168.1.20:9000", {
        isFetching: false,
        data: {
          ok: true,
          latencyMs: 9,
          protocol: "nvidia",
          models: ["m"],
          speakerDiarization: false,
        },
      }),
    ).toEqual({
      status: "connected",
      latencyMs: 9,
      protocol: "nvidia",
      models: ["m"],
      speakerDiarization: false,
    });
  });

  test("non testé, en cours, connecté, injoignable", () => {
    const url = "http://localhost:8000/v1";
    expect(toConnectionState(url, { isFetching: false })).toEqual({
      status: "untested",
    });
    expect(
      toConnectionState(url, {
        isFetching: true,
        data: { ok: false, reason: "unreachable" },
      }),
    ).toEqual({ status: "testing" });
    expect(
      toConnectionState(url, {
        isFetching: false,
        data: { ok: true, latencyMs: 84, protocol: "openai", models: ["a"] },
      }),
    ).toEqual({
      status: "connected",
      latencyMs: 84,
      protocol: "openai",
      models: ["a"],
    });
    expect(
      toConnectionState(url, {
        isFetching: false,
        data: { ok: false, reason: "unreachable" },
      }),
    ).toEqual({
      status: "failed",
      failure: { ok: false, reason: "unreachable" },
    });
  });
});
