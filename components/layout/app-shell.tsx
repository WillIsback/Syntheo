"use client";

import { useState } from "react";
import Header from "./header";
import Sidebar, { type RecentSession } from "./sidebar";

interface AppShellProps {
	userName?: string;
	recentSessions: RecentSession[];
	children: React.ReactNode;
}

export default function AppShell({
	userName,
	recentSessions,
	children,
}: AppShellProps) {
	const [drawerOpen, setDrawerOpen] = useState(false);

	return (
		<div className="flex h-screen flex-col overflow-hidden">
			<Header userName={userName} onMenuClick={() => setDrawerOpen(true)} />
			<div className="flex flex-1 overflow-hidden">
				{/* Desktop sidebar */}
				<div className="hidden shrink-0 border-r border-[var(--color-border)] md:block">
					<Sidebar recentSessions={recentSessions} />
				</div>

				{/* Mobile drawer */}
				{drawerOpen && (
					<div className="fixed inset-0 z-40 md:hidden">
						<button
							type="button"
							aria-label="Fermer / Close"
							className="absolute inset-0 bg-black/40"
							onClick={() => setDrawerOpen(false)}
						/>
						<div className="absolute left-0 top-0 h-full border-r border-[var(--color-border)] shadow-xl">
							<Sidebar
								recentSessions={recentSessions}
								onNavigate={() => setDrawerOpen(false)}
							/>
						</div>
					</div>
				)}

				<main className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
					{children}
				</main>
			</div>
		</div>
	);
}
