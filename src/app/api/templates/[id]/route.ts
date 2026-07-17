import { NextResponse } from "next/server";
import * as z from "zod";

import { auth } from "@/lib/auth";
import { sessionsStore } from "@/lib/sessions";
import {
  dbDeleteTemplate,
  dbGetTemplate,
  dbUpdateTemplate,
} from "@/services/postgresql.service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UpdateBodySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  icon: z.string().trim().min(1).max(10).optional(),
  content: z.string().trim().min(1).max(20000).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await auth();
  const userId = viewer?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const row = await sessionsStore.withUserDbContext(userId, async (client) =>
    dbGetTemplate(id, userId, sessionsStore.getScopedDb(client)),
  );

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await auth();
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

  const parsed = UpdateBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const row = await sessionsStore.withUserDbContext(userId, async (client) =>
    dbUpdateTemplate(
      id,
      userId,
      parsed.data,
      sessionsStore.getScopedDb(client),
    ),
  );

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await auth();
  const userId = viewer?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const ok = await sessionsStore.withUserDbContext(userId, async (client) =>
    dbDeleteTemplate(id, userId, sessionsStore.getScopedDb(client)),
  );

  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
