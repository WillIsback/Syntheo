import Link from "next/link";
import type { Session } from "@/lib/db/queries";

interface SessionListProps {
	sessions: Session[];
}

export default function SessionList({ sessions }: SessionListProps) {
	if (!sessions.length) {
		return (
			<div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-5)] py-[var(--space-8)] text-center">
				<p className="mb-[var(--space-3)] text-3xl">🎙</p>
				<p className="mb-[var(--space-5)] text-[var(--color-text-2)]">
					Aucune session encore / No sessions yet
				</p>
				<Link
					href="/sessions/new"
					className="inline-block rounded-full bg-[var(--color-primary)] px-[var(--space-5)] py-[var(--space-3)] text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-dark)]"
				>
					Nouvelle session / New session
				</Link>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-[var(--space-3)]">
			{sessions.map((s) => (
				<Link
					key={s.id}
					href={`/sessions/${s.id}`}
					className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-5)] py-[var(--space-4)] transition-colors hover:border-[var(--color-primary)]"
				>
					<div className="flex items-center gap-[var(--space-4)]">
						<span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-[var(--color-bg)] text-xl">
							🎙
						</span>
						<div>
							<p className="text-sm font-medium text-[var(--color-text)]">
								{new Date(s.createdAt).toLocaleDateString("fr-FR", {
									day: "numeric",
									month: "long",
									year: "numeric",
								})}
							</p>
							<p className="mt-[2px] text-xs text-[var(--color-text-3)]">
								CGU v{s.consentVersion}
							</p>
						</div>
					</div>
					<span className="text-lg text-[var(--color-text-3)]">›</span>
				</Link>
			))}
		</div>
	);
}
