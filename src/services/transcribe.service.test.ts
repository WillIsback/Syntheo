import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { JobStatusSchema } from "@/schemas/whisperx.server.schema";
import {
  getFormattedExport,
  transcribeAudioStream,
} from "@/services/transcribe.service";

const COMPLETED_PAYLOAD = {
  job_id: "a14e14a6-0cdb-4707-83bc-ee2ad4f7004f",
  status: "completed" as const,
  created_at: "2026-07-11T11:56:21.049142+00:00",
  completed_at: "2026-07-11T11:56:38.318566+00:00",
  error: null,
  duration_s: 15.72,
  num_speakers: 2,
  segments: [{ start: 0, end: 1, speaker: "SPEAKER_01", text: "Bonjour" }],
};

test("JobStatusSchema accepts the completed WhisperX payload shape", () => {
  const parsed = JobStatusSchema.parse(COMPLETED_PAYLOAD);

  assert.equal(parsed.status, "completed");
  assert.equal(parsed.segments[0]?.speaker, "SPEAKER_01");
});

test("JobStatusSchema rejects non-ISO timestamps in completed payloads", () => {
  assert.throws(
    () =>
      JobStatusSchema.parse({
        ...COMPLETED_PAYLOAD,
        created_at: "yesterday",
        completed_at: "later",
      }),
    /created_at|completed_at/,
  );
});

test("formatted txt exports are returned as raw plain text", async (t) => {
  const originalApiKey = process.env.WHISPERX_API_KEY;
  process.env.WHISPERX_API_KEY = "test-api-key";

  const fetchMock = mock.method(globalThis, "fetch", async (input, init) => {
    assert.equal(
      input,
      "https://api.willisback.fr/whisper/asr/v1/jobs/job-123/txt",
    );
    assert.deepEqual(init?.headers, {
      Authorization: "Bearer test-api-key",
    });

    return new Response("[SPEAKER_01]\nBonjour", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  });

  t.after(() => {
    fetchMock.mock.restore();
    if (originalApiKey === undefined) {
      delete process.env.WHISPERX_API_KEY;
      return;
    }

    process.env.WHISPERX_API_KEY = originalApiKey;
  });

  const text = await getFormattedExport("job-123", "txt");

  assert.equal(text, "[SPEAKER_01]\nBonjour");
});

test("formatted exports fail clearly when WHISPERX_API_KEY is missing", async () => {
  const originalApiKey = process.env.WHISPERX_API_KEY;
  delete process.env.WHISPERX_API_KEY;

  try {
    await assert.rejects(
      () => getFormattedExport("job-123", "txt"),
      /WHISPERX_API_KEY is not set in the environment variables\./,
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.WHISPERX_API_KEY;
    } else {
      process.env.WHISPERX_API_KEY = originalApiKey;
    }
  }
});

// ── transcribeAudioStream ────────────────────────────────────────────────────

test("transcribeAudioStream appelle WhisperX en multipart/form-data et retourne le job", async (t) => {
  const originalApiKey = process.env.WHISPERX_API_KEY;
  process.env.WHISPERX_API_KEY = "test-api-key";
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          job_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          status: "pending",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  );
  t.after(() => {
    fetchMock.mock.restore();
    if (originalApiKey === undefined) {
      delete process.env.WHISPERX_API_KEY;
    } else {
      process.env.WHISPERX_API_KEY = originalApiKey;
    }
  });

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      ctrl.enqueue(new TextEncoder().encode("fake-audio"));
      ctrl.close();
    },
  });

  const result = await transcribeAudioStream(
    stream,
    "meeting.mp3",
    "audio/mpeg",
  );

  assert.equal(result.job_id, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  assert.equal(result.status, "pending");
  assert.equal(fetchMock.mock.calls.length, 1);

  const [url, init] = fetchMock.mock.calls[0].arguments as [
    string,
    RequestInit & { duplex?: string },
  ];
  assert.ok(url.endsWith("/transcribe"), `URL inattendue : ${url}`);
  assert.ok(
    (init.headers as Record<string, string>)["Content-Type"]?.includes(
      "multipart/form-data; boundary=",
    ),
    "Content-Type devrait être multipart/form-data avec boundary",
  );
  assert.equal(init.duplex, "half");
});

test("transcribeAudioStream lève une erreur sur réponse non-ok de WhisperX", async (t) => {
  const originalApiKey = process.env.WHISPERX_API_KEY;
  process.env.WHISPERX_API_KEY = "test-api-key";
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("Internal Server Error", {
        status: 500,
        statusText: "Internal Server Error",
      }),
  );
  t.after(() => {
    fetchMock.mock.restore();
    if (originalApiKey === undefined) {
      delete process.env.WHISPERX_API_KEY;
    } else {
      process.env.WHISPERX_API_KEY = originalApiKey;
    }
  });

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      ctrl.enqueue(new TextEncoder().encode("audio"));
      ctrl.close();
    },
  });

  await assert.rejects(
    () => transcribeAudioStream(stream, "a.mp3", "audio/mpeg"),
    /500/,
  );
});
