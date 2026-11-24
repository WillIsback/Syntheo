import { beforeEach, describe, expect, it, vi } from "vitest";

// Issue 712 : suppression réelle après le délai d'annulation.

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  deleteSessionFolder: vi.fn(),
  purgeDeletedSession: vi.fn(),
  listExpiredDeletedSessions: vi.fn(),
}));

vi.mock("@syntheo/plugin-fs-sync", () => ({
  commands: { deleteSessionFolder: mocks.deleteSessionFolder },
}));
vi.mock("@syntheo/plugin-session", () => ({
  commands: {
    purgeDeletedSession: mocks.purgeDeletedSession,
    listExpiredDeletedSessions: mocks.listExpiredDeletedSessions,
  },
}));
vi.mock("~/db", () => ({ liveQueryClient: { execute: vi.fn() } }));

import {
  finalizeSessionDeletion,
  purgeExpiredDeletedSessions,
} from "./deletion";

const TOMBSTONE = "2026-11-24T10:00:00.000Z";

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.deleteSessionFolder
    .mockReset()
    .mockImplementation(async (id: string) => {
      mocks.calls.push(`folder:${id}`);
      return { status: "ok", data: null };
    });
  mocks.purgeDeletedSession
    .mockReset()
    .mockImplementation(
      async (request: { session_id: string; tombstone: string }) => {
        mocks.calls.push(`purge:${request.session_id}:${request.tombstone}`);
        return { status: "ok", data: "purged" };
      },
    );
  mocks.listExpiredDeletedSessions.mockReset();
});

describe("finalizeSessionDeletion", () => {
  it("deletes the folder, then purges the database under the same tombstone", async () => {
    await finalizeSessionDeletion("session-1", TOMBSTONE);
    expect(mocks.calls).toEqual([
      "folder:session-1",
      `purge:session-1:${TOMBSTONE}`,
    ]);
  });

  it("keeps the tombstone when the folder cannot be deleted", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.deleteSessionFolder.mockResolvedValue({
      status: "error",
      error: "busy",
    });
    await finalizeSessionDeletion("session-1", TOMBSTONE);
    expect(mocks.purgeDeletedSession).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("logs a refused purge with the session id only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.purgeDeletedSession.mockResolvedValue({
      status: "ok",
      data: "refused",
    });
    await finalizeSessionDeletion("session-1", TOMBSTONE);
    expect(warn).toHaveBeenCalledWith(
      "[delete-session] purge refused, tombstone kept",
      { sessionId: "session-1" },
    );
    warn.mockRestore();
  });
});

describe("purgeExpiredDeletedSessions", () => {
  it("finishes each pending deletion in order", async () => {
    mocks.listExpiredDeletedSessions.mockResolvedValue({
      status: "ok",
      data: [
        { session_id: "a", tombstone: TOMBSTONE },
        { session_id: "b", tombstone: TOMBSTONE },
      ],
    });
    await purgeExpiredDeletedSessions();
    expect(mocks.calls).toEqual([
      "folder:a",
      `purge:a:${TOMBSTONE}`,
      "folder:b",
      `purge:b:${TOMBSTONE}`,
    ]);
  });

  it("does nothing when no deletion is pending", async () => {
    mocks.listExpiredDeletedSessions.mockResolvedValue({
      status: "ok",
      data: [],
    });
    await purgeExpiredDeletedSessions();
    expect(mocks.deleteSessionFolder).not.toHaveBeenCalled();
  });
});
