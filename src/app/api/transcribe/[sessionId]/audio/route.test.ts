import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  audioRouteDeps,
  POST,
} from "@/app/api/transcribe/[sessionId]/audio/route";

process.env.S3_BUCKET = "test-bucket";

const USER_ID = "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74";
const SESSION_ID = "5bc7d20c-dfbf-4c35-b093-8cf5cdfc5899";
const JOB_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PLACEHOLDER_JOB_ID = "00000000-0000-4000-a000-000000000001";
const OBJECT_KEY = `${USER_ID}/${SESSION_ID}`;
const GET_URL = "https://storage.example/presigned-get";

const makeRequest = (
  sessionId: string,
  body: unknown = {
    objectKey: OBJECT_KEY,
    filename: "meeting.mp3",
    mimeType: "audio/mpeg",
  },
) =>
  new Request(`http://localhost/api/transcribe/${sessionId}/audio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const makeParams = (sessionId: string) =>
  ({ params: Promise.resolve({ sessionId }) }) as {
    params: Promise<{ sessionId: string }>;
  };

const mockS3Deps = () => {
  const getS3ClientMock = mock.method(audioRouteDeps, "getS3Client", () => ({
    send: async () => undefined,
  }));
  const getSignedUrlMock = mock.method(
    audioRouteDeps,
    "getSignedUrl",
    async () => GET_URL,
  );
  return { getS3ClientMock, getSignedUrlMock };
};

test("POST audio retourne 401 si non authentifié", async (t) => {
  const authMock = mock.method(audioRouteDeps, "auth", async () => null);
  t.after(() => authMock.mock.restore());

  const res = await POST(makeRequest(SESSION_ID), makeParams(SESSION_ID));
  assert.equal(res.status, 401);
});

test("POST audio retourne 400 pour un sessionId non-UUID", async (t) => {
  const authMock = mock.method(audioRouteDeps, "auth", async () => ({
    user: { id: USER_ID },
  }));
  t.after(() => authMock.mock.restore());

  const res = await POST(makeRequest("not-a-uuid"), makeParams("not-a-uuid"));
  assert.equal(res.status, 400);
});

test("POST audio retourne 404 si la session n'appartient pas à l'utilisateur", async (t) => {
  const authMock = mock.method(audioRouteDeps, "auth", async () => ({
    user: { id: USER_ID },
  }));
  const getSessionMock = mock.method(
    audioRouteDeps,
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

test("POST audio récupère le fichier depuis le stockage, streame vers WhisperX, attache le job_id et retourne 200", async (t) => {
  const authMock = mock.method(audioRouteDeps, "auth", async () => ({
    user: { id: USER_ID },
  }));
  const getSessionMock = mock.method(
    audioRouteDeps,
    "getOwnedSession",
    async () => ({ id: SESSION_ID, jobId: PLACEHOLDER_JOB_ID }),
  );
  const { getS3ClientMock, getSignedUrlMock } = mockS3Deps();
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
      }),
  );
  const transcribeMock = mock.method(
    audioRouteDeps,
    "transcribeAudioStream",
    async () => ({ job_id: JOB_ID, status: "pending" as const }),
  );
  const attachMock = mock.method(
    audioRouteDeps,
    "attachRemoteJobId",
    async () => ({ id: SESSION_ID, jobId: JOB_ID }),
  );
  t.after(() => {
    authMock.mock.restore();
    getSessionMock.mock.restore();
    getS3ClientMock.mock.restore();
    getSignedUrlMock.mock.restore();
    fetchMock.mock.restore();
    transcribeMock.mock.restore();
    attachMock.mock.restore();
  });

  const res = await POST(makeRequest(SESSION_ID), makeParams(SESSION_ID));

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.jobId, JOB_ID);
  assert.equal(body.status, "pending");
  assert.equal(fetchMock.mock.calls[0]?.arguments[0], GET_URL);
  assert.equal(attachMock.mock.calls.length, 1);
  assert.equal(attachMock.mock.calls[0]?.arguments[2], JOB_ID);
});

test("POST audio marque la session échouée et relance l'erreur si WhisperX échoue", async (t) => {
  const authMock = mock.method(audioRouteDeps, "auth", async () => ({
    user: { id: USER_ID },
  }));
  const getSessionMock = mock.method(
    audioRouteDeps,
    "getOwnedSession",
    async () => ({ id: SESSION_ID, jobId: PLACEHOLDER_JOB_ID }),
  );
  const { getS3ClientMock, getSignedUrlMock } = mockS3Deps();
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
      }),
  );
  const transcribeMock = mock.method(
    audioRouteDeps,
    "transcribeAudioStream",
    async () => {
      throw new Error("WhisperX unavailable");
    },
  );
  const failMock = mock.method(
    audioRouteDeps,
    "markPendingSessionFailed",
    async () => undefined,
  );
  t.after(() => {
    authMock.mock.restore();
    getSessionMock.mock.restore();
    getS3ClientMock.mock.restore();
    getSignedUrlMock.mock.restore();
    fetchMock.mock.restore();
    transcribeMock.mock.restore();
    failMock.mock.restore();
  });

  await assert.rejects(
    () => POST(makeRequest(SESSION_ID), makeParams(SESSION_ID)),
    /WhisperX unavailable/,
  );
  assert.equal(failMock.mock.calls.length, 1);
  assert.equal(failMock.mock.calls[0]?.arguments[0], SESSION_ID);
});
