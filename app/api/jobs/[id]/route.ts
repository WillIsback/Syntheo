import { type NextRequest, NextResponse } from "next/server";
import { pollJob } from "@/lib/whisperx/client";

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const userId = req.headers.get("x-user-id");
	if (!userId)
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { id } = await params;
	const result = await pollJob(id);
	if (!result) return NextResponse.json({ status: "pending" });
	return NextResponse.json(result);
}
