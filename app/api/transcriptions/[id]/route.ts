import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import type { Segment } from "@/lib/db/queries";
import { updateTranscriptionSpeakers } from "@/lib/db/queries";

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const userId = req.headers.get("x-user-id");
	if (!userId)
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { id } = await params;
	const { segments }: { segments: Segment[] } = await req.json();

	const client = await getDb(userId);
	try {
		await updateTranscriptionSpeakers(client, id, segments);
		return NextResponse.json({ ok: true });
	} finally {
		client.release();
	}
}
