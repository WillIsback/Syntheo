"use client";

import { useCompletion } from "@ai-sdk/react";
import { useEffect } from "react";

interface ReportViewProps {
	transcriptionText: string;
	sessionId: string;
	onRunId?: (runId: string) => void;
}

const VLLM_MODEL_LABEL =
	process.env.NEXT_PUBLIC_VLLM_MODEL_LABEL ?? "Mistral 7B";

export default function ReportView({
	transcriptionText,
	sessionId,
	onRunId: _onRunId,
}: ReportViewProps) {
	const { completion, complete, isLoading } = useCompletion({
		api: "/api/reports",
		body: { transcriptionText, sessionId },
		streamProtocol: "text",
	});

	useEffect(() => {
		if (transcriptionText) complete(transcriptionText);
	}, [transcriptionText, complete]);

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

			<div className="bg-amber-50 border border-amber-200 rounded-[var(--radius)] p-3 mb-4 flex gap-2 text-xs text-amber-800">
				<span>⚖</span>
				<span>
					Document généré par intelligence artificielle. Peut être incomplet ou
					inexact — ne pas utiliser comme seule source de décision. /
					AI-generated document. May be incomplete or inaccurate — do not use as
					sole basis for decisions.
				</span>
			</div>

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
