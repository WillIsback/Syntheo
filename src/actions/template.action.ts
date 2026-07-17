"use server";

import { auth } from "@/lib/auth";
import { sessionsStore } from "@/lib/sessions";
import {
  dbGetTemplate,
  dbListTemplates,
  type ParsedTemplateRow,
} from "@/services/postgresql.service";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function listTemplates(): Promise<ParsedTemplateRow[]> {
  const uid = await requireUser();
  return sessionsStore.withUserDbContext(uid, async (client) =>
    dbListTemplates(uid, sessionsStore.getScopedDb(client)),
  );
}

export async function getTemplate(
  id: string,
): Promise<ParsedTemplateRow | null> {
  const uid = await requireUser();
  return sessionsStore.withUserDbContext(uid, async (client) =>
    dbGetTemplate(id, uid, sessionsStore.getScopedDb(client)),
  );
}
