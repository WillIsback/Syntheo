"use client";

import { useRouter } from "next/navigation";
import { TemplateForm } from "@/components/TemplateForm";
import type { ParsedTemplateRow } from "@/services/postgresql.service";

export function TemplateEditClient({
  template,
}: {
  readonly template: ParsedTemplateRow;
}) {
  const router = useRouter();

  return (
    <TemplateForm
      initialValues={{
        name: template.name,
        description: template.description,
        icon: template.icon,
        content: template.content,
      }}
      onSubmitAction={async (data) => {
        const res = await fetch(`/api/templates/${template.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Erreur mise à jour");
        router.push("/templates");
      }}
    />
  );
}
