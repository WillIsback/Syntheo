import { headers } from "next/headers";
import SessionList from "@/components/session-list";
import { getDb } from "@/lib/db/client";
import { getSessionsForUser } from "@/lib/db/queries";
import { logDataAccess } from "@/lib/otel/logger";

export default async function SessionsPage() {
	const headersList = await headers();
	const userId = headersList.get("x-user-id");
	if (!userId) return null;

	const client = await getDb(userId);
	let sessions: Awaited<ReturnType<typeof getSessionsForUser>>;
	try {
		sessions = await getSessionsForUser(client);
	} finally {
		client.release();
	}

	logDataAccess(userId, "read", "sessions_list");

	return (
		<div className="max-w-2xl mx-auto">
			<div className="flex items-center justify-between mb-6">
				<h1 className="text-xl font-semibold">Sessions</h1>
			</div>
			<SessionList sessions={sessions} />
		</div>
	);
}
