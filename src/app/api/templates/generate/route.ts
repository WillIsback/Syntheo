import { NextResponse } from "next/server";
import * as z from "zod";
import { auth } from "@/lib/auth";
import { generateTemplateContent } from "@/services/llm.service";

const BodySchema = z.object({
  description: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request) {
  const viewer = await auth();
  if (!viewer?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const content = await generateTemplateContent(parsed.data.description);
    return NextResponse.json({ content });
  } catch (err) {
    console.error("[templates/generate]", err);
    return NextResponse.json({ error: "Génération échouée" }, { status: 502 });
  }
}
