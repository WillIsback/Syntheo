import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  PATCH,
  speakersRouteDeps,
} from "@/app/api/sessions/[id]/speakers/route";
import { sessionsStore } from "@/lib/sessions";

const SESSION_ID = "5bc7d20c-dfbf-4c35-b093-8cf5cdfc5899";
const USER_UID = "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74";

function makeParams(id = SESSION_ID) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/sessions/${SESSION_ID}/speakers`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("PATCH /api/sessions/[id]/speakers — 401 si non authentifié", async (t) => {
  const authMock = mock.method(speakersRouteDeps, "auth", async () => null);
  t.after(() => authMock.mock.restore());

  const res = await PATCH(
    makeRequest({ speakerNames: { SPEAKER_00: "Marie" } }),
    makeParams(),
  );
  assert.equal(res.status, 401);
});

test("PATCH /api/sessions/[id]/speakers — 400 si id non UUID", async (t) => {
  const authMock = mock.method(speakersRouteDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));
  t.after(() => authMock.mock.restore());

  const res = await PATCH(
    makeRequest({ speakerNames: { SPEAKER_00: "Marie" } }),
    makeParams("not-a-uuid"),
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/sessions/[id]/speakers — 400 si corps invalide", async (t) => {
  const authMock = mock.method(speakersRouteDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));
  t.after(() => authMock.mock.restore());

  const res = await PATCH(
    makeRequest({ speakerNames: "not-an-object" }),
    makeParams(),
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/sessions/[id]/speakers — 400 si valeurs non-string", async (t) => {
  const authMock = mock.method(speakersRouteDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));
  t.after(() => authMock.mock.restore());

  const res = await PATCH(
    makeRequest({ speakerNames: { SPEAKER_00: 42 } }),
    makeParams(),
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/sessions/[id]/speakers — 404 si session non trouvée", async (t) => {
  const authMock = mock.method(speakersRouteDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));
  const dbMock = mock.method(
    speakersRouteDeps,
    "dbUpdateSpeakerNames",
    async () => false,
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

  const res = await PATCH(
    makeRequest({ speakerNames: { SPEAKER_00: "Marie" } }),
    makeParams(),
  );
  assert.equal(res.status, 404);
});

test("PATCH /api/sessions/[id]/speakers — 200 si succès", async (t) => {
  const authMock = mock.method(speakersRouteDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));
  const dbMock = mock.method(
    speakersRouteDeps,
    "dbUpdateSpeakerNames",
    async () => true,
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

  const res = await PATCH(
    makeRequest({
      speakerNames: { SPEAKER_00: "Marie", SPEAKER_01: "Thomas" },
    }),
    makeParams(),
  );
  assert.equal(res.status, 200);
});
