import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createListenerStore } from "./index";

// Données de la capsule pendant un import (issue 526).
describe("batch slice : suivi d'un import", () => {
  let store: ReturnType<typeof createListenerStore>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(5_000);
    store = createListenerStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("dates the start of each phase and keeps it while progressing", () => {
    store.getState().handleBatchStarted("s1");
    vi.setSystemTime(9_000);
    store.getState().updateBatchProgress("s1", 0.3);
    store.getState().handleBatchResponseStreamed("s1", {
      type: "progress",
      percentage: 0.4,
    });

    expect(store.getState().batch.s1?.startedAtMs).toBe(5_000);
    expect(store.getState().batch.s1?.percentage).toBe(0.4);
  });

  // Issue 568 : requête REST unique, puis repli sur le flux.
  test("flags an unknown progress until a measured one arrives", () => {
    store.getState().handleBatchStarted("s1");
    store.getState().handleBatchResponseStreamed("s1", {
      type: "progress",
      percentage: 0,
      indeterminate: true,
    });
    expect(store.getState().batch.s1?.indeterminate).toBe(true);

    store.getState().handleBatchResponseStreamed("s1", {
      type: "progress",
      percentage: 0,
      indeterminate: false,
    });
    expect(store.getState().batch.s1?.indeterminate).toBe(false);
    expect(store.getState().batch.s1?.startedAtMs).toBe(5_000);
  });

  test("keeps the audio duration across both phases until the import ends", () => {
    store.getState().handleImportStarted("s1", 600);
    store.getState().handleBatchStarted("s1", "importing");
    store.getState().clearBatchSession("s1");
    expect(store.getState().batchImport.s1).toEqual({ audioSeconds: 600 });

    store.getState().handleImportEnded("s1");
    expect(store.getState().batchImport.s1).toBeUndefined();
  });
});
