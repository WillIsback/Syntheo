import { type NextRequest, NextResponse } from "next/server";
import { submitTranscription } from "@/lib/whisperx/client";

export async function POST(req: NextRequest) {
	const userId = req.headers.get("x-user-id");
	if (!userId)
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const form = await req.formData();
	const audioBlob = form.get("audio_blob") as Blob | null;
	const language = (form.get("language") as string) ?? "fr";

	if (!audioBlob)
		return NextResponse.json({ error: "No audio" }, { status: 400 });

	const { jobId } = await submitTranscription(audioBlob, language);
	return NextResponse.json({ jobId }, { status: 202 });
}
