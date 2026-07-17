import type { appSession } from "@/db/schema";
import type {
  SessionExportsPayload,
  SessionInputMetadata,
  SessionTranscriptPayload,
} from "@/schemas/postgresql.server.schema";
import {
  SessionExportsPayloadSchema,
  SessionTranscriptPayloadSchema,
} from "@/schemas/postgresql.server.schema";
import type { JobStatus } from "@/schemas/whisperx.server.schema";

type CompletedJobStatus = Extract<JobStatus, { status: "completed" }>;
type SessionRow = typeof appSession.$inferSelect;

export type ParsedSessionRow = Omit<
  SessionRow,
  "exportsPayload" | "transcriptPayload"
> & {
  transcriptPayload: SessionTranscriptPayload;
  exportsPayload: SessionExportsPayload;
};

export const parseSessionRow = (row: SessionRow): ParsedSessionRow => ({
  ...row,
  transcriptPayload: SessionTranscriptPayloadSchema.parse(
    row.transcriptPayload,
  ),
  exportsPayload: SessionExportsPayloadSchema.parse(row.exportsPayload),
});

export const buildPendingTranscriptPayload = (
  input: SessionInputMetadata,
): SessionTranscriptPayload => ({
  input,
  job: null,
  error: null,
});

export const mergeCompletedTranscriptPayload = (
  existing: SessionTranscriptPayload,
  job: CompletedJobStatus,
): SessionTranscriptPayload => ({
  ...existing,
  job,
  error: null,
});

export const mergeFailedTranscriptPayload = (
  existing: SessionTranscriptPayload,
  message: string,
): SessionTranscriptPayload => ({
  ...existing,
  job: null,
  error: {
    message,
    at: new Date().toISOString(),
  },
});
