import { NextResponse } from "next/server";
import * as z from "zod";

import { auth } from "@/lib/auth";
import { sessionsStore } from "@/lib/sessions";
import { generateCompteRendu } from "@/services/llm.service";
import { dbGetSession, dbSaveReport } from "@/services/postgresql.service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PostBodySchema = z.object({
  templateId: z.string().min(1),
  templateName: z.string().min(1),
  templateContent: z.string().min(1),
  speakerNames: z.record(z.string(), z.string()).default({}),
});

export async function POST(
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
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { templateId, templateName, templateContent, speakerNames } =
    parsed.data;

  const sessionRow = await sessionsStore.withUserDbContext(
    userId,
    async (client) =>
      dbGetSession(id, userId, sessionsStore.getScopedDb(client)),
  );

  if (!sessionRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (sessionRow.status !== "completed") {
    return NextResponse.json(
      { error: "Session not yet completed" },
      { status: 422 },
    );
  }

  const job = sessionRow.transcriptPayload.job;
  if (job?.status !== "completed") {
    return NextResponse.json(
      { error: "Transcript not available" },
      { status: 422 },
    );
  }

  const segments = job.segments.map((seg) => ({
    speaker: seg.speaker,
    text: seg.text,
    start: seg.start,
  }));

  const sections = await generateCompteRendu({
    templateContent,
    segments,
    speakerNames,
    filename: sessionRow.transcriptPayload.input.filename,
  });

  const modelTag = `Mistral-Small-3.2 · ${new Date().toLocaleDateString("fr-FR")}`;

  const savedReport = await sessionsStore.withUserDbContext(
    userId,
    async (client) =>
      dbSaveReport(
        {
          sessionId: id,
          userUid: userId,
          templateId,
          templateName,
          modelTag,
          speakerNames,
          sections,
        },
        sessionsStore.getScopedDb(client),
      ),
  );

  return NextResponse.json({
    templateId: savedReport.templateId,
    templateName: savedReport.templateName,
    modelTag: savedReport.modelTag,
    sections: savedReport.sections,
  });
}
