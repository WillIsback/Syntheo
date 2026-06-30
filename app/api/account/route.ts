import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { deleteUserCascade } from "@/lib/db/queries";
import { logDataAccess } from "@/lib/otel/logger";

export async function DELETE(req: NextRequest) {
	const userId = req.headers.get("x-user-id");
	if (!userId)
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const client = await getDb(userId);
	try {
		await deleteUserCascade(client, userId);
	} finally {
		client.release();
	}

	logDataAccess(userId, "delete", "account_cascade");

	const res = NextResponse.json({ ok: true });
	res.cookies.delete("access_token");
	res.cookies.delete("refresh_token");
	return res;
}
