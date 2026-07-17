import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createPendingSession } from "@/lib/sessions";

const InitBodySchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
  durationS: z.number().nonnegative().optional(),
});

export const initRouteDeps = {
  auth,
  createPendingSession,
  randomUUID,
};

export async function POST(request: Request) {
  const viewer = await initRouteDeps.auth();
  if (!viewer?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = InitBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { filename, mimeType, size, durationS } = parsed.data;

  const pendingSession = await initRouteDeps.createPendingSession({
    userUid: viewer.user.id,
    placeholderJobId: initRouteDeps.randomUUID(),
    input: { filename, mimeType, size, durationS },
  });

  return NextResponse.json({ sessionId: pendingSession.id });
}
