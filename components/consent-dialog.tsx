"use client";

import { useState } from "react";

interface ConsentDialogProps {
	onConfirm: (sessionId: string) => void;
	onCancel: () => void;
}

const CONSENT_VERSION = "1.0";

export default function ConsentDialog({
	onConfirm,
	onCancel,
}: ConsentDialogProps) {
	const [check1, setCheck1] = useState(false);
	const [check2, setCheck2] = useState(false);
	const [loading, setLoading] = useState(false);

	const canStart = check1 && check2;

	async function handleStart() {
		if (!canStart) return;
		setLoading(true);
		const consentHash = await computeConsentHash(
			check1,
			check2,
			CONSENT_VERSION,
		);
		const res = await fetch("/api/sessions", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ consentHash, consentVersion: CONSENT_VERSION }),
		});
		if (!res.ok) {
			setLoading(false);
			return;
		}
		const { sessionId } = await res.json();
		onConfirm(sessionId);
	}

	return (
		<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
			<div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-[var(--space-6)] max-w-md w-full mx-[var(--space-4)] shadow-xl">
				<div className="flex items-center gap-2 mb-4">
					<span className="text-xl">🛡</span>
					<h2 className="font-semibold text-[var(--color-text)]">
						Avant de démarrer / Before starting
					</h2>
				</div>

				<p className="text-sm text-[var(--color-text-2)] mb-4">
					Syntheo va transcrire l'audio de votre session. L'audio n'est jamais
					conservé. Seule la transcription textuelle est sauvegardée, accessible
					uniquement par vous.
					<br />
					<br />
					Syntheo will transcribe your session audio. Audio is never stored.
					Only the text transcription is saved, accessible only by you.
				</p>

				<label className="flex items-start gap-3 mb-3 cursor-pointer">
					<input
						type="checkbox"
						checked={check1}
						onChange={(e) => setCheck1(e.target.checked)}
						className="mt-0.5 shrink-0"
					/>
					<span className="text-sm text-[var(--color-text)]">
						J'ai informé l'ensemble des participants que cette session sera
						enregistrée et transcrite par un système d'intelligence
						artificielle, conformément au RGPD. / I have informed all
						participants that this session will be recorded and transcribed by
						an AI system, in accordance with GDPR.
					</span>
				</label>

				<label className="flex items-start gap-3 mb-6 cursor-pointer">
					<input
						type="checkbox"
						checked={check2}
						onChange={(e) => setCheck2(e.target.checked)}
						className="mt-0.5 shrink-0"
					/>
					<span className="text-sm text-[var(--color-text)]">
						Je reconnais être seul responsable du respect des obligations
						légales liées à cet enregistrement envers les tiers concernés. / I
						acknowledge sole responsibility for compliance with legal
						obligations regarding this recording toward third parties.
					</span>
				</label>

				<div className="flex gap-3 justify-end">
					<button
						type="button"
						onClick={onCancel}
						className="px-4 py-2 text-sm text-[var(--color-text-2)] hover:bg-[var(--color-border-soft)] rounded-[var(--radius)]"
					>
						Annuler / Cancel
					</button>
					<button
						type="button"
						onClick={handleStart}
						disabled={!canStart || loading}
						className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-[var(--radius)] disabled:opacity-40"
					>
						{loading ? "…" : "Démarrer la session / Start session"}
					</button>
				</div>
			</div>
		</div>
	);
}

async function computeConsentHash(
	c1: boolean,
	c2: boolean,
	version: string,
): Promise<string> {
	const data = new TextEncoder().encode(`${version}:${c1}:${c2}:${Date.now()}`);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
