import { headers } from "next/headers";
import Link from "next/link";
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
		<div className="mx-auto max-w-[var(--doc-max-w)] px-[var(--space-5)] py-[var(--space-6)]">
			<div className="mb-[var(--space-5)] flex items-center justify-between">
				<h1 className="text-2xl font-normal tracking-tight text-[var(--color-text)]">
					Sessions
				</h1>
				<Link
					href="/sessions/new"
					className="rounded-full bg-[var(--color-primary)] px-[var(--space-4)] py-[var(--space-2)] text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-dark)]"
				>
					+ Nouvelle / New
				</Link>
			</div>
			<SessionList sessions={sessions} />
		</div>
	);
}
