import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { PATCH, renameRouteDeps } from "@/app/api/sessions/[id]/route";
import { sessionsStore } from "@/lib/sessions";

const SESSION_ID = "5bc7d20c-dfbf-4c35-b093-8cf5cdfc5899";
const USER_UID = "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74";
const JOB_ID = "b6507a86-0d79-43db-8c09-8eb76cb2633b";

function makeParams(id = SESSION_ID) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/sessions/${SESSION_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("PATCH /api/sessions/[id] — 401 si non authentifié", async (t) => {
  const authMock = mock.method(renameRouteDeps, "auth", async () => null);
  t.after(() => authMock.mock.restore());

  const res = await PATCH(makeRequest({ name: "Nouveau" }), makeParams());
  assert.equal(res.status, 401);
});

test("PATCH /api/sessions/[id] — 400 si id non UUID", async (t) => {
  const authMock = mock.method(renameRouteDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));
  t.after(() => authMock.mock.restore());

  const res = await PATCH(
    makeRequest({ name: "Nouveau" }),
    makeParams("not-a-uuid"),
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/sessions/[id] — 400 si nom vide", async (t) => {
  const authMock = mock.method(renameRouteDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));
  t.after(() => authMock.mock.restore());

  const res = await PATCH(makeRequest({ name: "   " }), makeParams());
  assert.equal(res.status, 400);
});

test("PATCH /api/sessions/[id] — 409 si nom déjà utilisé", async (t) => {
  const authMock = mock.method(renameRouteDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));
  const dbMock = mock.method(
    renameRouteDeps,
    "dbRenameSession",
    async () => "conflict" as const,
  );
  const withCtxMock = mock.method(
    sessionsStore,
    "withUserDbContext",
    async (_uid: string, fn: (c: unknown) => Promise<unknown>) => fn({}),
  );
  const getScopedMock = mock.method(sessionsStore, "getScopedDb", () => ({}));
  t.after(() => {
    getScopedMock.mock.restore();
    withCtxMock.mock.restore();
    dbMock.mock.restore();
    authMock.mock.restore();
  });

  const res = await PATCH(makeRequest({ name: "Nom existant" }), makeParams());
  assert.equal(res.status, 409);
});

test("PATCH /api/sessions/[id] — 404 si session non trouvée", async (t) => {
  const authMock = mock.method(renameRouteDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));
  const dbMock = mock.method(
    renameRouteDeps,
    "dbRenameSession",
    async () => null,
  );
  const withCtxMock = mock.method(
    sessionsStore,
    "withUserDbContext",
    async (_uid: string, fn: (c: unknown) => Promise<unknown>) => fn({}),
  );
  const getScopedMock = mock.method(sessionsStore, "getScopedDb", () => ({}));
  t.after(() => {
    getScopedMock.mock.restore();
    withCtxMock.mock.restore();
    dbMock.mock.restore();
    authMock.mock.restore();
  });

  const res = await PATCH(makeRequest({ name: "Nouveau" }), makeParams());
  assert.equal(res.status, 404);
});

test("PATCH /api/sessions/[id] — 200 avec le nouveau nom", async (t) => {
  const authMock = mock.method(renameRouteDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));
  const dbMock = mock.method(renameRouteDeps, "dbRenameSession", async () => ({
    id: SESSION_ID,
    name: "Nouveau nom",
    userUid: USER_UID,
    jobId: JOB_ID,
    status: "completed" as const,
    createdAt: "2026-07-11T11:56:21.049142+00:00",
    updatedAt: "2026-07-15T10:00:00.000000+00:00",
    transcriptPayload: {
      input: { filename: "meeting.wav", mimeType: "audio/wav", size: 1024 },
      job: null,
      error: null,
    },
    exportsPayload: null,
  }));
  const withCtxMock = mock.method(
    sessionsStore,
    "withUserDbContext",
    async (_uid: string, fn: (c: unknown) => Promise<unknown>) => fn({}),
  );
  const getScopedMock = mock.method(sessionsStore, "getScopedDb", () => ({}));
  t.after(() => {
    getScopedMock.mock.restore();
    withCtxMock.mock.restore();
    dbMock.mock.restore();
    authMock.mock.restore();
  });

  const res = await PATCH(makeRequest({ name: "Nouveau nom" }), makeParams());
  assert.equal(res.status, 200);
  const body = (await res.json()) as { name: string };
  assert.equal(body.name, "Nouveau nom");
});
