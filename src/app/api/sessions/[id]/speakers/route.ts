import { NextResponse } from "next/server";
import * as z from "zod";

import { auth } from "@/lib/auth";
import { sessionsStore } from "@/lib/sessions";
import { dbUpdateSpeakerNames } from "@/services/postgresql.service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PatchBodySchema = z.object({
  speakerNames: z.record(z.string(), z.string()),
});

export const speakersRouteDeps = { auth, dbUpdateSpeakerNames };

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await speakersRouteDeps.auth();
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

  const updated = await sessionsStore.withUserDbContext(
    userId,
    async (client) =>
      speakersRouteDeps.dbUpdateSpeakerNames(
        id,
        userId,
        parsed.data.speakerNames,
        sessionsStore.getScopedDb(client),
      ),
  );

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({});
}
