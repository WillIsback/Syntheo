import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getS3Client, S3_BUCKET } from "@/lib/s3";
import { getOwnedSession } from "@/lib/sessions";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BodySchema = z.object({
  mimeType: z.string().min(1),
});

export const uploadUrlRouteDeps = {
  auth,
  getOwnedSession,
  getS3Client,
  getSignedUrl,
};

/**
 * Returns a presigned PUT URL so the browser can upload the audio file
 * directly to MinIO, bypassing Vercel Functions' request payload cap
 * (~4.5MB on both Node and Edge runtimes).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const viewer = await uploadUrlRouteDeps.auth();
  if (!viewer?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const existingSession = await uploadUrlRouteDeps.getOwnedSession(
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

  const objectKey = `${viewer.user.id}/${sessionId}`;

  const uploadUrl = await uploadUrlRouteDeps.getSignedUrl(
    uploadUrlRouteDeps.getS3Client(),
    new PutObjectCommand({
      Bucket: S3_BUCKET(),
      Key: objectKey,
      ContentType: parsed.data.mimeType,
    }),
    { expiresIn: 900 },
  );

  return NextResponse.json({ uploadUrl, objectKey });
}
