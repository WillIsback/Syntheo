import assert from "node:assert/strict";
import test from "node:test";
import { nextPollDelay } from "@/components/SessionLiveView";
import { mapAppSessionToViewModel } from "@/lib/session-view";

const baseRow = {
  id: "5bc7d20c-dfbf-4c35-b093-8cf5cdfc5899",
  jobId: "a14e14a6-0cdb-4707-83bc-ee2ad4f7004f",
  name: "meeting.wav",
  createdAt: "2026-07-11T11:56:21.049142+00:00",
  updatedAt: "2026-07-11T11:56:38.318566+00:00",
};

const completedJob = {
  job_id: "a14e14a6-0cdb-4707-83bc-ee2ad4f7004f",
  status: "completed" as const,
  created_at: "2026-07-11T11:56:21.049142+00:00",
  completed_at: "2026-07-11T11:56:38.318566+00:00",
  error: null,
  duration_s: 90,
  num_speakers: 2,
  segments: [
    { start: 0, end: 45, speaker: "SPEAKER_01", text: "Bonjour tout le monde" },
    {
      start: 45,
      end: 90,
      speaker: "SPEAKER_00",
      text: "Merci pour votre présence",
    },
  ],
};

test("completed session maps to blocks and speakers", () => {
  const vm = mapAppSessionToViewModel({
    ...baseRow,
    status: "completed",
    transcriptPayload: {
      input: { filename: "meeting.wav", mimeType: "audio/wav", size: 1024 },
      job: completedJob,
      error: null,
    },
    exportsPayload: { txt: "[SPEAKER_01]\nBonjour" },
  });

  assert.equal(vm.blocks.length, 2);
  assert.equal(vm.speakers.length, 2);
  assert.equal(vm.name, "meeting.wav");
  assert.equal(vm.id, baseRow.id);
});

test("speaker share is proportional to talk time", () => {
  const vm = mapAppSessionToViewModel({
    ...baseRow,
    status: "completed",
    transcriptPayload: {
      input: { filename: "call.wav", mimeType: "audio/wav", size: 2048 },
      job: completedJob,
      error: null,
    },
    exportsPayload: null,
  });

  const totalShare = vm.speakers.reduce((acc, s) => acc + s.share, 0);
  assert.ok(
    totalShare >= 98 && totalShare <= 102,
    `shares sum to ${totalShare}, expected ~100`,
  );
});

test("pending session maps with empty speakers and blocks", () => {
  const vm = mapAppSessionToViewModel({
    ...baseRow,
    status: "pending",
    transcriptPayload: {
      input: { filename: "upload.wav", mimeType: "audio/wav", size: 512 },
      job: null,
      error: null,
    },
    exportsPayload: null,
  });

  assert.equal(vm.blocks.length, 0);
  assert.equal(vm.speakers.length, 0);
  assert.equal(vm.durationMin, 0);
});

test("segment timestamps are formatted as MM:SS", () => {
  const vm = mapAppSessionToViewModel({
    ...baseRow,
    status: "completed",
    transcriptPayload: {
      input: { filename: "long.wav", mimeType: "audio/wav", size: 8192 },
      job: {
        ...completedJob,
        duration_s: 130,
        segments: [
          {
            start: 65,
            end: 130,
            speaker: "SPEAKER_00",
            text: "Fin de session",
          },
        ],
      },
      error: null,
    },
    exportsPayload: null,
  });

  assert.equal(vm.blocks[0].ts, "01:05");
});

test("nextPollDelay returns 2s for the first 3 attempts", () => {
  assert.equal(nextPollDelay(0), 2_000);
  assert.equal(nextPollDelay(1), 2_000);
  assert.equal(nextPollDelay(2), 2_000);
});

test("nextPollDelay backs off to 5s then 10s", () => {
  assert.equal(nextPollDelay(3), 5_000);
  assert.equal(nextPollDelay(5), 5_000);
  assert.equal(nextPollDelay(6), 10_000);
});
