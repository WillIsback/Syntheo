import { NextResponse } from "next/server";
import * as z from "zod";

import { auth } from "@/lib/auth";
import { sessionsStore } from "@/lib/sessions";
import {
  dbCreateTemplate,
  dbListTemplates,
} from "@/services/postgresql.service";

const CreateBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  icon: z.string().trim().min(1).max(10).default("📝"),
  content: z.string().trim().min(1).max(20000),
});

export async function GET() {
  const viewer = await auth();
  const userId = viewer?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await sessionsStore.withUserDbContext(userId, async (client) =>
    dbListTemplates(userId, sessionsStore.getScopedDb(client)),
  );

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const viewer = await auth();
  const userId = viewer?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = CreateBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const row = await sessionsStore.withUserDbContext(userId, async (client) =>
    dbCreateTemplate(
      { ...parsed.data, userUid: userId },
      sessionsStore.getScopedDb(client),
    ),
  );

  return NextResponse.json(row, { status: 201 });
}
