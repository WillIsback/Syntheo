"use client";

import { useCompletion } from "@ai-sdk/react";
import { useEffect } from "react";

interface ReportViewProps {
	transcriptionText: string;
	sessionId: string;
	/** When provided, display this pre-saved content without calling the API */
	savedContent?: string;
	onRunId?: (runId: string) => void;
}

const VLLM_MODEL_LABEL =
	process.env.NEXT_PUBLIC_VLLM_MODEL_LABEL ?? "Mistral 7B";

const AI_DISCLAIMER = (
	<div className="bg-amber-50 border border-amber-200 rounded-[var(--radius)] p-3 mb-4 flex gap-2 text-xs text-amber-800">
		<span>⚖</span>
		<span>
			Document généré par intelligence artificielle. Peut être incomplet ou
			inexact — ne pas utiliser comme seule source de décision. / AI-generated
			document. May be incomplete or inaccurate — do not use as sole basis for
			decisions.
		</span>
	</div>
);

function SavedReport({ content }: { content: string }) {
	return (
		<div className="bg-[var(--color-surface)] rounded-[var(--radius)] border border-[var(--color-border)] p-4">
			<div className="flex items-center justify-between mb-3">
				<h3 className="font-medium text-[var(--color-text)]">
					Compte rendu / Report
				</h3>
				<span className="text-xs text-[var(--color-text-3)]">
					{VLLM_MODEL_LABEL}
				</span>
			</div>
			{AI_DISCLAIMER}
			<div className="text-sm text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">
				{content}
			</div>
		</div>
	);
}

export default function ReportView({
	transcriptionText,
	sessionId,
	savedContent,
	onRunId: _onRunId,
}: ReportViewProps) {
	const { completion, complete, isLoading } = useCompletion({
		api: "/api/reports",
		body: { transcriptionText, sessionId },
		streamProtocol: "text",
	});

	useEffect(() => {
		// Only generate if no saved content already exists
		if (!savedContent && transcriptionText) complete(transcriptionText);
	}, [savedContent, transcriptionText, complete]);

	// If a previously saved report exists, display it without hitting the API
	if (savedContent) {
		return <SavedReport content={savedContent} />;
	}

	return (
		<div className="bg-[var(--color-surface)] rounded-[var(--radius)] border border-[var(--color-border)] p-4">
			<div className="flex items-center justify-between mb-3">
				<h3 className="font-medium text-[var(--color-text)]">
					Compte rendu / Report
				</h3>
				<span className="text-xs text-[var(--color-text-3)]">
					{VLLM_MODEL_LABEL}
				</span>
			</div>

			{AI_DISCLAIMER}

			<div className="text-sm text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">
				{isLoading && !completion ? (
					<span className="text-[var(--color-text-3)]">
						Génération… / Generating…
					</span>
				) : (
					completion
				)}
			</div>
		</div>
	);
}
