import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  attachRemoteJobId,
  getOwnedSession,
  markPendingSessionFailed,
} from "@/lib/sessions";
import { transcribeAudioStream } from "@/services/transcribe.service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const audioRouteDeps = {
  auth,
  getOwnedSession,
  transcribeAudioStream,
  attachRemoteJobId,
  markPendingSessionFailed,
};

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const viewer = await audioRouteDeps.auth();
  if (!viewer?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const existingSession = await audioRouteDeps.getOwnedSession(
    sessionId,
    viewer.user.id,
  );
  if (!existingSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (!request.body) {
    return NextResponse.json({ error: "No audio body" }, { status: 400 });
  }

  const filename = request.headers.get("x-filename") ?? "audio";
  const mimeType =
    request.headers.get("content-type") ?? "application/octet-stream";

  let remoteJob: { job_id: string; status: "pending" };
  try {
    remoteJob = await audioRouteDeps.transcribeAudioStream(
      request.body,
      filename,
      mimeType,
    );
  } catch (error) {
    await audioRouteDeps
      .markPendingSessionFailed(
        sessionId,
        viewer.user.id,
        existingSession.jobId,
        error instanceof Error ? error.message : "Upload failed",
      )
      .catch(() => {});
    throw error;
  }

  const attached = await audioRouteDeps.attachRemoteJobId(
    sessionId,
    viewer.user.id,
    remoteJob.job_id,
  );
  if (!attached) {
    return NextResponse.json(
      { error: "Failed to attach job id" },
      { status: 500 },
    );
  }

  return NextResponse.json({ jobId: remoteJob.job_id, status: "pending" });
}
