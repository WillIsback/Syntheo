import { DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getS3Client, S3_BUCKET } from "@/lib/s3";
import {
  attachRemoteJobId,
  getOwnedSession,
  markPendingSessionFailed,
} from "@/lib/sessions";
import { transcribeAudioStream } from "@/services/transcribe.service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BodySchema = z.object({
  objectKey: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
});

export const audioRouteDeps = {
  auth,
  getOwnedSession,
  getS3Client,
  getSignedUrl,
  transcribeAudioStream,
  attachRemoteJobId,
  markPendingSessionFailed,
};

/**
 * The client already uploaded the audio file straight to MinIO (see
 * upload-url/route.ts) — Vercel Functions cap request bodies at ~4.5MB,
 * too small for real meeting recordings. This route just fetches the
 * object server-side and relays it to WhisperX, same as before.
 */
export async function POST(
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
  const { objectKey, filename, mimeType } = parsed.data;

  const s3Client = audioRouteDeps.getS3Client();
  const getUrl = await audioRouteDeps.getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: S3_BUCKET(), Key: objectKey }),
    { expiresIn: 300 },
  );

  const s3Response = await fetch(getUrl);
  if (!s3Response.ok || !s3Response.body) {
    return NextResponse.json(
      { error: "Uploaded audio not found" },
      { status: 400 },
    );
  }

  let remoteJob: { job_id: string; status: "pending" };
  try {
    remoteJob = await audioRouteDeps.transcribeAudioStream(
      s3Response.body,
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

  await s3Client
    .send(new DeleteObjectCommand({ Bucket: S3_BUCKET(), Key: objectKey }))
    .catch(() => {});

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
