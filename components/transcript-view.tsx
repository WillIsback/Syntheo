"use client";

import { useState } from "react";
import type { Segment } from "@/lib/db/queries";
import SpeakerChip from "./speaker-chip";

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

	const speakerNames = new Map<string, string>();
	segments.forEach((s) => {
		if (!speakerNames.has(s.speaker)) speakerNames.set(s.speaker, s.speaker);
	});

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

	return (
		<div className="bg-[var(--color-surface)] rounded-[var(--radius)] border border-[var(--color-border)] p-4">
			<div className="flex items-center justify-between mb-3">
				<h3 className="font-medium text-[var(--color-text)]">Transcription</h3>
				{saving && (
					<span className="text-xs text-[var(--color-text-3)]">
						Sauvegarde… / Saving…
					</span>
				)}
			</div>

			<div className="bg-blue-50 border border-blue-100 rounded-[var(--radius)] p-3 mb-4 flex gap-2 text-xs text-blue-800">
				<span>🤖</span>
				<span>
					Transcription générée par IA (WhisperX large-v3 · run #{whisperRunId}{" "}
					· {new Date(createdAt).toLocaleDateString("fr-FR")}). Susceptible
					d'erreurs — vérifiez avant tout usage officiel. / AI-generated
					transcription. May contain errors.
				</span>
			</div>

			<div className="flex flex-wrap gap-2 mb-4">
				{[...speakerNames.entries()].map(([orig, name], i) => (
					<SpeakerChip
						key={orig}
						label={name}
						index={i}
						onChange={(newName) => renameSpeaker(orig, newName)}
					/>
				))}
			</div>

			<div className="space-y-3 text-sm">
				{segments.map((seg) => {
					const speakerIndex = [...speakerNames.keys()].indexOf(
						initialSegments.find((s) => s === seg)?.speaker ?? seg.speaker,
					);
					const color = [
						"var(--color-speaker-1)",
						"var(--color-speaker-2)",
						"var(--color-speaker-3)",
						"var(--color-speaker-4)",
					][speakerIndex % 4];
					return (
						<div
							key={`${seg.start}-${seg.end}-${seg.speaker}`}
							className="flex gap-3"
						>
							<div className="flex-shrink-0 text-xs text-[var(--color-text-3)] pt-0.5 w-10 text-right">
								{formatTime(seg.start)}
							</div>
							<div>
								<span className="text-xs font-medium mr-2" style={{ color }}>
									{seg.speaker}
								</span>
								<span className="text-[var(--color-text)]">{seg.text}</span>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function formatTime(s: number): string {
	const m = Math.floor(s / 60);
	const sec = Math.floor(s % 60);
	return `${m}:${sec.toString().padStart(2, "0")}`;
}
