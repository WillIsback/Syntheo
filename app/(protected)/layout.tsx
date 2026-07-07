import { headers } from "next/headers";
import AppShell from "@/components/layout/app-shell";
import { getDb } from "@/lib/db/client";
import { getSessionsForUser } from "@/lib/db/queries";

export default async function ProtectedLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const headersList = await headers();
	const userName = headersList.get("x-user-name") ?? undefined;
	const userId = headersList.get("x-user-id");

	let recentSessions: { id: string; createdAt: string }[] = [];
	if (userId) {
		// Lecture de métadonnées de navigation uniquement (id + date, aucun contenu) —
		// volontairement non journalisée pour éviter de saturer l'audit RGPD à chaque navigation.
		// Navigation metadata only (id + date, no content) — intentionally not audit-logged
		// to avoid flooding the RGPD audit trail on every navigation.
		const client = await getDb(userId);
		try {
			const sessions = await getSessionsForUser(client);
			recentSessions = sessions.slice(0, 6).map((s) => ({
				id: s.id,
				createdAt:
					s.createdAt instanceof Date
						? s.createdAt.toISOString()
						: String(s.createdAt),
			}));
		} finally {
			client.release();
		}
	}

	return (
		<AppShell userName={userName} recentSessions={recentSessions}>
			{children}
		</AppShell>
	);
}
