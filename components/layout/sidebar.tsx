"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type RecentSession = { id: string; createdAt: string };

interface SidebarProps {
	recentSessions: RecentSession[];
	onNavigate?: () => void;
}

export default function Sidebar({ recentSessions, onNavigate }: SidebarProps) {
	const path = usePathname();

	return (
		<nav className="flex h-full w-[var(--sidebar-w)] flex-col bg-[var(--color-surface)] p-[var(--space-3)]">
			<Link
				href="/sessions/new"
				onClick={onNavigate}
				className="mb-[var(--space-4)] flex items-center gap-[var(--space-2)] rounded-full bg-[var(--color-primary)] px-[var(--space-4)] py-[var(--space-3)] text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-dark)]"
			>
				<span className="text-lg leading-none">+</span>
				<span>Nouvelle session / New session</span>
			</Link>

			<div className="px-[var(--space-2)] pb-[var(--space-2)] text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-3)]">
				Récentes / Recent
			</div>

			<div className="flex flex-1 flex-col gap-[2px] overflow-y-auto">
				{recentSessions.length === 0 && (
					<p className="px-[var(--space-3)] py-[var(--space-2)] text-xs text-[var(--color-text-3)]">
						Aucune session / No sessions
					</p>
				)}
				{recentSessions.map((s) => {
					const active = path === `/sessions/${s.id}`;
					return (
						<Link
							key={s.id}
							href={`/sessions/${s.id}`}
							onClick={onNavigate}
							className={`flex items-center gap-[var(--space-3)] rounded-[var(--radius)] px-[var(--space-3)] py-[var(--space-2)] transition-colors ${
								active
									? "bg-[var(--color-primary-light)]"
									: "hover:bg-[var(--color-bg)]"
							}`}
						>
							<span className="text-base">🎙</span>
							<span
								className={`truncate text-[13px] font-medium ${
									active
										? "text-[var(--color-primary-dark)]"
										: "text-[var(--color-text)]"
								}`}
							>
								{new Date(s.createdAt).toLocaleDateString("fr-FR", {
									day: "numeric",
									month: "short",
									year: "numeric",
								})}
							</span>
						</Link>
					);
				})}
			</div>

			<div className="mt-[var(--space-3)] border-t border-[var(--color-border)] px-[var(--space-2)] pt-[var(--space-3)] text-[11px] text-[var(--color-text-3)]">
				Données hébergées en France · Data hosted in France
			</div>
		</nav>
	);
}
