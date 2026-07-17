"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { sessionsStore } from "@/lib/sessions";
import { dbDeleteSession } from "@/services/postgresql.service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function deleteSession(id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;

  const viewer = await auth();
  const userId = viewer?.user?.id;
  if (!userId) return false;

  const deleted = await sessionsStore.withUserDbContext(
    userId,
    async (client) =>
      dbDeleteSession(id, userId, sessionsStore.getScopedDb(client)),
  );

  if (deleted) revalidatePath("/", "layout");
  return deleted;
}
