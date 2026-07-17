"use client";

import { useRouter } from "next/navigation";
import { TemplateForm } from "@/components/TemplateForm";

export default function NewTemplatePage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-180 px-8 py-8">
      <h1 className="mb-6 text-[22px] font-medium text-(--syn-text)">
        Nouveau modèle
      </h1>
      <TemplateForm
        onSubmitAction={async (data) => {
          const res = await fetch("/api/templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!res.ok) throw new Error("Erreur création");
          router.push("/templates");
        }}
      />
    </div>
  );
}
