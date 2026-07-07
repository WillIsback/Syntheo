"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface HeaderProps {
	userName?: string;
	onMenuClick: () => void;
}

export default function Header({ userName, onMenuClick }: HeaderProps) {
	const path = usePathname();
	const tab = (href: string) =>
		path.startsWith(href)
			? "bg-[var(--color-primary-light)] text-[var(--color-primary-dark)]"
			: "text-[var(--color-text-2)] hover:bg-[var(--color-bg)]";

	return (
		<header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-[var(--space-2)] border-b border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)]">
			<button
				type="button"
				onClick={onMenuClick}
				aria-label="Menu"
				className="rounded-full p-[var(--space-2)] text-[var(--color-text-2)] hover:bg-[var(--color-bg)] md:hidden"
			>
				☰
			</button>

			<Link href="/sessions" className="flex items-center gap-[var(--space-2)]">
				<span className="flex h-7 w-7 items-center justify-center rounded-[5px] bg-[var(--color-primary)] text-sm text-white">
					S
				</span>
				<span className="text-lg font-medium text-[var(--color-primary)]">
					Syntheo
				</span>
			</Link>

			<nav className="ml-[var(--space-4)] hidden items-center gap-[var(--space-1)] sm:flex">
				<Link
					href="/sessions"
					className={`rounded-full px-[var(--space-3)] py-[var(--space-2)] text-[13px] ${tab("/sessions")}`}
				>
					Sessions
				</Link>
				<Link
					href="/account"
					className={`rounded-full px-[var(--space-3)] py-[var(--space-2)] text-[13px] ${tab("/account")}`}
				>
					Compte / Account
				</Link>
			</nav>

			<div className="ml-auto flex items-center gap-[var(--space-3)]">
				{userName && (
					<span className="hidden text-sm text-[var(--color-text-2)] sm:inline">
						{userName}
					</span>
				)}
				<div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-medium text-white">
					{userName?.[0]?.toUpperCase() ?? "U"}
				</div>
			</div>
		</header>
	);
}
