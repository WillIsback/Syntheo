import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "@/db/schema";
import { appSession } from "@/db/schema";
import { type EdgeDbTransaction, withUserDbContextEdge } from "@/lib/db-edge";
import {
  mergeFailedTranscriptPayload,
  type ParsedSessionRow,
  parseSessionRow,
} from "@/lib/session-payload";

/**
 * Edge Runtime counterparts of the getOwnedSession/attachRemoteJobId/
 * markPendingSessionFailed trio in sessions.ts, needed by the audio upload
 * route (which must run on Edge to avoid Vercel's 4.5MB Node body limit).
 * `pg` (node-postgres) can't run on Edge, so this uses the WebSocket-based
 * Neon driver instead — same transaction/RLS semantics, different transport.
 */
const sessionsEdgeStore = {
  withUserDbContext: withUserDbContextEdge,
  getScopedDb: (client: Parameters<EdgeDbTransaction<unknown>>[0]) =>
    drizzle(client, { schema }),
};

export const getOwnedSessionEdge = async (
  sessionId: string,
  userUid: string,
): Promise<ParsedSessionRow | null> =>
  sessionsEdgeStore.withUserDbContext(userUid, async (client) => {
    const [row] = await sessionsEdgeStore
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

export const attachRemoteJobIdEdge = async (
  sessionId: string,
  userUid: string,
  jobId: string,
): Promise<ParsedSessionRow | null> =>
  sessionsEdgeStore.withUserDbContext(userUid, async (client) => {
    const [updated] = await sessionsEdgeStore
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

export const markPendingSessionFailedEdge = async (
  sessionId: string,
  userUid: string,
  placeholderJobId: string,
  message: string,
): Promise<ParsedSessionRow | null> =>
  sessionsEdgeStore.withUserDbContext(userUid, async (client) => {
    const [current] = await sessionsEdgeStore
      .getScopedDb(client)
      .select()
      .from(appSession)
      .where(and(eq(appSession.id, sessionId), eq(appSession.userUid, userUid)))
      .limit(1);

    if (!current) {
      return null;
    }

    const [updated] = await sessionsEdgeStore
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
