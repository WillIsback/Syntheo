import Link from "next/link";
import type { Session } from "@/lib/db/queries";

interface SessionListProps {
	sessions: Session[];
}

export default function SessionList({ sessions }: SessionListProps) {
	if (!sessions.length) {
		return (
			<div className="text-center py-16 text-[var(--color-text-3)]">
				<p className="text-2xl mb-3">🎙</p>
				<p>Aucune session encore / No sessions yet</p>
				<Link
					href="/sessions/new"
					className="mt-4 inline-block px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius)] text-sm"
				>
					Nouvelle session / New session
				</Link>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			{sessions.map((s) => (
				<Link
					key={s.id}
					href={`/sessions/${s.id}`}
					className="flex items-center justify-between p-4 bg-[var(--color-surface)] rounded-[var(--radius)] border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors"
				>
					<div className="flex items-center gap-3">
						<span className="text-xl">🎙</span>
						<div>
							<p className="text-sm font-medium text-[var(--color-text)]">
								{new Date(s.createdAt).toLocaleDateString("fr-FR", {
									day: "numeric",
									month: "long",
									year: "numeric",
								})}
							</p>
							<p className="text-xs text-[var(--color-text-3)]">
								CGU v{s.consentVersion}
							</p>
						</div>
					</div>
					<span className="text-[var(--color-text-3)]">›</span>
				</Link>
			))}
		</div>
	);
}
