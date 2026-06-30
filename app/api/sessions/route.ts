import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { createSession } from "@/lib/db/queries";

export async function POST(req: NextRequest) {
	const userId = req.headers.get("x-user-id");
	if (!userId)
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { consentHash, consentVersion } = await req.json();
	if (!consentHash || !consentVersion) {
		return NextResponse.json(
			{ error: "Missing consent data" },
			{ status: 400 },
		);
	}

	const ipAddress =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		req.headers.get("x-real-ip") ??
		"unknown";

	const client = await getDb(userId);
	try {
		const { id: sessionId } = await createSession(client, {
			userId,
			consentHash,
			consentVersion,
			ipAddress,
		});
		return NextResponse.json({ sessionId }, { status: 201 });
	} finally {
		client.release();
	}
}
