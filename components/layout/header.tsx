"use client";

interface HeaderProps {
	userName?: string;
}

export default function Header({ userName }: HeaderProps) {
	return (
		<header className="h-14 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center justify-between px-4 shrink-0">
			<div />
			<div className="flex items-center gap-3">
				{userName && (
					<span className="text-sm text-[var(--color-text-2)]">{userName}</span>
				)}
				<div className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white text-xs font-medium">
					{userName?.[0]?.toUpperCase() ?? "U"}
				</div>
			</div>
		</header>
	);
}
