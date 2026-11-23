import { commands as fsSyncCommands } from "@syntheo/plugin-fs-sync";
import { commands } from "@syntheo/plugin-session";

import {
  requireBasename,
  requireText,
  SHA256_PATTERN,
  validateAttachmentInput,
} from "./attachment-validation";
import { enqueueSessionAudioOperation } from "./audio-operations";

import { enqueueDatabaseWrite } from "~/db/write-queue";

export async function catalogLocalNoteAttachment(input: {
  sessionId: string;
  attachmentId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}): Promise<void> {
  const sessionId = requireText(input.sessionId, "session ID", 512);
  const { attachmentId, filename, contentType } =
    validateAttachmentInput(input);

  await enqueueDatabaseWrite(`session:${sessionId}`, async () => {
    const result = await commands.catalogNoteAttachment({
      session_id: sessionId,
      attachment_id: attachmentId,
      filename,
      content_type: contentType,
      size_bytes: input.sizeBytes,
      sha256: input.sha256,
    });
    if (result.status === "error") {
      throw new Error(result.error);
    }
  });
}

export async function catalogLocalSessionAudio(
  inputSessionId: string,
): Promise<void> {
  const sessionId = requireText(inputSessionId, "session ID", 512);
  await enqueueDatabaseWrite(`session:${sessionId}`, async () => {
    const result = await fsSyncCommands.audioMetadata(sessionId);
    if (result.status === "error") {
      throw new Error(result.error);
    }
    if (!result.data) {
      throw new Error("audio_path_not_found");
    }

    const filename = requireBasename(result.data.filename, "audio filename");
    const contentType = requireText(
      result.data.contentType,
      "audio content type",
      512,
    );
    if (
      !Number.isSafeInteger(result.data.sizeBytes) ||
      result.data.sizeBytes < 0
    ) {
      throw new Error("invalid audio size");
    }
    if (!SHA256_PATTERN.test(result.data.sha256)) {
      throw new Error("invalid audio checksum");
    }

    const commandResult = await commands.catalogSessionAudio({
      session_id: sessionId,
      filename,
      content_type: contentType,
      size_bytes: result.data.sizeBytes,
      sha256: result.data.sha256,
    });
    if (commandResult.status === "error") {
      throw new Error(commandResult.error);
    }
  });
}

export async function markSessionAudioTranscriptionComplete(
  inputSessionId: string,
): Promise<void> {
  const sessionId = requireText(inputSessionId, "session ID", 512);
  await enqueueDatabaseWrite(`session:${sessionId}`, async () => {
    const result = await commands.markSessionAudioTranscriptionComplete({
      session_id: sessionId,
    });
    if (result.status === "error") {
      throw new Error(result.error);
    }
  });
}

export async function deleteSessionAudio(
  inputSessionId: string,
  canDelete: () => boolean,
): Promise<boolean> {
  const sessionId = requireText(inputSessionId, "session ID", 512);
  return enqueueSessionAudioOperation(sessionId, () =>
    enqueueDatabaseWrite(`session:${sessionId}`, async () => {
      if (!canDelete()) {
        return false;
      }
      await tombstoneSessionAudioMetadata(sessionId);
      await deleteSessionAudioFile(sessionId);
      return true;
    }),
  );
}

async function deleteSessionAudioFile(sessionId: string): Promise<boolean> {
  const result = await fsSyncCommands.audioDelete(sessionId);
  if (result.status === "error") {
    throw new Error(result.error);
  }
  await markSessionAudioAvailability(sessionId, "absent");
  return result.data;
}

async function markSessionAudioAvailability(
  sessionId: string,
  availability: "present" | "absent",
): Promise<void> {
  if (availability === "absent") {
    const result = await commands.markSessionAudioAbsent({
      session_id: sessionId,
    });
    if (result.status === "error") {
      throw new Error(result.error);
    }
  }
}

async function tombstoneSessionAudioMetadata(sessionId: string): Promise<void> {
  const result = await commands.tombstoneSessionAudio({
    session_id: sessionId,
  });
  if (result.status === "error") {
    throw new Error(result.error);
  }
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
