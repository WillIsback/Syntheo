"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AccountPage() {
	const router = useRouter();
	const [deleting, setDeleting] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);

	async function handleExport() {
		window.location.href = "/api/export";
	}

	async function handleDelete() {
		if (!confirmDelete) {
			setConfirmDelete(true);
			return;
		}
		setDeleting(true);
		await fetch("/api/account", { method: "DELETE" });
		router.push("/login");
	}

	return (
		<div className="max-w-lg mx-auto">
			<h1 className="text-xl font-semibold mb-6">Compte / Account</h1>

			<section className="bg-[var(--color-surface)] rounded-[var(--radius)] border border-[var(--color-border)] p-4 mb-4">
				<h2 className="font-medium mb-2">Mes données / My data</h2>
				<p className="text-sm text-[var(--color-text-2)] mb-4">
					Exportez toutes vos transcriptions, comptes rendus et métadonnées de
					sessions au format JSON. / Export all your transcriptions, reports,
					and session metadata as JSON.
				</p>
				<button
					type="button"
					onClick={handleExport}
					className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-[var(--radius)]"
				>
					Exporter mes données / Export my data
				</button>
			</section>

			<section className="bg-[var(--color-surface)] rounded-[var(--radius)] border border-[var(--color-danger)] p-4">
				<h2 className="font-medium text-[var(--color-danger)] mb-2">
					Supprimer mon compte / Delete account
				</h2>
				<p className="text-sm text-[var(--color-text-2)] mb-4">
					Suppression immédiate et définitive de toutes vos données (sessions,
					transcriptions, comptes rendus, logs de consentement). Cette action
					est irréversible. / Immediate and permanent deletion of all your data.
					This action is irreversible.
				</p>
				{confirmDelete && (
					<p className="text-sm text-[var(--color-danger)] font-medium mb-3">
						Confirmez-vous la suppression définitive ? / Confirm permanent
						deletion?
					</p>
				)}
				<button
					type="button"
					onClick={handleDelete}
					disabled={deleting}
					className="px-4 py-2 text-sm bg-[var(--color-danger)] text-white rounded-[var(--radius)] disabled:opacity-40"
				>
					{deleting
						? "Suppression… / Deleting…"
						: confirmDelete
							? "Confirmer / Confirm"
							: "Supprimer / Delete"}
				</button>
			</section>
		</div>
	);
}
