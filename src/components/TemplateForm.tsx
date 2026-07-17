"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components";

const ICON_OPTIONS = [
  "📝",
  "📋",
  "🗒️",
  "💼",
  "🎯",
  "📊",
  "🤝",
  "📣",
  "🔍",
  "✅",
];

const CONTENT_PLACEHOLDER = `#Titre de la première section
Décris ici ce que cette section doit contenir, avec autant de détails que tu veux.

#Titre de la deuxième section
Autre description...`;

type TemplateFormProps = {
  readonly initialValues?: {
    name: string;
    description: string | null;
    icon: string | null;
    content: string;
  };
  readonly onSubmitAction: (data: {
    name: string;
    description: string | null;
    icon: string;
    content: string;
  }) => Promise<void>;
};

export function TemplateForm({
  initialValues,
  onSubmitAction,
}: TemplateFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(
    initialValues?.description ?? "",
  );
  const [icon, setIcon] = useState(initialValues?.icon ?? "📝");
  const [content, setContent] = useState(initialValues?.content ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !content.trim()) {
      setError("Le nom et le contenu sont requis.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmitAction({
        name: name.trim(),
        description: description.trim() || null,
        icon,
        content: content.trim(),
      });
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
      setIsSubmitting(false);
    }
  }

  async function handleAiGenerate() {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: aiPrompt.trim() }),
      });
      if (!res.ok) throw new Error("Erreur génération");
      const data = (await res.json()) as { content: string };
      setContent(data.content);
      setShowAiInput(false);
      setAiPrompt("");
    } catch {
      setError("La génération IA a échoué. Réessayez.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Icon + name row */}
      <div className="flex items-start gap-3">
        <div>
          <div className="mb-1 text-[11px] font-medium text-(--syn-text-3)">
            Icône
          </div>
          <div className="flex flex-wrap gap-1">
            {ICON_OPTIONS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setIcon(em)}
                className={[
                  "flex h-8 w-8 items-center justify-center rounded-lg border text-base transition-colors",
                  icon === em
                    ? "border-(--syn-blue) bg-(--syn-blue-light)"
                    : "border-(--syn-border) hover:border-(--syn-blue)",
                ].join(" ")}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <label
            htmlFor="template-name"
            className="mb-1 block text-[11px] font-medium text-(--syn-text-3)"
          >
            Nom du modèle
          </label>
          <input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Réunion de projet"
            className="w-full rounded-(--syn-radius-sm) border border-(--syn-border) bg-(--syn-surface) px-3 py-2 text-sm text-(--syn-text) outline-none focus:border-(--syn-blue)"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="template-description"
          className="mb-1 block text-[11px] font-medium text-(--syn-text-3)"
        >
          Description{" "}
          <span className="font-normal text-(--syn-text-3)">(optionnel)</span>
        </label>
        <input
          id="template-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brève description de ce modèle"
          className="w-full rounded-(--syn-radius-sm) border border-(--syn-border) bg-(--syn-surface) px-3 py-2 text-sm text-(--syn-text) outline-none focus:border-(--syn-blue)"
        />
      </div>

      {/* Content textarea */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label
            htmlFor="template-content"
            className="text-[11px] font-medium text-(--syn-text-3)"
          >
            Contenu du modèle
          </label>
          <button
            type="button"
            onClick={() => setShowAiInput((v) => !v)}
            className="text-[11px] text-(--syn-blue) hover:underline"
          >
            {showAiInput ? "Fermer" : "✨ Générer avec IA"}
          </button>
        </div>

        {showAiInput && (
          <div className="mb-2 flex gap-2">
            <input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Ex : réunion de standup d'équipe tech"
              className="flex-1 rounded-(--syn-radius-sm) border border-(--syn-border) bg-(--syn-surface) px-3 py-2 text-sm outline-none focus:border-(--syn-blue)"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAiGenerate();
                }
              }}
            />
            <Button
              type="button"
              variant="filled"
              onClick={() => void handleAiGenerate()}
              disabled={isGenerating || !aiPrompt.trim()}
            >
              {isGenerating ? "…" : "Générer"}
            </Button>
          </div>
        )}

        <textarea
          id="template-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={CONTENT_PLACEHOLDER}
          rows={14}
          className="w-full resize-y rounded-(--syn-radius-sm) border border-(--syn-border) bg-(--syn-surface) px-3 py-2 font-mono text-[13px] leading-relaxed text-(--syn-text) outline-none focus:border-(--syn-blue)"
        />
        <p className="mt-1 text-[11px] text-(--syn-text-3)">
          Utilisez <code className="rounded bg-(--syn-bg) px-1">#</code> pour
          les titres de section.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2.5">
        <Button type="button" onClick={() => router.back()}>
          Annuler
        </Button>
        <Button type="submit" variant="filled" disabled={isSubmitting}>
          {isSubmitting ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
