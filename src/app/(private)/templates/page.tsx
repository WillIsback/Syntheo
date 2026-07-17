import Link from "next/link";
import { listTemplates } from "@/actions/template.action";
import { TemplateDeleteButton } from "@/app/(private)/templates/TemplateDeleteButton";
import { Button } from "@/components";
import { REPORT_TEMPLATES } from "@/data/sessions";

export default async function TemplatesPage() {
  const customTemplates = await listTemplates();

  return (
    <div className="mx-auto max-w-180 px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[22px] font-medium text-(--syn-text)">Modèles</h1>
        <Link href="/templates/new">
          <Button variant="filled">+ Nouveau modèle</Button>
        </Link>
      </div>

      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-(--syn-text-3)">
        Modèles intégrés
      </div>
      <div className="mb-6 space-y-2">
        {REPORT_TEMPLATES.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-3 rounded-(--syn-radius-sm) border border-(--syn-border) bg-(--syn-surface) px-4 py-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--syn-bg) text-base">
              {t.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-(--syn-text)">
                {t.name}
              </div>
              <div className="text-xs text-(--syn-text-2)">{t.desc}</div>
            </div>
            <span className="rounded-full bg-(--syn-bg) px-2 py-0.5 text-[10px] text-(--syn-text-3)">
              intégré
            </span>
          </div>
        ))}
      </div>

      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-(--syn-text-3)">
        Mes modèles
      </div>
      {customTemplates.length === 0 ? (
        <div className="rounded-(--syn-radius-sm) border border-dashed border-(--syn-border) px-4 py-8 text-center text-sm text-(--syn-text-3)">
          Aucun modèle personnalisé.{" "}
          <Link
            href="/templates/new"
            className="text-(--syn-blue) hover:underline"
          >
            Créer le premier
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {customTemplates.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-(--syn-radius-sm) border border-(--syn-border) bg-(--syn-surface) px-4 py-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--syn-bg) text-base">
                {t.icon ?? "📝"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-(--syn-text)">
                  {t.name}
                </div>
                {t.description && (
                  <div className="text-xs text-(--syn-text-2)">
                    {t.description}
                  </div>
                )}
              </div>
              <Link href={`/templates/${t.id}/edit`}>
                <Button>Modifier</Button>
              </Link>
              <TemplateDeleteButton templateId={t.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
