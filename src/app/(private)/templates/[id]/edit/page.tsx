import { notFound } from "next/navigation";
import { getTemplate } from "@/actions/template.action";
import { TemplateEditClient } from "@/app/(private)/templates/[id]/TemplateEditClient";

export default async function EditTemplatePage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = await getTemplate(id);
  if (!template) notFound();

  return (
    <div className="mx-auto max-w-180 px-8 py-8">
      <h1 className="mb-6 text-[22px] font-medium text-(--syn-text)">
        Modifier le modèle
      </h1>
      <TemplateEditClient template={template} />
    </div>
  );
}
