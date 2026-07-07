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
	return (
		(parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "")
	);
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
					<Stat
						value={formatDuration(stats.durationSec)}
						label="durée / duration"
					/>
					<Stat
						value={String(stats.participants)}
						label="intervenants / speakers"
					/>
					<Stat
						value={stats.words.toLocaleString("fr-FR")}
						label="mots / words"
					/>
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
			<div className="text-lg font-semibold text-[var(--color-text)]">
				{value}
			</div>
			<div className="mt-[2px] text-[10px] text-[var(--color-text-3)]">
				{label}
			</div>
		</div>
	);
}
