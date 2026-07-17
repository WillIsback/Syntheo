import type { Session } from "@/data/sessions";
import { auth } from "@/lib/auth";
import { mapAppSessionToViewModel } from "@/lib/session-view";
import { sessionsStore } from "@/lib/sessions";
import { dbGetSession, dbListSessions } from "@/services/postgresql.service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const sessionActionDeps = {
  auth,
  dbListSessions,
  dbGetSession,
  withUserDbContext: sessionsStore.withUserDbContext,
  getScopedDb: sessionsStore.getScopedDb,
};

export const listSessions = async (): Promise<Session[]> => {
  "use server";
  const viewer = await sessionActionDeps.auth();
  const userId = viewer?.user?.id;
  if (!userId) return [];

  return sessionActionDeps.withUserDbContext(userId, async (client) => {
    const rows = await sessionActionDeps.dbListSessions(
      userId,
      sessionActionDeps.getScopedDb(client),
    );
    return rows.map((r) => mapAppSessionToViewModel(r));
  });
};

export const getSession = async (id: string): Promise<Session | null> => {
  "use server";
  if (!UUID_RE.test(id)) return null;

  const viewer = await sessionActionDeps.auth();
  const userId = viewer?.user?.id;
  if (!userId) return null;

  return sessionActionDeps.withUserDbContext(userId, async (client) => {
    const row = await sessionActionDeps.dbGetSession(
      id,
      userId,
      sessionActionDeps.getScopedDb(client),
    );
    return row ? mapAppSessionToViewModel(row, row.report) : null;
  });
};
