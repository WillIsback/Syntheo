"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
	const path = usePathname();
	const active = (href: string) =>
		path.startsWith(href)
			? "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
			: "text-[var(--color-text-2)] hover:bg-[var(--color-border-soft)]";

	return (
		<aside className="w-64 h-screen bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col shrink-0">
			<div className="p-4 border-b border-[var(--color-border)]">
				<span className="text-lg font-semibold text-[var(--color-primary)]">
					Syntheo
				</span>
			</div>

			<nav className="flex-1 p-2 flex flex-col gap-1">
				<Link
					href="/sessions/new"
					className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius)] bg-[var(--color-primary)] text-white font-medium mb-2"
				>
					<span>+</span>
					<span>Nouvelle session / New session</span>
				</Link>

				<Link
					href="/sessions"
					className={`flex items-center gap-2 px-3 py-2 rounded-[var(--radius)] ${active("/sessions")}`}
				>
					<span>🎙</span>
					<span>Sessions</span>
				</Link>

				<Link
					href="/account"
					className={`flex items-center gap-2 px-3 py-2 rounded-[var(--radius)] ${active("/account")}`}
				>
					<span>⚙</span>
					<span>Compte / Account</span>
				</Link>
			</nav>

			<div className="p-3 border-t border-[var(--color-border)] text-xs text-[var(--color-text-3)]">
				Données hébergées en France · Data hosted in France
			</div>
		</aside>
	);
}
