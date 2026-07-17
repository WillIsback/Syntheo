"use client";

import { useRouter } from "next/navigation";

export function TemplateDeleteButton({
  templateId,
}: {
  readonly templateId: string;
}) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Supprimer ce modèle définitivement ?")) return;
    const res = await fetch(`/api/templates/${templateId}`, {
      method: "DELETE",
    });
    if (res.ok) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void handleDelete()}
      className="rounded-(--syn-radius-sm) border border-(--syn-border) bg-(--syn-surface) px-3 py-1.5 text-xs text-(--syn-status-recording-fg) hover:bg-(--syn-bg)"
    >
      Supprimer
    </button>
  );
}
