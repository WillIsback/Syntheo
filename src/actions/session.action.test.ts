import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  getSession,
  listSessions,
  sessionActionDeps,
} from "@/actions/session.action";
import type { ParsedSessionRow } from "@/lib/sessions";

const USER_UID = "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74";
const SESSION_ID = "5bc7d20c-dfbf-4c35-b093-8cf5cdfc5899";
const JOB_ID = "b6507a86-0d79-43db-8c09-8eb76cb2633b";

const makeRow = (): ParsedSessionRow => ({
  id: SESSION_ID,
  userUid: USER_UID,
  jobId: JOB_ID,
  name: "meeting.wav",
  status: "completed",
  createdAt: "2026-07-11T11:56:21.049142+00:00",
  updatedAt: "2026-07-11T11:56:38.318566+00:00",
  transcriptPayload: {
    input: { filename: "meeting.wav", mimeType: "audio/wav", size: 1024 },
    job: null,
    error: null,
  },
  exportsPayload: null,
});

// ── listSessions ──────────────────────────────────────────────────────────────

test("listSessions retourne un tableau vide si non authentifié", async (t) => {
  const authMock = mock.method(sessionActionDeps, "auth", async () => null);
  t.after(() => authMock.mock.restore());

  const result = await listSessions();

  assert.deepEqual(result, []);
});

test("listSessions retourne les sessions mappées en view models", async (t) => {
  const row = makeRow();

  const authMock = mock.method(sessionActionDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));
  const withUserDbContextMock = mock.method(
    sessionActionDeps,
    "withUserDbContext",
    async (_uid: string, transaction: (client: unknown) => Promise<unknown>) =>
      transaction({}),
  );
  const getScopedDbMock = mock.method(
    sessionActionDeps,
    "getScopedDb",
    () => ({}) as ReturnType<typeof sessionActionDeps.getScopedDb>,
  );
  const dbListSessionsMock = mock.method(
    sessionActionDeps,
    "dbListSessions",
    async () => [row],
  );

  t.after(() => {
    dbListSessionsMock.mock.restore();
    getScopedDbMock.mock.restore();
    withUserDbContextMock.mock.restore();
    authMock.mock.restore();
  });

  const result = await listSessions();

  assert.equal(result.length, 1);
  assert.equal(result[0].id, SESSION_ID);
});

// ── getSession ────────────────────────────────────────────────────────────────

test("getSession retourne null pour un id non-UUID", async () => {
  const result = await getSession("s1");
  assert.equal(result, null);
});

test("getSession retourne null si non authentifié", async (t) => {
  const authMock = mock.method(sessionActionDeps, "auth", async () => null);
  t.after(() => authMock.mock.restore());

  const result = await getSession(SESSION_ID);

  assert.equal(result, null);
});

test("getSession retourne null si la session n'existe pas", async (t) => {
  const authMock = mock.method(sessionActionDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));
  const withUserDbContextMock = mock.method(
    sessionActionDeps,
    "withUserDbContext",
    async (_uid: string, transaction: (client: unknown) => Promise<unknown>) =>
      transaction({}),
  );
  const getScopedDbMock = mock.method(
    sessionActionDeps,
    "getScopedDb",
    () => ({}) as ReturnType<typeof sessionActionDeps.getScopedDb>,
  );
  const dbGetSessionMock = mock.method(
    sessionActionDeps,
    "dbGetSession",
    async () => null,
  );

  t.after(() => {
    dbGetSessionMock.mock.restore();
    getScopedDbMock.mock.restore();
    withUserDbContextMock.mock.restore();
    authMock.mock.restore();
  });

  const result = await getSession(SESSION_ID);

  assert.equal(result, null);
});

test("getSession retourne le view model si la session existe", async (t) => {
  const row = makeRow();

  const authMock = mock.method(sessionActionDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));
  const withUserDbContextMock = mock.method(
    sessionActionDeps,
    "withUserDbContext",
    async (_uid: string, transaction: (client: unknown) => Promise<unknown>) =>
      transaction({}),
  );
  const getScopedDbMock = mock.method(
    sessionActionDeps,
    "getScopedDb",
    () => ({}) as ReturnType<typeof sessionActionDeps.getScopedDb>,
  );
  const dbGetSessionMock = mock.method(
    sessionActionDeps,
    "dbGetSession",
    async () => row,
  );

  t.after(() => {
    dbGetSessionMock.mock.restore();
    getScopedDbMock.mock.restore();
    withUserDbContextMock.mock.restore();
    authMock.mock.restore();
  });

  const result = await getSession(SESSION_ID);

  assert.ok(result !== null);
  assert.equal(result.id, SESSION_ID);
});
