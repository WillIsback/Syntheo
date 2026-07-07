# Frontend Design Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure and restyle the Syntheo app UI (`app/`, `components/`) to match the layout, spacing, and typography of `docs/specs/syntheo_ui.html`, with real responsive breakpoints.

**Architecture:** Next.js 16 App Router. A new thin client `AppShell` owns mobile-drawer state and composes the topbar + sidebar + main slot. Session detail switches from a cramped 2-column grid to a centered document column plus a right stats panel that collapses inline on narrow screens. Statistical derivations (participant count, duration, word/turn counts, per-speaker share) are extracted into a pure, unit-tested module and consumed by client components.

**Tech Stack:** Next.js 16.2.9, React 19, Tailwind CSS v4 (`@import "tailwindcss"` + CSS variables), Biome 2.5.1, Vitest 3 (node environment).

## Global Constraints

- **No new backend surface** — no new API routes, no DB schema changes, no per-session delete/export endpoint. Transcript export is a client-side download.
- **No fabricated data** — no waveform, no WER %, no session titles, no highlight spans, no notification/app-grid icons. Render only real data; derive stats client-side from existing `Segment[]`.
- **RGPD/IA Act invariants** — the "généré par IA / AI-generated" disclaimer stays permanently visible on transcript and report. No audio persisted client-side.
- **Bilingual labels** — every user-facing string stays French AND English (`FR / EN` pattern already used).
- **Design tokens** — colors/radius from `app/globals.css` `:root` are the source of truth; add spacing/font/width tokens there, consume them everywhere (no ad-hoc pixel values).
- **Style rules** — Biome: tabs for indentation, double quotes. Run `npx biome check --write <files>` before every commit.
- **Verification commands** — `npm test` (vitest), `npx tsc --noEmit` (typecheck), `npx biome check <files>` (lint/format).

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `app/globals.css` | modify | Add spacing scale, serif font, layout-width tokens |
| `lib/transcript/stats.ts` | create | Pure derivations from `Segment[]` (stats + speaker shares) |
| `lib/transcript/__tests__/stats.test.ts` | create | Unit tests for derivations |
| `lib/transcript/export.ts` | create | Client-side transcript → text blob download |
| `components/layout/app-shell.tsx` | create | Client wrapper owning drawer state; composes topbar + sidebar + main |
| `components/layout/header.tsx` | rewrite | Topbar: logo, nav tabs, avatar, mobile hamburger |
| `components/layout/sidebar.tsx` | rewrite | New-session pill, recent-sessions list, footer; drawer-aware |
| `app/(protected)/layout.tsx` | modify | Fetch recent sessions server-side, render `AppShell` |
| `components/transcript-view.tsx` | rewrite | Card-based transcript blocks, serif body, rename chips, disclaimer |
| `components/session-panel.tsx` | create | Speaker cards (derived share), stats grid, quick actions |
| `app/(protected)/sessions/[id]/page.tsx` | modify | Document column + right panel layout; report below transcript |
| `app/(protected)/sessions/page.tsx` | modify | Centered list, spacing, responsive cards |
| `components/session-list.tsx` | modify | Restyled cards + empty state |
| `components/report-view.tsx` | modify | Restyle card to match; unchanged logic |
| `components/consent-dialog.tsx` | modify | Spacing/typography only |
| `app/(protected)/sessions/[id]/record/page.tsx` | modify | Responsive centered layout |
| `components/audio-recorder.tsx` | modify | Spacing polish only |
| `app/(protected)/account/page.tsx` | modify | Card treatment to match panel |

---

### Task 1: Design tokens

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Produces: CSS custom properties on `:root` consumed by all later tasks:
  `--space-1..8`, `--font-serif`, `--sidebar-w`, `--panel-w`, `--doc-max-w`, `--topbar-h`.

- [ ] **Step 1: Add tokens to `:root`**

Replace the `:root { ... }` block in `app/globals.css` with (keep all existing color/radius/font vars, add the new ones):

```css
:root {
	--color-primary: #1a73e8;
	--color-primary-light: #e8f0fe;
	--color-primary-dark: #1557b0;
	--color-bg: #f8f9fa;
	--color-surface: #ffffff;
	--color-border: #e0e0e0;
	--color-border-soft: #f1f3f4;
	--color-text: #202124;
	--color-text-2: #5f6368;
	--color-text-3: #9aa0a6;
	--color-speaker-1: #1a73e8;
	--color-speaker-2: #0f9d58;
	--color-speaker-3: #e37400;
	--color-speaker-4: #a142f4;
	--color-danger: #d93025;
	--color-warning: #f29900;
	--radius: 6px;
	--radius-lg: 10px;
	--font-sans: "Google Sans", "Segoe UI", Roboto, Arial, sans-serif;
	--font-serif: Georgia, "Times New Roman", serif;

	--space-1: 4px;
	--space-2: 8px;
	--space-3: 12px;
	--space-4: 16px;
	--space-5: 24px;
	--space-6: 32px;
	--space-7: 48px;
	--space-8: 64px;

	--sidebar-w: 264px;
	--panel-w: 256px;
	--doc-max-w: 820px;
	--topbar-h: 56px;
}
```

Then update the `body` rule's `font-family` to use the token:

```css
body {
	background: var(--color-bg);
	color: var(--color-text);
	font-family: var(--font-sans);
	font-size: 14px;
	line-height: 1.5;
}
```

Add a scrollbar rule at the end of the file (matches the mockup's thin scrollbars):

```css
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--color-text-3); }
```

- [ ] **Step 2: Verify build + format**

Run: `npx biome check --write app/globals.css && npx tsc --noEmit`
Expected: no errors (tsc ignores CSS; confirms nothing else broke).

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style(ui): add spacing, serif font, and layout-width design tokens"
```

---

### Task 2: Transcript stat derivations (TDD)

**Files:**
- Create: `lib/transcript/stats.ts`
- Test: `lib/transcript/__tests__/stats.test.ts`

**Interfaces:**
- Consumes: `Segment` from `@/lib/db/queries` (`{ start:number; end:number; speaker:string; text:string }`).
- Produces:
  - `type SpeakerStat = { speaker: string; index: number; seconds: number; sharePct: number }`
  - `type TranscriptStats = { participants: number; durationSec: number; words: number; turns: number; speakers: SpeakerStat[] }`
  - `function computeStats(segments: Segment[]): TranscriptStats`
  - `function formatDuration(sec: number): string` → `"M min"` when ≥60s else `"S s"`; here return `"42 min"` style (whole minutes, rounded) for the stats grid.
  - `function formatClock(sec: number): string` → `"M:SS"` (used by transcript timestamps).

- [ ] **Step 1: Write the failing test**

Create `lib/transcript/__tests__/stats.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Segment } from "@/lib/db/queries";
import {
	computeStats,
	formatClock,
	formatDuration,
} from "@/lib/transcript/stats";

const segments: Segment[] = [
	{ start: 0, end: 10, speaker: "SPEAKER_00", text: "bonjour à tous" }, // 3 words, 10s
	{ start: 10, end: 40, speaker: "SPEAKER_01", text: "ok merci" }, //     2 words, 30s
	{ start: 40, end: 60, speaker: "SPEAKER_00", text: "on continue" }, //  2 words, 20s
];

describe("computeStats", () => {
	it("counts participants, duration, words, turns", () => {
		const s = computeStats(segments);
		expect(s.participants).toBe(2);
		expect(s.durationSec).toBe(60);
		expect(s.words).toBe(7);
		expect(s.turns).toBe(3);
	});

	it("computes per-speaker share sorted by talk time desc", () => {
		const s = computeStats(segments);
		// SPEAKER_00: 30s, SPEAKER_01: 30s -> 50/50, order stable by first appearance on tie
		expect(s.speakers).toHaveLength(2);
		expect(s.speakers[0].speaker).toBe("SPEAKER_00");
		expect(s.speakers[0].seconds).toBe(30);
		expect(s.speakers[0].sharePct).toBe(50);
		expect(s.speakers[0].index).toBe(0);
		expect(s.speakers[1].index).toBe(1);
	});

	it("handles empty input without dividing by zero", () => {
		const s = computeStats([]);
		expect(s).toEqual({
			participants: 0,
			durationSec: 0,
			words: 0,
			turns: 0,
			speakers: [],
		});
	});
});

describe("formatters", () => {
	it("formatDuration rounds to whole minutes", () => {
		expect(formatDuration(60)).toBe("1 min");
		expect(formatDuration(150)).toBe("3 min"); // 2.5 -> 3
		expect(formatDuration(0)).toBe("0 min");
	});
	it("formatClock renders M:SS", () => {
		expect(formatClock(0)).toBe("0:00");
		expect(formatClock(75)).toBe("1:15");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/transcript`
Expected: FAIL — cannot resolve `@/lib/transcript/stats`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/transcript/stats.ts`:

```ts
import type { Segment } from "@/lib/db/queries";

export type SpeakerStat = {
	speaker: string;
	index: number;
	seconds: number;
	sharePct: number;
};

export type TranscriptStats = {
	participants: number;
	durationSec: number;
	words: number;
	turns: number;
	speakers: SpeakerStat[];
};

/** Derive display stats from transcript segments. Pure — no I/O. */
export function computeStats(segments: Segment[]): TranscriptStats {
	if (segments.length === 0) {
		return {
			participants: 0,
			durationSec: 0,
			words: 0,
			turns: 0,
			speakers: [],
		};
	}

	const order: string[] = [];
	const seconds = new Map<string, number>();
	let words = 0;
	let durationSec = 0;

	for (const seg of segments) {
		if (!seconds.has(seg.speaker)) {
			seconds.set(seg.speaker, 0);
			order.push(seg.speaker);
		}
		seconds.set(seg.speaker, (seconds.get(seg.speaker) ?? 0) + (seg.end - seg.start));
		words += seg.text.trim() ? seg.text.trim().split(/\s+/).length : 0;
		durationSec = Math.max(durationSec, seg.end);
	}

	const totalTalk = [...seconds.values()].reduce((a, b) => a + b, 0) || 1;

	const speakers: SpeakerStat[] = order
		.map((speaker) => ({
			speaker,
			index: order.indexOf(speaker),
			seconds: seconds.get(speaker) ?? 0,
			sharePct: Math.round(((seconds.get(speaker) ?? 0) / totalTalk) * 100),
		}))
		.sort((a, b) => b.seconds - a.seconds);

	return {
		participants: order.length,
		durationSec,
		words,
		turns: segments.length,
		speakers,
	};
}

export function formatDuration(sec: number): string {
	return `${Math.round(sec / 60)} min`;
}

export function formatClock(sec: number): string {
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}
```

Note: `index` is assigned by first-appearance order (used for stable speaker colors) even though the returned array is sorted by talk time.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/transcript`
Expected: PASS (7 assertions across 5 tests).

- [ ] **Step 5: Format + commit**

```bash
npx biome check --write lib/transcript/stats.ts lib/transcript/__tests__/stats.test.ts
git add lib/transcript/stats.ts lib/transcript/__tests__/stats.test.ts
git commit -m "feat(transcript): pure stat derivations with unit tests"
```

---

### Task 3: Client transcript export helper

**Files:**
- Create: `lib/transcript/export.ts`

**Interfaces:**
- Consumes: `Segment`, `formatClock` from Task 2.
- Produces: `function downloadTranscript(segments: Segment[], filename: string): void` — builds a plain-text transcript and triggers a browser download. No test (DOM/`URL.createObjectURL` side-effect; verified manually).

- [ ] **Step 1: Write implementation**

Create `lib/transcript/export.ts`:

```ts
import type { Segment } from "@/lib/db/queries";
import { formatClock } from "@/lib/transcript/stats";

/** Build a plain-text transcript and trigger a client-side download. RAM only. */
export function downloadTranscript(segments: Segment[], filename: string): void {
	if (segments.length === 0) return;
	const body = segments
		.map((s) => `[${formatClock(s.start)}] ${s.speaker}: ${s.text}`)
		.join("\n\n");
	const header =
		"Transcription générée par IA — susceptible d'erreurs.\n" +
		"AI-generated transcription — may contain errors.\n\n";
	const blob = new Blob([header + body], { type: "text/plain;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Typecheck + format**

Run: `npx tsc --noEmit && npx biome check --write lib/transcript/export.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/transcript/export.ts
git commit -m "feat(transcript): client-side transcript text export"
```

---

### Task 4: App shell — topbar, sidebar, mobile drawer

**Files:**
- Create: `components/layout/app-shell.tsx`
- Rewrite: `components/layout/header.tsx`
- Rewrite: `components/layout/sidebar.tsx`
- Modify: `app/(protected)/layout.tsx`

**Interfaces:**
- Consumes: recent sessions — `Array<{ id: string; createdAt: Date }>` fetched in the layout.
- Produces:
  - `AppShell({ userName, recentSessions, children })` client component.
  - `type RecentSession = { id: string; createdAt: string }` (serialized date for client boundary).

- [ ] **Step 1: Rewrite `components/layout/sidebar.tsx`**

```tsx
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
```

- [ ] **Step 2: Rewrite `components/layout/header.tsx`**

```tsx
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
```

- [ ] **Step 3: Create `components/layout/app-shell.tsx`**

```tsx
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
```

- [ ] **Step 4: Rewrite `app/(protected)/layout.tsx`**

```tsx
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
```

- [ ] **Step 5: Typecheck, lint, and verify existing tests still pass**

Run:
```bash
npx tsc --noEmit
npx biome check --write components/layout app/\(protected\)/layout.tsx
npm test
```
Expected: tsc clean; biome clean; all existing tests pass (no test touches these files).

- [ ] **Step 6: Manual verification**

Run `npm run dev`, open `/sessions` at ≥768px and <768px widths. Confirm: topbar with logo + nav tabs + avatar; sidebar visible on desktop with recent sessions; hamburger opens a drawer with backdrop on mobile; clicking a drawer link closes it; no horizontal body scroll.

- [ ] **Step 7: Commit**

```bash
git add components/layout app/\(protected\)/layout.tsx
git commit -m "feat(ui): app shell with topbar, recent-sessions sidebar, and mobile drawer"
```

---

### Task 5: Sessions list page restyle

**Files:**
- Modify: `app/(protected)/sessions/page.tsx`
- Modify: `components/session-list.tsx`

**Interfaces:**
- Consumes: `Session` from `@/lib/db/queries`. No new interface produced.

- [ ] **Step 1: Rewrite `components/session-list.tsx`**

```tsx
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
```

- [ ] **Step 2: Rewrite the page wrapper in `app/(protected)/sessions/page.tsx`**

Replace only the returned JSX (keep all data-fetching/logging code above it unchanged):

```tsx
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
```

Add `import Link from "next/link";` to the top of the file (alongside existing imports).

- [ ] **Step 3: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx biome check --write components/session-list.tsx "app/(protected)/sessions/page.tsx"
git add components/session-list.tsx "app/(protected)/sessions/page.tsx"
git commit -m "style(ui): restyle sessions list with tokens and responsive spacing"
```

---

### Task 6: Transcript view — card blocks + serif body

**Files:**
- Rewrite: `components/transcript-view.tsx`

**Interfaces:**
- Consumes: `Segment` from `@/lib/db/queries`; `SpeakerChip` (unchanged); `formatClock`, `computeStats` from Task 2.
- Produces: `TranscriptView` with the same props as today (`transcriptionId`, `segments`, `whisperRunId`, `createdAt`) plus stable speaker-color mapping shared with the panel (color derived from first-appearance index).

- [ ] **Step 1: Rewrite `components/transcript-view.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import type { Segment } from "@/lib/db/queries";
import { computeStats, formatClock } from "@/lib/transcript/stats";
import SpeakerChip from "./speaker-chip";

const SPEAKER_COLORS = [
	"var(--color-speaker-1)",
	"var(--color-speaker-2)",
	"var(--color-speaker-3)",
	"var(--color-speaker-4)",
];

interface TranscriptViewProps {
	transcriptionId: string;
	segments: Segment[];
	whisperRunId: string;
	createdAt: Date | string;
}

export default function TranscriptView({
	transcriptionId,
	segments: initialSegments,
	whisperRunId,
	createdAt,
}: TranscriptViewProps) {
	const [segments, setSegments] = useState(initialSegments);
	const [saving, setSaving] = useState(false);

	// Stable first-appearance order -> color index (shared with panel).
	const speakerIndex = useMemo(() => {
		const order = new Map<string, number>();
		for (const s of segments) {
			if (!order.has(s.speaker)) order.set(s.speaker, order.size);
		}
		return order;
	}, [segments]);

	const speakerNames = [...speakerIndex.keys()];

	async function renameSpeaker(oldLabel: string, newName: string) {
		const updated = segments.map((s) =>
			s.speaker === oldLabel ? { ...s, speaker: newName } : s,
		);
		setSegments(updated);
		setSaving(true);
		await fetch(`/api/transcriptions/${transcriptionId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ segments: updated }),
		});
		setSaving(false);
	}

	function colorFor(speaker: string) {
		return SPEAKER_COLORS[(speakerIndex.get(speaker) ?? 0) % SPEAKER_COLORS.length];
	}

	return (
		<section>
			<div className="mb-[var(--space-3)] flex items-center justify-between">
				<h2 className="text-sm font-semibold text-[var(--color-text)]">
					Transcription
				</h2>
				{saving && (
					<span className="text-xs text-[var(--color-text-3)]">
						Sauvegarde… / Saving…
					</span>
				)}
			</div>

			<div className="mb-[var(--space-4)] flex gap-[var(--space-2)] rounded-[var(--radius)] border border-[#f9ab00] bg-[#fef3e2] p-[var(--space-3)] text-xs leading-relaxed text-[#7a4300]">
				<span>⚠</span>
				<span>
					<strong>Transcription générée par IA</strong> (WhisperX large-v3 · run
					#{whisperRunId} · {new Date(createdAt).toLocaleDateString("fr-FR")}).
					Susceptible d'erreurs — vérifiez avant tout usage officiel. /
					AI-generated transcription. May contain errors.
				</span>
			</div>

			<div className="mb-[var(--space-4)] flex flex-wrap gap-[var(--space-2)]">
				{speakerNames.map((name) => (
					<SpeakerChip
						key={name}
						label={name}
						index={speakerIndex.get(name) ?? 0}
						onChange={(newName) => renameSpeaker(name, newName)}
					/>
				))}
			</div>

			<div className="flex flex-col gap-[var(--space-2)]">
				{segments.map((seg) => {
					const color = colorFor(seg.speaker);
					return (
						<article
							key={`${seg.start}-${seg.end}-${seg.speaker}`}
							className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)] transition-colors hover:border-[var(--color-primary)]"
						>
							<div
								className="mb-[var(--space-2)] flex items-center gap-[var(--space-2)] text-[11px] font-bold uppercase tracking-wide"
								style={{ color }}
							>
								<span
									className="h-2 w-2 rounded-full"
									style={{ background: color }}
								/>
								{seg.speaker}
								<span className="font-normal text-[var(--color-text-3)]">
									{formatClock(seg.start)}
								</span>
							</div>
							<p
								className="text-[14px] leading-[1.75] text-[var(--color-text)]"
								style={{ fontFamily: "var(--font-serif)" }}
							>
								{seg.text}
							</p>
						</article>
					);
				})}
			</div>
		</section>
	);
}

// computeStats imported for downstream parity; not used directly here.
void computeStats;
```

Note: remove the trailing `void computeStats;` and its import if Biome flags the unused import — it is only listed to document the shared derivation source. Prefer removing the `computeStats` import entirely if unused; keep only `formatClock`.

- [ ] **Step 2: Remove unused import**

Edit the import line to `import { formatClock } from "@/lib/transcript/stats";` and delete the trailing `void computeStats;` line.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx biome check --write components/transcript-view.tsx
git add components/transcript-view.tsx
git commit -m "style(ui): card-based transcript blocks with serif body text"
```

---

### Task 7: Session panel — speaker cards, stats grid, quick actions

**Files:**
- Create: `components/session-panel.tsx`

**Interfaces:**
- Consumes: `Segment` from `@/lib/db/queries`; `computeStats`, `formatDuration` from Task 2; `downloadTranscript` from Task 3.
- Produces: `SessionPanel({ segments, sessionDate }: { segments: Segment[]; sessionDate: string })` client component. Speaker colors use the same first-appearance `index` from `computeStats` so they match the transcript.

- [ ] **Step 1: Create `components/session-panel.tsx`**

```tsx
"use client";

import Link from "next/link";
import type { Segment } from "@/lib/db/queries";
import { downloadTranscript } from "@/lib/transcript/export";
import { computeStats, formatDuration } from "@/lib/transcript/stats";

const SPEAKER_COLORS = [
	"var(--color-speaker-1)",
	"var(--color-speaker-2)",
	"var(--color-speaker-3)",
	"var(--color-speaker-4)",
];

function initials(name: string): string {
	const parts = name.trim().split(/\s+/);
	return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "");
}

export default function SessionPanel({
	segments,
	sessionDate,
}: {
	segments: Segment[];
	sessionDate: string;
}) {
	const stats = computeStats(segments);

	return (
		<div className="flex flex-col gap-[var(--space-5)]">
			<div>
				<h3 className="mb-[var(--space-3)] text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-3)]">
					Intervenants / Speakers
				</h3>
				<div className="flex flex-col gap-[var(--space-2)]">
					{stats.speakers.map((sp) => {
						const color = SPEAKER_COLORS[sp.index % SPEAKER_COLORS.length];
						return (
							<div
								key={sp.speaker}
								className="flex items-center gap-[var(--space-3)] rounded-[var(--radius)] p-[var(--space-2)]"
							>
								<span
									className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
									style={{ background: color }}
								>
									{initials(sp.speaker)}
								</span>
								<div className="min-w-0 flex-1">
									<div className="truncate text-xs font-semibold text-[var(--color-text)]">
										{sp.speaker}
									</div>
									<div className="text-[11px] text-[var(--color-text-3)]">
										{sp.sharePct} % · {formatDuration(sp.seconds)}
									</div>
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<div>
				<h3 className="mb-[var(--space-3)] text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-3)]">
					Session
				</h3>
				<div className="grid grid-cols-2 gap-[var(--space-2)]">
					<Stat value={formatDuration(stats.durationSec)} label="durée / duration" />
					<Stat value={String(stats.participants)} label="intervenants / speakers" />
					<Stat value={stats.words.toLocaleString("fr-FR")} label="mots / words" />
					<Stat value={String(stats.turns)} label="tours / turns" />
				</div>
			</div>

			<div>
				<h3 className="mb-[var(--space-3)] text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-3)]">
					Actions
				</h3>
				<button
					type="button"
					onClick={() =>
						downloadTranscript(segments, `transcription-${sessionDate}.txt`)
					}
					className="mb-[var(--space-2)] flex w-full items-center gap-[var(--space-2)] rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2)] text-left text-xs text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-bg)]"
				>
					⬇ Exporter la transcription / Export transcript
				</button>
				<Link
					href="/account"
					className="flex w-full items-center gap-[var(--space-2)] rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2)] text-left text-xs text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-bg)]"
				>
					⚙ Mes données / My data
				</Link>
			</div>
		</div>
	);
}

function Stat({ value, label }: { value: string; label: string }) {
	return (
		<div className="rounded-[var(--radius)] bg-[var(--color-bg)] p-[var(--space-3)] text-center">
			<div className="text-lg font-semibold text-[var(--color-text)]">{value}</div>
			<div className="mt-[2px] text-[10px] text-[var(--color-text-3)]">{label}</div>
		</div>
	);
}
```

- [ ] **Step 2: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx biome check --write components/session-panel.tsx
git add components/session-panel.tsx
git commit -m "feat(ui): session stats panel with speaker shares and quick actions"
```

---

### Task 8: Session detail — document column + right panel layout

**Files:**
- Modify: `app/(protected)/sessions/[id]/page.tsx`
- Modify: `components/report-view.tsx`

**Interfaces:**
- Consumes: `TranscriptView` (Task 6), `SessionPanel` (Task 7), `ReportView`, `computeStats`/`formatDuration` (Task 2).

- [ ] **Step 1: Restyle `components/report-view.tsx`**

Change only the two outer container `className`s (both the `SavedReport` wrapper and the live wrapper) from
`bg-[var(--color-surface)] rounded-[var(--radius)] border border-[var(--color-border)] p-4`
to
`rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-5)]`,
and change both body text wrappers' `className` from
`text-sm ... whitespace-pre-wrap leading-relaxed`
to add serif:
`text-sm text-[var(--color-text)] whitespace-pre-wrap leading-[1.75]` plus inline `style={{ fontFamily: "var(--font-serif)" }}`. Logic and props stay identical.

- [ ] **Step 2: Rewrite the returned JSX in `app/(protected)/sessions/[id]/page.tsx`**

Keep all server data-fetching code above `return` unchanged. Add imports at top:

```tsx
import SessionPanel from "@/components/session-panel";
```

Replace the `return (...)` block with:

```tsx
	const sessionDate = new Date(detail.session.createdAt)
		.toISOString()
		.slice(0, 10);
	const segments = detail.transcription?.segments ?? [];

	return (
		<div className="mx-auto flex max-w-[1200px] gap-[var(--space-6)] px-[var(--space-5)] py-[var(--space-6)]">
			<div className="min-w-0 flex-1 max-w-[var(--doc-max-w)]">
				<header className="mb-[var(--space-5)]">
					<h1 className="text-2xl font-normal tracking-tight text-[var(--color-text)]">
						Session
					</h1>
					<p className="mt-[var(--space-1)] text-xs text-[var(--color-text-3)]">
						{new Date(detail.session.createdAt).toLocaleDateString("fr-FR", {
							day: "numeric",
							month: "long",
							year: "numeric",
						})}
					</p>
				</header>

				{detail.transcription ? (
					<TranscriptView
						transcriptionId={detail.transcription.id}
						segments={detail.transcription.segments}
						whisperRunId={detail.transcription.whisperRunId}
						createdAt={detail.transcription.createdAt}
					/>
				) : (
					<p className="text-[var(--color-text-3)]">
						Transcription non disponible / Not available
					</p>
				)}

				{transcriptionText && (
					<div className="mt-[var(--space-6)]">
						<ReportView
							transcriptionText={transcriptionText}
							sessionId={id}
							savedContent={detail.report?.content}
						/>
					</div>
				)}

				{/* Panel content inline on narrow screens */}
				{segments.length > 0 && (
					<div className="mt-[var(--space-6)] xl:hidden">
						<SessionPanel segments={segments} sessionDate={sessionDate} />
					</div>
				)}
			</div>

			{/* Right panel on wide screens */}
			{segments.length > 0 && (
				<aside className="hidden w-[var(--panel-w)] shrink-0 xl:block">
					<SessionPanel segments={segments} sessionDate={sessionDate} />
				</aside>
			)}
		</div>
	);
```

- [ ] **Step 3: Typecheck, lint, run tests**

```bash
npx tsc --noEmit
npx biome check --write "app/(protected)/sessions/[id]/page.tsx" components/report-view.tsx
npm test
```
Expected: clean; all tests pass.

- [ ] **Step 4: Manual verification**

`npm run dev`, open a session with a transcription. At ≥1280px confirm: centered document column with transcript cards, report card below it, right panel visible with speaker shares + stats. At 768–1280px: panel content appears inline below the report, no right column. At <768px: everything stacked, drawer sidebar. Confirm AI disclaimer visible on both transcript and report; "Exporter la transcription" downloads a `.txt`.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/sessions/[id]/page.tsx" components/report-view.tsx
git commit -m "feat(ui): session detail document layout with right stats panel"
```

---

### Task 9: Peripheral restyles — consent, record, account

**Files:**
- Modify: `components/consent-dialog.tsx`
- Modify: `app/(protected)/sessions/[id]/record/page.tsx`
- Modify: `components/audio-recorder.tsx`
- Modify: `app/(protected)/account/page.tsx`

**Interfaces:** none new — visual/spacing only, no prop or logic changes.

- [ ] **Step 1: `components/consent-dialog.tsx`**

Change the modal container className from
`bg-[var(--color-surface)] rounded-[var(--radius)] p-6 max-w-md w-full mx-4 shadow-xl`
to
`bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-[var(--space-6)] max-w-md w-full mx-[var(--space-4)] shadow-xl`.
No other change.

- [ ] **Step 2: `app/(protected)/sessions/[id]/record/page.tsx`**

Change the wrapper `div` className from
`max-w-lg mx-auto mt-16`
to
`max-w-lg mx-auto px-[var(--space-5)] py-[var(--space-8)]`.

- [ ] **Step 3: `components/audio-recorder.tsx`**

Change the outer container className from
`flex flex-col items-center gap-4 p-6`
to
`flex flex-col items-center gap-[var(--space-5)] p-[var(--space-6)]`.

- [ ] **Step 4: `app/(protected)/account/page.tsx`**

Change the outer wrapper className from
`max-w-lg mx-auto`
to
`max-w-lg mx-auto px-[var(--space-5)] py-[var(--space-6)]`,
and both `<section>` classNames' `p-4` → `p-[var(--space-5)]` and `rounded-[var(--radius)]` → `rounded-[var(--radius-lg)]`. Keep the danger border on the delete section.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx biome check --write components/consent-dialog.tsx components/audio-recorder.tsx "app/(protected)/sessions/[id]/record/page.tsx" "app/(protected)/account/page.tsx"
git add components/consent-dialog.tsx components/audio-recorder.tsx "app/(protected)/sessions/[id]/record/page.tsx" "app/(protected)/account/page.tsx"
git commit -m "style(ui): apply spacing tokens to consent, record, and account pages"
```

---

### Task 10: Final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full check**

```bash
npx tsc --noEmit
npx biome check .
npm test
npm run build
```
Expected: typecheck clean, biome clean, all tests pass, production build succeeds.

- [ ] **Step 2: Cross-width manual sweep**

`npm run dev`. For `/sessions`, `/sessions/[id]`, `/account`, `/sessions/new`, `/sessions/[id]/record`, verify at widths <768, 768–1280, ≥1280:
- No horizontal body scroll at any width.
- Document column centered on session detail; report below transcript.
- Sidebar drawer works on mobile; desktop sidebar shows recent sessions.
- AI disclaimer visible on transcript and report.
- Speaker colors match between transcript blocks and the panel.
- Derived stats (participants/duration/words/turns/share) are consistent with the visible transcript.

- [ ] **Step 3: Commit any final format fixes** (if `biome check .` changed files)

```bash
git add -A
git commit -m "chore(ui): final format pass for design polish"
```

---

## Self-Review

**Spec coverage:**
- Tokens (spec §1) → Task 1. ✓
- App shell topbar/sidebar/drawer (spec §2) → Task 4. ✓
- Sessions list (spec §3) → Task 5. ✓
- Session detail restructure (spec §4): document column + report below + right panel + responsive → Tasks 6, 7, 8. ✓
- Consent/record restyle (spec §5) → Task 9. ✓
- Account restyle (spec §6) → Task 9. ✓
- Derived stats, no fabricated data → Task 2 (pure, tested) consumed by 7/8. ✓
- Client-side transcript export, no new API → Task 3. ✓
- Disclaimer preserved → Tasks 6 & report-view (Task 8). ✓
- Responsive breakpoints (<768 / 768–1280 / ≥1280) → Tasks 4 & 8. ✓

**Placeholder scan:** No TBD/TODO in tasks. Task 6 explicitly resolves the one potential unused-import wrinkle in Step 2 rather than leaving it vague.

**Type consistency:** `computeStats`/`formatClock`/`formatDuration`/`SpeakerStat`/`TranscriptStats` defined in Task 2 and consumed with matching names in Tasks 3, 6, 7, 8. `RecentSession` defined in Task 4 sidebar and consumed by app-shell/layout in the same task. `SessionPanel({ segments, sessionDate })` defined in Task 7, called with those exact props in Task 8. Speaker color index (first-appearance order) is defined identically in Tasks 6 and 7 so colors match.
