"use server";

import { randomUUID } from "node:crypto";

import { auth } from "@/lib/auth";
import {
  attachRemoteJobId,
  createPendingSession,
  markPendingSessionFailed,
} from "@/lib/sessions";
import { TranscribeRequestSchema } from "@/schemas/whisperx.client.schema";
import type { TranscribeResponse } from "@/schemas/whisperx.server.schema";
import { transcribeAudio } from "@/services/transcribe.service";

export const transcribeActionDeps = {
  auth,
  createPendingSession,
  attachRemoteJobId,
  markPendingSessionFailed,
  transcribeAudio,
  randomUUID,
};

const toOptionalString = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

export async function transcribePost(formData: FormData) {
  const session = await transcribeActionDeps.auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const file = formData.get("file");
  const language = toOptionalString(formData.get("language"));
  const initialPrompt = toOptionalString(formData.get("initial_prompt"));
  const hotwords = toOptionalString(formData.get("hotwords"));
  const numSpeakers = toOptionalString(formData.get("num_speakers"));

  if (!(file instanceof File)) {
    throw new TypeError("No file provided");
  }

  const payloadValidation = TranscribeRequestSchema.safeParse({
    audio_file: file,
    language,
    initial_prompt: initialPrompt,
    hotwords,
    num_speakers: numSpeakers,
  });

  if (!payloadValidation.success) {
    throw new Error("Invalid payload");
  }

  const pendingSession = await transcribeActionDeps.createPendingSession({
    userUid: session.user.id,
    placeholderJobId: transcribeActionDeps.randomUUID(),
    input: {
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    },
  });

  const remoteBody = new FormData();
  remoteBody.set("audio_file", payloadValidation.data.audio_file);
  if (language) {
    remoteBody.set("language", language);
  }
  if (initialPrompt) {
    remoteBody.set("initial_prompt", initialPrompt);
  }
  if (hotwords) {
    remoteBody.set("hotwords", hotwords);
  }
  if (numSpeakers) {
    remoteBody.set("num_speakers", numSpeakers);
  }

  let remoteJob: TranscribeResponse;

  try {
    remoteJob = await transcribeActionDeps.transcribeAudio(remoteBody);
  } catch (error) {
    try {
      await transcribeActionDeps.markPendingSessionFailed(
        pendingSession.id,
        session.user.id,
        pendingSession.jobId,
        error instanceof Error
          ? error.message
          : "Transcription submission failed",
      );
    } catch {
      // Best effort: preserve the original submit error.
    }

    throw error;
  }

  const attachedSession = await transcribeActionDeps.attachRemoteJobId(
    pendingSession.id,
    session.user.id,
    remoteJob.job_id,
  );

  if (!attachedSession) {
    throw new Error("Failed to persist remote job id");
  }

  return {
    sessionId: pendingSession.id,
    jobId: remoteJob.job_id,
    status: "pending" as const,
  };
}
