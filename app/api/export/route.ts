import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { exportUserData } from "@/lib/db/queries";
import { logDataAccess } from "@/lib/otel/logger";

export async function GET(req: NextRequest) {
	const userId = req.headers.get("x-user-id");
	if (!userId)
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const client = await getDb(userId);
	let data: Awaited<ReturnType<typeof exportUserData>>;
	try {
		data = await exportUserData(client, userId);
	} finally {
		client.release();
	}

	logDataAccess(userId, "export", "all_user_data");

	return new NextResponse(JSON.stringify(data, null, 2), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Content-Disposition": `attachment; filename="syntheo-export-${Date.now()}.json"`,
		},
	});
}
