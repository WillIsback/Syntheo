import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { GET, statusRouteDeps } from "@/app/api/sessions/[id]/status/route";
import {
  refreshSessionFromRemote,
  sessionRefreshDeps,
  sessionsStore,
} from "@/lib/sessions";

class ReturningRowDb {
  constructor(private readonly rows: unknown[]) {}

  async returning() {
    return this.rows;
  }
}

class CompletedUpdateWhereDb {
  constructor(private readonly rows: unknown[]) {}

  where() {
    return new ReturningRowDb(this.rows);
  }
}

class CompletedUpdateSetDb {
  constructor(private readonly rows: unknown[]) {}

  set() {
    return new CompletedUpdateWhereDb(this.rows);
  }
}

class CompletedUpdateDb {
  constructor(private readonly rows: unknown[]) {}

  update() {
    return new CompletedUpdateSetDb(this.rows);
  }
}

test("status route returns persisted terminal sessions without remote refresh", async (t) => {
  const authMock = mock.method(statusRouteDeps, "auth", async () => ({
    user: { id: "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74" },
  }));
  const refreshMock = mock.method(
    statusRouteDeps,
    "refreshSessionFromRemote",
    async () => ({
      id: "session-1",
      status: "completed",
    }),
  );

  t.after(() => {
    refreshMock.mock.restore();
    authMock.mock.restore();
  });

  const response = await GET(
    new Request("http://localhost/api/sessions/session-1/status"),
    { params: Promise.resolve({ id: "session-1" }) },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: "session-1",
    status: "completed",
  });
});

test("status route rejects unauthenticated requests", async (t) => {
  const authMock = mock.method(statusRouteDeps, "auth", async () => null);

  t.after(() => {
    authMock.mock.restore();
  });

  const response = await GET(
    new Request("http://localhost/api/sessions/session-1/status"),
    { params: Promise.resolve({ id: "session-1" }) },
  );

  assert.equal(response.status, 401);
});

test("refreshSessionFromRemote persists completed remote jobs and txt export", async (t) => {
  const row = {
    id: "5bc7d20c-dfbf-4c35-b093-8cf5cdfc5899",
    userUid: "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74",
    jobId: "a14e14a6-0cdb-4707-83bc-ee2ad4f7004f",
    name: "meeting.wav",
    status: "pending",
    createdAt: "2026-07-11T11:56:21.049142+00:00",
    updatedAt: "2026-07-11T11:56:21.049142+00:00",
    transcriptPayload: {
      input: {
        filename: "meeting.wav",
        mimeType: "audio/wav",
        size: 1024,
      },
      job: null,
      error: null,
    },
    exportsPayload: null,
  };
  const completedJob = {
    job_id: row.jobId,
    status: "completed" as const,
    created_at: "2026-07-11T11:56:21.049142+00:00",
    completed_at: "2026-07-11T11:56:38.318566+00:00",
    error: null,
    duration_s: 15.72,
    num_speakers: 2,
    segments: [{ start: 0, end: 2, speaker: "SPEAKER_01", text: "Bonjour" }],
  };

  const ownedSessionMock = mock.method(
    sessionRefreshDeps,
    "getOwnedSession",
    async () => row,
  );
  const jobStatusMock = mock.method(
    sessionRefreshDeps,
    "getJobStatus",
    async () => completedJob,
  );
  const exportMock = mock.method(
    sessionRefreshDeps,
    "getFormattedExport",
    async () => "[SPEAKER_01]\nBonjour",
  );

  const withUserDbContextMock = mock.method(
    sessionsStore,
    "withUserDbContext",
    async (_userUid, transaction) => transaction({}),
  );
  const getScopedDbMock = mock.method(
    sessionsStore,
    "getScopedDb",
    () =>
      new CompletedUpdateDb([
        {
          ...row,
          status: "completed",
          updatedAt: "2026-07-11T11:56:38.318566+00:00",
          transcriptPayload: {
            input: row.transcriptPayload.input,
            job: completedJob,
            error: null,
          },
          exportsPayload: { txt: "[SPEAKER_01]\nBonjour" },
        },
      ]),
  );

  t.after(() => {
    getScopedDbMock.mock.restore();
    withUserDbContextMock.mock.restore();
    exportMock.mock.restore();
    jobStatusMock.mock.restore();
    ownedSessionMock.mock.restore();
  });

  const refreshed = await refreshSessionFromRemote({
    sessionId: row.id,
    userUid: row.userUid,
  });

  assert.equal(refreshed?.status, "completed");
  assert.equal(refreshed?.exportsPayload?.txt, "[SPEAKER_01]\nBonjour");
  assert.equal(refreshed?.transcriptPayload.job?.status, "completed");
});

test("refreshSessionFromRemote keeps polling when txt export is not ready", async (t) => {
  const row = {
    id: "5bc7d20c-dfbf-4c35-b093-8cf5cdfc5899",
    userUid: "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74",
    jobId: "a14e14a6-0cdb-4707-83bc-ee2ad4f7004f",
    name: "meeting.wav",
    status: "processing",
    createdAt: "2026-07-11T11:56:21.049142+00:00",
    updatedAt: "2026-07-11T11:56:21.049142+00:00",
    transcriptPayload: {
      input: {
        filename: "meeting.wav",
        mimeType: "audio/wav",
        size: 1024,
      },
      job: null,
      error: null,
    },
    exportsPayload: null,
  };
  const completedJob = {
    job_id: row.jobId,
    status: "completed" as const,
    created_at: "2026-07-11T11:56:21.049142+00:00",
    completed_at: "2026-07-11T11:56:38.318566+00:00",
    error: null,
    duration_s: 15.72,
    num_speakers: 2,
    segments: [{ start: 0, end: 2, speaker: "SPEAKER_01", text: "Bonjour" }],
  };

  const ownedSessionMock = mock.method(
    sessionRefreshDeps,
    "getOwnedSession",
    async () => row,
  );
  const jobStatusMock = mock.method(
    sessionRefreshDeps,
    "getJobStatus",
    async () => completedJob,
  );
  const exportMock = mock.method(
    sessionRefreshDeps,
    "getFormattedExport",
    async () => {
      throw new Error("Job not yet completed");
    },
  );

  const withUserDbContextMock = mock.method(
    sessionsStore,
    "withUserDbContext",
    async (_userUid, transaction) => transaction({}),
  );
  const getScopedDbMock = mock.method(
    sessionsStore,
    "getScopedDb",
    () =>
      new CompletedUpdateDb([
        {
          ...row,
          status: "processing",
          updatedAt: "2026-07-11T11:56:38.318566+00:00",
          transcriptPayload: {
            input: row.transcriptPayload.input,
            job: completedJob,
            error: null,
          },
          exportsPayload: null,
        },
      ]),
  );

  t.after(() => {
    getScopedDbMock.mock.restore();
    withUserDbContextMock.mock.restore();
    exportMock.mock.restore();
    jobStatusMock.mock.restore();
    ownedSessionMock.mock.restore();
  });

  const refreshed = await refreshSessionFromRemote({
    sessionId: row.id,
    userUid: row.userUid,
  });

  assert.equal(refreshed?.status, "processing");
  assert.equal(refreshed?.exportsPayload, null);
  assert.equal(refreshed?.transcriptPayload.job?.status, "completed");
});
