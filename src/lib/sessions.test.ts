import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  attachRemoteJobId,
  buildPendingTranscriptPayload,
  createPendingSession,
  getOwnedSession,
  listOwnedSessions,
  mergeCompletedTranscriptPayload,
  mergeFailedTranscriptPayload,
  sessionsStore,
} from "@/lib/sessions";
import type { JobStatus } from "@/schemas/whisperx.server.schema";

const createScopedDbClient = <T>(callback: () => T) =>
  callback() as ReturnType<typeof sessionsStore.getScopedDb>;

class ReturningRowDb {
  constructor(private readonly row: unknown) {}

  async returning() {
    return [this.row];
  }
}

class InsertValuesDb {
  constructor(
    private readonly valuesCalls: unknown[],
    private readonly inserted: unknown,
  ) {}

  values(value: unknown) {
    this.valuesCalls.push(value);
    return new ReturningRowDb(this.inserted);
  }
}

class InsertDb {
  constructor(
    private readonly valuesCalls: unknown[],
    private readonly inserted: unknown,
  ) {}

  insert() {
    return new InsertValuesDb(this.valuesCalls, this.inserted);
  }
}

class UpdateWhereDb {
  constructor(private readonly updated: unknown) {}

  where() {
    return new ReturningRowDb(this.updated);
  }
}

class UpdateSetDb {
  constructor(
    private readonly setCalls: unknown[],
    private readonly updated: unknown,
  ) {}

  set(value: unknown) {
    this.setCalls.push(value);
    return new UpdateWhereDb(this.updated);
  }
}

class UpdateDb {
  constructor(
    private readonly setCalls: unknown[],
    private readonly updated: unknown,
  ) {}

  update() {
    return new UpdateSetDb(this.setCalls, this.updated);
  }
}

class SelectLimitWhereDb {
  constructor(private readonly rows: unknown[]) {}

  async limit() {
    return this.rows;
  }
}

class SelectLimitFromDb {
  constructor(private readonly rows: unknown[]) {}

  where() {
    return new SelectLimitWhereDb(this.rows);
  }
}

class SelectLimitSelectDb {
  constructor(private readonly rows: unknown[]) {}

  from() {
    return new SelectLimitFromDb(this.rows);
  }
}

class SelectLimitDb {
  constructor(private readonly rows: unknown[]) {}

  select() {
    return new SelectLimitSelectDb(this.rows);
  }
}

class SelectOrderWhereDb {
  constructor(
    private readonly rows: unknown[],
    private readonly onOrderBy: () => void,
  ) {}

  async orderBy() {
    this.onOrderBy();
    return this.rows;
  }
}

class SelectOrderFromDb {
  constructor(
    private readonly rows: unknown[],
    private readonly onOrderBy: () => void,
  ) {}

  where() {
    return new SelectOrderWhereDb(this.rows, this.onOrderBy);
  }
}

class SelectOrderSelectDb {
  constructor(
    private readonly rows: unknown[],
    private readonly onOrderBy: () => void,
  ) {}

  from() {
    return new SelectOrderFromDb(this.rows, this.onOrderBy);
  }
}

class SelectOrderDb {
  constructor(
    private readonly rows: unknown[],
    private readonly onOrderBy: () => void,
  ) {}

  select() {
    return new SelectOrderSelectDb(this.rows, this.onOrderBy);
  }
}

test("buildPendingTranscriptPayload stores upload metadata", () => {
  const payload = buildPendingTranscriptPayload({
    filename: "meeting.wav",
    mimeType: "audio/wav",
    size: 1024,
    language: "fr",
  });

  assert.deepEqual(payload.input, {
    filename: "meeting.wav",
    mimeType: "audio/wav",
    size: 1024,
    language: "fr",
  });
  assert.equal(payload.job, null);
  assert.equal(payload.error, null);
});

test("mergeCompletedTranscriptPayload keeps raw remote payload", () => {
  const payload = mergeCompletedTranscriptPayload(
    {
      input: {
        filename: "meeting.wav",
        mimeType: "audio/wav",
        size: 1024,
      },
      job: null,
      error: null,
    },
    {
      job_id: "a14e14a6-0cdb-4707-83bc-ee2ad4f7004f",
      status: "completed",
      created_at: "2026-07-11T11:56:21.049142+00:00",
      completed_at: "2026-07-11T11:56:38.318566+00:00",
      error: null,
      duration_s: 15.72,
      num_speakers: 2,
      segments: [],
    } satisfies Extract<JobStatus, { status: "completed" }>,
  );

  assert.equal(payload.job?.status, "completed");
  assert.equal(payload.job?.duration_s, 15.72);
  assert.equal(payload.error, null);
});

test("mergeFailedTranscriptPayload stores a stable error message", () => {
  const payload = mergeFailedTranscriptPayload(
    {
      input: {
        filename: "meeting.wav",
        mimeType: "audio/wav",
        size: 1024,
      },
      job: null,
      error: null,
    },
    "Remote timeout",
  );

  assert.equal(payload.job, null);
  assert.equal(payload.error?.message, "Remote timeout");
  assert.match(payload.error?.at ?? "", /^\d{4}-\d{2}-\d{2}T/);
});

test("createPendingSession persists a pending transcript payload", async (t) => {
  const transcriptPayload = {
    input: {
      filename: "meeting.wav",
      mimeType: "audio/wav",
      size: 1024,
      language: "fr",
    },
    job: null,
    error: null,
  };
  const inserted = {
    id: "5bc7d20c-dfbf-4c35-b093-8cf5cdfc5899",
    userUid: "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74",
    jobId: "b6507a86-0d79-43db-8c09-8eb76cb2633b",
    name: "meeting.wav",
    status: "pending",
    createdAt: "2026-07-11T11:56:21.049142+00:00",
    updatedAt: "2026-07-11T11:56:21.049142+00:00",
    transcriptPayload,
    exportsPayload: null,
  };

  const valuesCalls: unknown[] = [];
  const withUserDbContextMock = mock.method(
    sessionsStore,
    "withUserDbContext",
    async (userUid, transaction) => {
      assert.equal(userUid, inserted.userUid);
      return transaction({});
    },
  );
  const getScopedDbMock = mock.method(sessionsStore, "getScopedDb", () =>
    createScopedDbClient(() => new InsertDb(valuesCalls, inserted)),
  );

  t.after(() => {
    getScopedDbMock.mock.restore();
    withUserDbContextMock.mock.restore();
  });

  const result = await createPendingSession({
    userUid: inserted.userUid,
    placeholderJobId: inserted.jobId,
    input: {
      filename: "meeting.wav",
      mimeType: "audio/wav",
      size: 1024,
      language: "fr",
    },
  });

  assert.deepEqual(result, inserted);
  assert.deepEqual(valuesCalls[0], {
    userUid: inserted.userUid,
    jobId: inserted.jobId,
    name: "meeting.wav",
    status: "pending",
    transcriptPayload,
    exportsPayload: null,
  });
});

test("attachRemoteJobId updates the remote job id", async (t) => {
  const updated = {
    id: "5bc7d20c-dfbf-4c35-b093-8cf5cdfc5899",
    userUid: "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74",
    jobId: "a14e14a6-0cdb-4707-83bc-ee2ad4f7004f",
    status: "pending",
    createdAt: "2026-07-11T11:56:21.049142+00:00",
    updatedAt: "2026-07-11T11:56:38.318566+00:00",
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
  const setCalls: unknown[] = [];

  const withUserDbContextMock = mock.method(
    sessionsStore,
    "withUserDbContext",
    async (userUid, transaction) => {
      assert.equal(userUid, "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74");
      return transaction({});
    },
  );
  const getScopedDbMock = mock.method(sessionsStore, "getScopedDb", () =>
    createScopedDbClient(() => new UpdateDb(setCalls, updated)),
  );

  t.after(() => {
    getScopedDbMock.mock.restore();
    withUserDbContextMock.mock.restore();
  });

  const result = await attachRemoteJobId(
    updated.id,
    "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74",
    updated.jobId,
  );

  assert.deepEqual(result, updated);
  assert.equal((setCalls[0] as { jobId: string }).jobId, updated.jobId);
  assert.match(
    (setCalls[0] as { updatedAt: string }).updatedAt,
    /^\d{4}-\d{2}-\d{2}T/,
  );
});

test("getOwnedSession returns null when no row matches", async (t) => {
  const withUserDbContextMock = mock.method(
    sessionsStore,
    "withUserDbContext",
    async (userUid, transaction) => {
      assert.equal(userUid, "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74");
      return transaction({});
    },
  );
  const getScopedDbMock = mock.method(sessionsStore, "getScopedDb", () =>
    createScopedDbClient(() => new SelectLimitDb([])),
  );

  t.after(() => {
    getScopedDbMock.mock.restore();
    withUserDbContextMock.mock.restore();
  });

  const result = await getOwnedSession(
    "5bc7d20c-dfbf-4c35-b093-8cf5cdfc5899",
    "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74",
  );

  assert.equal(result, null);
});

test("listOwnedSessions orders sessions by creation date descending", async (t) => {
  const rows = [
    {
      id: "1",
      userUid: "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74",
      jobId: "11111111-1111-4111-8111-111111111111",
      status: "pending",
      createdAt: "2026-07-11T11:56:21.049142+00:00",
      updatedAt: "2026-07-11T11:56:21.049142+00:00",
      transcriptPayload: {
        input: {
          filename: "meeting-1.wav",
          mimeType: "audio/wav",
          size: 100,
        },
        job: null,
        error: null,
      },
      exportsPayload: null,
    },
    {
      id: "2",
      userUid: "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74",
      jobId: "22222222-2222-4222-8222-222222222222",
      status: "pending",
      createdAt: "2026-07-11T12:56:21.049142+00:00",
      updatedAt: "2026-07-11T12:56:21.049142+00:00",
      transcriptPayload: {
        input: {
          filename: "meeting-2.wav",
          mimeType: "audio/wav",
          size: 200,
        },
        job: null,
        error: null,
      },
      exportsPayload: null,
    },
  ];
  let orderByCalled = false;

  const withUserDbContextMock = mock.method(
    sessionsStore,
    "withUserDbContext",
    async (userUid, transaction) => {
      assert.equal(userUid, "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74");
      return transaction({});
    },
  );
  const getScopedDbMock = mock.method(sessionsStore, "getScopedDb", () =>
    createScopedDbClient(
      () =>
        new SelectOrderDb(rows, () => {
          orderByCalled = true;
        }),
    ),
  );

  t.after(() => {
    getScopedDbMock.mock.restore();
    withUserDbContextMock.mock.restore();
  });

  const result = await listOwnedSessions(
    "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74",
  );

  assert.equal(orderByCalled, true);
  assert.deepEqual(result, rows);
});

test("createPendingSession rejects malformed payloads before insert", async () => {
  await assert.rejects(
    () =>
      createPendingSession({
        userUid: "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74",
        placeholderJobId: "b6507a86-0d79-43db-8c09-8eb76cb2633b",
        input: {
          filename: "",
          mimeType: "",
          size: -1,
        },
      }),
    /filename|mimeType|size/i,
  );
});

test("attachRemoteJobId returns null when no owned session matches", async (t) => {
  const withUserDbContextMock = mock.method(
    sessionsStore,
    "withUserDbContext",
    async (_userUid, transaction) => transaction({}),
  );
  const getScopedDbMock = mock.method(sessionsStore, "getScopedDb", () =>
    createScopedDbClient(() => new UpdateDb([], undefined)),
  );

  t.after(() => {
    getScopedDbMock.mock.restore();
    withUserDbContextMock.mock.restore();
  });

  const result = await attachRemoteJobId(
    "5bc7d20c-dfbf-4c35-b093-8cf5cdfc5899",
    "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74",
    "a14e14a6-0cdb-4707-83bc-ee2ad4f7004f",
  );

  assert.equal(result, null);
});

test("getOwnedSession rejects malformed transcript payloads", async (t) => {
  const withUserDbContextMock = mock.method(
    sessionsStore,
    "withUserDbContext",
    async (_userUid, transaction) => transaction({}),
  );
  const getScopedDbMock = mock.method(sessionsStore, "getScopedDb", () =>
    createScopedDbClient(
      () =>
        new SelectLimitDb([
          {
            id: "5bc7d20c-dfbf-4c35-b093-8cf5cdfc5899",
            userUid: "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74",
            jobId: "b6507a86-0d79-43db-8c09-8eb76cb2633b",
            status: "pending",
            createdAt: "2026-07-11T11:56:21.049142+00:00",
            updatedAt: "2026-07-11T11:56:21.049142+00:00",
            transcriptPayload: {},
            exportsPayload: null,
          },
        ]),
    ),
  );

  t.after(() => {
    getScopedDbMock.mock.restore();
    withUserDbContextMock.mock.restore();
  });

  await assert.rejects(
    () =>
      getOwnedSession(
        "5bc7d20c-dfbf-4c35-b093-8cf5cdfc5899",
        "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74",
      ),
    /input/i,
  );
});
