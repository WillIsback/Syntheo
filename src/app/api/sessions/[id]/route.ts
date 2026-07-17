import { NextResponse } from "next/server";
import * as z from "zod";

import { auth } from "@/lib/auth";
import { validateSessionName } from "@/lib/session-name";
import { sessionsStore } from "@/lib/sessions";
import { dbRenameSession } from "@/services/postgresql.service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PatchBodySchema = z.object({
  name: z.string(),
});

export const renameRouteDeps = { auth, dbRenameSession };

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await renameRouteDeps.auth();
  const userId = viewer?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = PatchBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const trimmedName = parsed.data.name.trim();
  const validationError = validateSessionName(trimmedName);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const result = await sessionsStore.withUserDbContext(userId, async (client) =>
    renameRouteDeps.dbRenameSession(
      id,
      userId,
      trimmedName,
      sessionsStore.getScopedDb(client),
    ),
  );

  if (result === "conflict") {
    return NextResponse.json(
      { error: "Ce nom est déjà utilisé" },
      { status: 409 },
    );
  }
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ name: result.name });
}
