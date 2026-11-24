import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  record: vi.fn(async () => {}),
  clear: vi.fn(async () => {}),
  notify: vi.fn(),
}));

vi.mock("~/session/transcription-failure", () => ({
  INTERRUPTED_IMPORT_CODE: "interrupted",
  listPendingImports: mocks.list,
  recordTranscriptionFailure: mocks.record,
  clearImportPending: mocks.clear,
}));
vi.mock("~/stt/audio-import-feedback", () => ({
  notifyImportInterrupted: mocks.notify,
}));

import { recoverInterruptedImports } from "./interrupted-imports";

beforeEach(() => vi.clearAllMocks());

// Issue 714 : un import perdu à la fermeture est signalé une fois au
// lancement suivant ; un import repris par le natif n'est pas touché.
describe("recoverInterruptedImports", () => {
  it("marks an interrupted import as failed, once", async () => {
    mocks.list.mockResolvedValue([
      { sessionId: "lost", fileName: "seminaire.mp3" },
      { sessionId: "resumed", fileName: "autre.wav" },
    ]);

    await recoverInterruptedImports((id) => id === "resumed");

    expect(mocks.record).toHaveBeenCalledOnce();
    expect(mocks.record).toHaveBeenCalledWith(
      "lost",
      expect.any(Error),
      "interrupted",
    );
    expect(mocks.clear).toHaveBeenCalledWith("lost");
    expect(mocks.clear).not.toHaveBeenCalledWith("resumed");
    expect(mocks.notify).toHaveBeenCalledWith({
      sessionId: "lost",
      name: "seminaire.mp3",
    });
  });

  it("does nothing without a pending import", async () => {
    mocks.list.mockResolvedValue([]);
    await recoverInterruptedImports(() => false);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
