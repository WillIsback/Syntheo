import { Trans, useLingui } from "@lingui/react/macro";
import { useRef, useState } from "react";

import { File, Plus, X } from "@syntheo/ui/components/icons";
import { cn } from "@syntheo/utils";

import {
  deleteLocalFolderMaterial,
  diskAttachmentId,
  useFolderMaterials,
} from "~/session/folder-attachments";
import { FolderInstructionsField } from "~/session/folder-instructions";
import { useFolderMaterialUpload } from "~/shared/hooks/useFileUpload";

export const folderCardClassName =
  "border-border bg-card flex min-w-0 flex-col gap-2.5 rounded-xl border px-4 py-3.5";

// Colonne de droite de la page d'un dossier (issue 496) : le contexte et les
// supports existants, au comportement inchangé.
export function FolderSidePanel({ folderPath }: { folderPath: string }) {
  const { t } = useLingui();
  const materials = useFolderMaterials(folderPath);
  const upload = useFolderMaterialUpload(folderPath);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className={folderCardClassName}>
        <h3 className="text-sm font-semibold">
          <Trans>Context</Trans>
        </h3>
        <p className="text-muted-foreground text-xs">
          <Trans>What these notes are usually about</Trans>
        </p>
        <FolderInstructionsField folderPath={folderPath} rows={4} />
      </section>

      <section className={folderCardClassName}>
        <h3 className="text-sm font-semibold">
          <Trans>Materials</Trans>
        </h3>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) {
              return;
            }
            setBusy(true);
            try {
              await upload(file);
            } finally {
              setBusy(false);
            }
          }}
        />
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
          <li>
            <button
              type="button"
              disabled={busy}
              className={cn([
                "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                "flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
                "disabled:opacity-50",
              ])}
              onClick={() => inputRef.current?.click()}
            >
              <Plus className="size-6" />
              <span className="text-xs font-medium">
                <Trans>Add file</Trans>
              </span>
            </button>
          </li>
          {materials.map((material) => (
            <li key={material.id}>
              <div className="border-border relative flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-lg border px-3 py-2">
                <File
                  className="text-muted-foreground size-6 shrink-0"
                  aria-hidden
                />
                <span
                  className="w-full truncate text-center text-xs"
                  title={material.filename}
                >
                  {material.filename}
                </span>
                <button
                  type="button"
                  aria-label={t`Remove ${material.filename}`}
                  disabled={busy}
                  className={cn([
                    "text-muted-foreground hover:bg-accent hover:text-foreground",
                    "absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
                    "disabled:opacity-50",
                  ])}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await deleteLocalFolderMaterial({
                        folderPath,
                        attachmentId: diskAttachmentId(material.relativePath),
                      });
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
