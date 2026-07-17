import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { initRouteDeps, POST } from "@/app/api/transcribe/init/route";

const USER_ID = "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74";
const SESSION_ID = "5bc7d20c-dfbf-4c35-b093-8cf5cdfc5899";

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/transcribe/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("POST /api/transcribe/init retourne 401 si non authentifié", async (t) => {
  const authMock = mock.method(initRouteDeps, "auth", async () => null);
  t.after(() => authMock.mock.restore());

  const res = await POST(
    makeRequest({ filename: "a.mp3", mimeType: "audio/mpeg", size: 1024 }),
  );
  assert.equal(res.status, 401);
});

test("POST /api/transcribe/init retourne 400 pour un body invalide", async (t) => {
  const authMock = mock.method(initRouteDeps, "auth", async () => ({
    user: { id: USER_ID },
  }));
  t.after(() => authMock.mock.restore());

  const res = await POST(makeRequest({ filename: "", size: -1 }));
  assert.equal(res.status, 400);
});

test("POST /api/transcribe/init crée la session et retourne sessionId", async (t) => {
  const authMock = mock.method(initRouteDeps, "auth", async () => ({
    user: { id: USER_ID },
  }));
  const createMock = mock.method(
    initRouteDeps,
    "createPendingSession",
    async () => ({
      id: SESSION_ID,
      jobId: "00000000-0000-4000-a000-000000000001",
    }),
  );
  t.after(() => {
    authMock.mock.restore();
    createMock.mock.restore();
  });

  const res = await POST(
    makeRequest({
      filename: "meeting.mp3",
      mimeType: "audio/mpeg",
      size: 120_000_000,
    }),
  );

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.sessionId, SESSION_ID);
  assert.equal(createMock.mock.calls.length, 1);
  const input = (
    createMock.mock.calls[0]?.arguments[0] as Parameters<
      typeof initRouteDeps.createPendingSession
    >[0]
  ).input;
  assert.equal(input.filename, "meeting.mp3");
  assert.equal(input.size, 120_000_000);
});
