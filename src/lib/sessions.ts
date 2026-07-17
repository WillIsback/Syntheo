import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { appSession } from "@/db/schema";
import { type DbTransaction, getDb, withUserDbContext } from "@/lib/db";
import type {
  SessionExportsPayload,
  SessionInputMetadata,
  SessionTranscriptPayload,
} from "@/schemas/postgresql.server.schema";
import {
  SessionExportsPayloadSchema,
  SessionInsertSchema,
  SessionTranscriptPayloadSchema,
} from "@/schemas/postgresql.server.schema";
import type { JobStatus } from "@/schemas/whisperx.server.schema";
import {
  getFormattedExport,
  getJobStatus,
} from "@/services/transcribe.service";

type CompletedJobStatus = Extract<JobStatus, { status: "completed" }>;
type SessionRow = typeof appSession.$inferSelect;
export type ParsedSessionRow = Omit<
  SessionRow,
  "exportsPayload" | "transcriptPayload"
> & {
  transcriptPayload: SessionTranscriptPayload;
  exportsPayload: SessionExportsPayload;
};

export const sessionsStore = {
  getDb,
  withUserDbContext,
  getScopedDb: (client: Parameters<DbTransaction<unknown>>[0]) =>
    drizzle(client, { schema }),
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

const validatePendingInsert = (params: {
  userUid: string;
  placeholderJobId: string;
  input: SessionInputMetadata;
}) => {
  const transcriptPayload = SessionTranscriptPayloadSchema.parse(
    buildPendingTranscriptPayload(params.input),
  );

  SessionInsertSchema.parse({
    user_uid: params.userUid,
    job_id: params.placeholderJobId,
    name: params.input.filename,
    status: "pending",
    transcript_payload: transcriptPayload,
    exports_payload: null,
  });

  return transcriptPayload;
};

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

export const createPendingSession = async (params: {
  userUid: string;
  placeholderJobId: string;
  input: SessionInputMetadata;
}) => {
  const transcriptPayload = validatePendingInsert(params);

  return sessionsStore.withUserDbContext(params.userUid, async (client) => {
    const [inserted] = await sessionsStore
      .getScopedDb(client)
      .insert(appSession)
      .values({
        userUid: params.userUid,
        jobId: params.placeholderJobId,
        name: params.input.filename,
        status: "pending",
        transcriptPayload,
        exportsPayload: null,
      })
      .returning();

    return parseSessionRow(inserted);
  });
};

export const attachRemoteJobId = async (
  sessionId: string,
  userUid: string,
  jobId: string,
) =>
  sessionsStore.withUserDbContext(userUid, async (client) => {
    const [updated] = await sessionsStore
      .getScopedDb(client)
      .update(appSession)
      .set({
        jobId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(appSession.id, sessionId))
      .returning();

    return updated ? parseSessionRow(updated) : null;
  });

export const markPendingSessionFailed = async (
  sessionId: string,
  userUid: string,
  placeholderJobId: string,
  message: string,
) =>
  sessionsStore.withUserDbContext(userUid, async (client) => {
    const [current] = await sessionsStore
      .getScopedDb(client)
      .select()
      .from(appSession)
      .where(and(eq(appSession.id, sessionId), eq(appSession.userUid, userUid)))
      .limit(1);

    if (!current) {
      return null;
    }

    const [updated] = await sessionsStore
      .getScopedDb(client)
      .update(appSession)
      .set({
        status: "failed",
        transcriptPayload: mergeFailedTranscriptPayload(
          parseSessionRow(current).transcriptPayload,
          message,
        ),
        exportsPayload: { error: message },
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(appSession.id, sessionId),
          eq(appSession.userUid, userUid),
          eq(appSession.jobId, placeholderJobId),
          eq(appSession.status, "pending"),
        ),
      )
      .returning();

    return updated ? parseSessionRow(updated) : null;
  });

export const getOwnedSession = async (sessionId: string, userUid: string) =>
  sessionsStore.withUserDbContext(userUid, async (client) => {
    const [row] = await sessionsStore
      .getScopedDb(client)
      .select()
      .from(appSession)
      .where(and(eq(appSession.id, sessionId), eq(appSession.userUid, userUid)))
      .limit(1);

    if (!row) {
      return null;
    }

    return parseSessionRow(row);
  });

export const listOwnedSessions = async (userUid: string) =>
  sessionsStore.withUserDbContext(userUid, async (client) =>
    sessionsStore
      .getScopedDb(client)
      .select()
      .from(appSession)
      .where(eq(appSession.userUid, userUid))
      .orderBy(desc(appSession.createdAt))
      .then((rows) => rows.map(parseSessionRow)),
  );

export const sessionRefreshDeps = {
  getOwnedSession,
  getJobStatus,
  getFormattedExport,
};

export const refreshSessionFromRemote = async (params: {
  sessionId: string;
  userUid: string;
}) => {
  const session = await sessionRefreshDeps.getOwnedSession(
    params.sessionId,
    params.userUid,
  );

  if (!session) {
    return null;
  }

  if (session.status === "completed" || session.status === "failed") {
    return session;
  }

  const remote = await sessionRefreshDeps.getJobStatus(session.jobId);

  const persistRefreshedSession = async (
    setValues: Partial<typeof appSession.$inferInsert>,
  ) => {
    const updated = await sessionsStore.withUserDbContext(
      params.userUid,
      async (client) => {
        const [row] = await sessionsStore
          .getScopedDb(client)
          .update(appSession)
          .set({
            ...setValues,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(appSession.id, session.id),
              eq(appSession.userUid, params.userUid),
              eq(appSession.jobId, session.jobId),
              eq(appSession.status, session.status),
            ),
          )
          .returning();

        return row ? parseSessionRow(row) : session;
      },
    );

    return updated;
  };

  if (remote.status === "completed") {
    try {
      const txt = await sessionRefreshDeps.getFormattedExport(
        remote.job_id,
        "txt",
      );

      return persistRefreshedSession({
        status: "completed",
        transcriptPayload: mergeCompletedTranscriptPayload(
          session.transcriptPayload,
          remote,
        ),
        exportsPayload: { txt },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Job not yet completed") {
        return persistRefreshedSession({
          status: "processing",
          transcriptPayload: mergeCompletedTranscriptPayload(
            session.transcriptPayload,
            remote,
          ),
          exportsPayload: session.exportsPayload,
        });
      }

      throw error;
    }
  }

  if (remote.status === "failed") {
    return persistRefreshedSession({
      status: "failed",
      transcriptPayload: mergeFailedTranscriptPayload(
        session.transcriptPayload,
        remote.error,
      ),
      exportsPayload: { error: remote.error },
    });
  }

  return persistRefreshedSession({
    status: remote.status,
  });
};
