import assert from "node:assert/strict";
import test, { mock } from "node:test";

import {
  transcribeActionDeps,
  transcribePost,
} from "@/actions/transcribe.action";

const USER_UID = "9b9c9a68-5434-4cf0-8fd8-a09ff0784d74";
const SESSION_ID = "123e4567-e89b-12d3-a456-426614174000";
const REMOTE_JOB_ID = "a14e14a6-0cdb-4707-83bc-ee2ad4f7004f";

test("transcribePost rejects unauthenticated users", async (t) => {
  const authMock = mock.method(transcribeActionDeps, "auth", async () => null);

  t.after(() => {
    authMock.mock.restore();
  });

  await assert.rejects(() => transcribePost(new FormData()), /Unauthorized/);
});

test("transcribePost rejects missing file uploads", async (t) => {
  const authMock = mock.method(transcribeActionDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));

  t.after(() => {
    authMock.mock.restore();
  });

  await assert.rejects(
    () => transcribePost(new FormData()),
    /No file provided/,
  );
});

test("transcribePost creates a pending session and returns quickly", async (t) => {
  const file = new File(["audio"], "meeting.wav", { type: "audio/wav" });
  const formData = new FormData();
  formData.set("file", file);
  formData.set("language", "fr");
  formData.set("num_speakers", "2");

  const authMock = mock.method(transcribeActionDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));

  const createPendingSessionMock = mock.method(
    transcribeActionDeps,
    "createPendingSession",
    async (params) => {
      assert.equal(params.userUid, USER_UID);
      assert.match(params.placeholderJobId, /^[0-9a-f-]{36}$/i);
      assert.deepEqual(params.input, {
        filename: "meeting.wav",
        mimeType: "audio/wav",
        size: file.size,
      });

      return {
        id: SESSION_ID,
      };
    },
  );

  const transcribeAudioMock = mock.method(
    transcribeActionDeps,
    "transcribeAudio",
    async (body) => {
      assert.equal(body instanceof FormData, true);
      assert.equal(body.get("audio_file"), file);
      assert.equal(body.get("language"), "fr");
      assert.equal(body.get("num_speakers"), "2");

      return {
        job_id: REMOTE_JOB_ID,
        status: "pending" as const,
      };
    },
  );

  const attachRemoteJobIdMock = mock.method(
    transcribeActionDeps,
    "attachRemoteJobId",
    async (sessionId, userUid, jobId) => {
      assert.equal(sessionId, SESSION_ID);
      assert.equal(userUid, USER_UID);
      assert.equal(jobId, REMOTE_JOB_ID);
      return { id: SESSION_ID };
    },
  );
  const markPendingSessionFailedMock = mock.method(
    transcribeActionDeps,
    "markPendingSessionFailed",
    async () => null,
  );

  t.after(() => {
    markPendingSessionFailedMock.mock.restore();
    attachRemoteJobIdMock.mock.restore();
    transcribeAudioMock.mock.restore();
    createPendingSessionMock.mock.restore();
    authMock.mock.restore();
  });

  const result = await transcribePost(formData);

  assert.deepEqual(result, {
    sessionId: SESSION_ID,
    jobId: REMOTE_JOB_ID,
    status: "pending",
  });
});

test("transcribePost marks the pending session as failed when remote submission fails", async (t) => {
  const file = new File(["audio"], "meeting.wav", { type: "audio/wav" });
  const formData = new FormData();
  formData.set("file", file);

  const authMock = mock.method(transcribeActionDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));
  const createPendingSessionMock = mock.method(
    transcribeActionDeps,
    "createPendingSession",
    async () => ({ id: SESSION_ID, jobId: "placeholder-job-id" }),
  );
  const transcribeAudioMock = mock.method(
    transcribeActionDeps,
    "transcribeAudio",
    async () => {
      throw new Error("Remote timeout");
    },
  );
  const attachRemoteJobIdMock = mock.method(
    transcribeActionDeps,
    "attachRemoteJobId",
    async () => ({ id: SESSION_ID }),
  );
  const markPendingSessionFailedMock = mock.method(
    transcribeActionDeps,
    "markPendingSessionFailed",
    async (sessionId, userUid, placeholderJobId, message) => {
      assert.equal(sessionId, SESSION_ID);
      assert.equal(userUid, USER_UID);
      assert.equal(placeholderJobId, "placeholder-job-id");
      assert.equal(message, "Remote timeout");
      return null;
    },
  );

  t.after(() => {
    markPendingSessionFailedMock.mock.restore();
    attachRemoteJobIdMock.mock.restore();
    transcribeAudioMock.mock.restore();
    createPendingSessionMock.mock.restore();
    authMock.mock.restore();
  });

  await assert.rejects(() => transcribePost(formData), /Remote timeout/);
});

test("transcribePost rejects when the remote job id could not be persisted", async (t) => {
  const file = new File(["audio"], "meeting.wav", { type: "audio/wav" });
  const formData = new FormData();
  formData.set("file", file);

  const authMock = mock.method(transcribeActionDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));
  const createPendingSessionMock = mock.method(
    transcribeActionDeps,
    "createPendingSession",
    async () => ({ id: SESSION_ID, jobId: "placeholder-job-id" }),
  );
  const transcribeAudioMock = mock.method(
    transcribeActionDeps,
    "transcribeAudio",
    async () => ({ job_id: REMOTE_JOB_ID, status: "pending" as const }),
  );
  const attachRemoteJobIdMock = mock.method(
    transcribeActionDeps,
    "attachRemoteJobId",
    async () => null,
  );
  const markPendingSessionFailedMock = mock.method(
    transcribeActionDeps,
    "markPendingSessionFailed",
    async () => {
      assert.fail(
        "markPendingSessionFailed should not run after the remote job was accepted",
      );
      return null;
    },
  );

  t.after(() => {
    markPendingSessionFailedMock.mock.restore();
    attachRemoteJobIdMock.mock.restore();
    transcribeAudioMock.mock.restore();
    createPendingSessionMock.mock.restore();
    authMock.mock.restore();
  });

  await assert.rejects(
    () => transcribePost(formData),
    /Failed to persist remote job id/,
  );
});

test("transcribePost omits optional remote fields that were not provided", async (t) => {
  const file = new File(["audio"], "meeting.wav", { type: "audio/wav" });
  const formData = new FormData();
  formData.set("file", file);

  const authMock = mock.method(transcribeActionDeps, "auth", async () => ({
    user: { id: USER_UID },
  }));
  const createPendingSessionMock = mock.method(
    transcribeActionDeps,
    "createPendingSession",
    async () => ({ id: SESSION_ID, jobId: "placeholder-job-id" }),
  );
  const transcribeAudioMock = mock.method(
    transcribeActionDeps,
    "transcribeAudio",
    async (body) => {
      assert.equal(body.get("language"), null);
      assert.equal(body.get("initial_prompt"), null);
      assert.equal(body.get("hotwords"), null);
      assert.equal(body.get("num_speakers"), null);
      return { job_id: REMOTE_JOB_ID, status: "pending" as const };
    },
  );
  const attachRemoteJobIdMock = mock.method(
    transcribeActionDeps,
    "attachRemoteJobId",
    async () => ({ id: SESSION_ID }),
  );
  const markPendingSessionFailedMock = mock.method(
    transcribeActionDeps,
    "markPendingSessionFailed",
    async () => null,
  );

  t.after(() => {
    markPendingSessionFailedMock.mock.restore();
    attachRemoteJobIdMock.mock.restore();
    transcribeAudioMock.mock.restore();
    createPendingSessionMock.mock.restore();
    authMock.mock.restore();
  });

  const result = await transcribePost(formData);

  assert.deepEqual(result, {
    sessionId: SESSION_ID,
    jobId: REMOTE_JOB_ID,
    status: "pending",
  });
});
