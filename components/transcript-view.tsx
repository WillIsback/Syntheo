"use client";

import { useMemo, useState } from "react";
import type { Segment } from "@/lib/db/queries";
import { formatClock } from "@/lib/transcript/stats";
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
		return SPEAKER_COLORS[
			(speakerIndex.get(speaker) ?? 0) % SPEAKER_COLORS.length
		];
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
							className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)] transition-colors hover:border-[var(--color-primary)]"
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
