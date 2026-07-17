import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  POST,
  uploadUrlRouteDeps,
} from "@/app/api/transcribe/[sessionId]/upload-url/route";

process.env.S3_BUCKET = "test-bucket";

const USER_ID = "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74";
const SESSION_ID = "5bc7d20c-dfbf-4c35-b093-8cf5cdfc5899";
const PRESIGNED_URL = "https://storage.example/presigned-put";

const makeRequest = (
  sessionId: string,
  body: unknown = { mimeType: "audio/mpeg" },
) =>
  new Request(`http://localhost/api/transcribe/${sessionId}/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const makeParams = (sessionId: string) =>
  ({ params: Promise.resolve({ sessionId }) }) as {
    params: Promise<{ sessionId: string }>;
  };

test("POST upload-url retourne 401 si non authentifié", async (t) => {
  const authMock = mock.method(uploadUrlRouteDeps, "auth", async () => null);
  t.after(() => authMock.mock.restore());

  const res = await POST(makeRequest(SESSION_ID), makeParams(SESSION_ID));
  assert.equal(res.status, 401);
});

test("POST upload-url retourne 400 pour un sessionId non-UUID", async (t) => {
  const authMock = mock.method(uploadUrlRouteDeps, "auth", async () => ({
    user: { id: USER_ID },
  }));
  t.after(() => authMock.mock.restore());

  const res = await POST(makeRequest("not-a-uuid"), makeParams("not-a-uuid"));
  assert.equal(res.status, 400);
});

test("POST upload-url retourne 404 si la session n'appartient pas à l'utilisateur", async (t) => {
  const authMock = mock.method(uploadUrlRouteDeps, "auth", async () => ({
    user: { id: USER_ID },
  }));
  const getSessionMock = mock.method(
    uploadUrlRouteDeps,
    "getOwnedSession",
    async () => null,
  );
  t.after(() => {
    authMock.mock.restore();
    getSessionMock.mock.restore();
  });

  const res = await POST(makeRequest(SESSION_ID), makeParams(SESSION_ID));
  assert.equal(res.status, 404);
});

test("POST upload-url retourne 400 pour un corps invalide", async (t) => {
  const authMock = mock.method(uploadUrlRouteDeps, "auth", async () => ({
    user: { id: USER_ID },
  }));
  const getSessionMock = mock.method(
    uploadUrlRouteDeps,
    "getOwnedSession",
    async () => ({ id: SESSION_ID }),
  );
  t.after(() => {
    authMock.mock.restore();
    getSessionMock.mock.restore();
  });

  const res = await POST(makeRequest(SESSION_ID, {}), makeParams(SESSION_ID));
  assert.equal(res.status, 400);
});

test("POST upload-url retourne une URL présignée et la clé objet", async (t) => {
  const authMock = mock.method(uploadUrlRouteDeps, "auth", async () => ({
    user: { id: USER_ID },
  }));
  const getSessionMock = mock.method(
    uploadUrlRouteDeps,
    "getOwnedSession",
    async () => ({ id: SESSION_ID }),
  );
  const getS3ClientMock = mock.method(
    uploadUrlRouteDeps,
    "getS3Client",
    () => ({}),
  );
  const getSignedUrlMock = mock.method(
    uploadUrlRouteDeps,
    "getSignedUrl",
    async () => PRESIGNED_URL,
  );
  t.after(() => {
    authMock.mock.restore();
    getSessionMock.mock.restore();
    getS3ClientMock.mock.restore();
    getSignedUrlMock.mock.restore();
  });

  const res = await POST(makeRequest(SESSION_ID), makeParams(SESSION_ID));

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.uploadUrl, PRESIGNED_URL);
  assert.equal(body.objectKey, `${USER_ID}/${SESSION_ID}`);
});
