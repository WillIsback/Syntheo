import { Trans, useLingui } from "@lingui/react/macro";
import { getVersion } from "@tauri-apps/api/app";
import { useRef, useState } from "react";

import { commands as exportCommands } from "@syntheo/plugin-export";
import { Button } from "@syntheo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@syntheo/ui/components/ui/dialog";

import { eraseBetaData } from "./beta";
import { buildExport, loadExportRows } from "./export";

// Bêta, issue 672 : export pseudonymisé (aperçu complet, puis enregistrement
// dans un fichier choisi ; rien n'est envoyé) et effacement local.

type Preview =
  | { json: string; meetings: number }
  | { error: "empty" | "failed" };

export function BetaData() {
  const { t } = useLingui();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [erased, setErased] = useState(false);
  const opening = useRef(0);

  const openPreview = async () => {
    const run = ++opening.current;
    setSaved(false);
    setErased(false);
    try {
      const [rows, version] = await Promise.all([
        loadExportRows(),
        getVersion(),
      ]);
      if (run !== opening.current) return;
      if (!rows.enrollment) {
        setPreview({ error: "empty" });
        return;
      }
      const data = buildExport(rows, version, new Date());
      setPreview({
        json: JSON.stringify(data, null, 2),
        meetings: data.meetings.length,
      });
    } catch (cause) {
      console.error("[mesure] failed to build the export", cause);
      if (run === opening.current) setPreview({ error: "failed" });
    }
  };

  const save = async (json: string) => {
    setSaving(true);
    try {
      const choice = await exportCommands.chooseExportPath(
        "syntheo-beta.json",
        "json",
      );
      if (choice.status === "error") throw new Error(choice.error);
      if (!choice.data) return;
      const result = await exportCommands.exportText(choice.data, `${json}\n`);
      if (result.status === "error") throw new Error(result.error);
      setSaved(true);
    } catch (cause) {
      console.error("[mesure] failed to save the export", cause);
      setPreview({ error: "failed" });
    } finally {
      setSaving(false);
    }
  };

  const erase = async () => {
    try {
      await eraseBetaData();
      setErased(true);
    } catch (cause) {
      console.error("[mesure] failed to erase the measurements", cause);
    } finally {
      setConfirmErase(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => void openPreview()}>
          <Trans>Export my measurements…</Trans>
        </Button>
        {confirmErase ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void erase()}
            >
              <Trans>Erase all measurements and my pseudonym</Trans>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmErase(false)}
            >
              <Trans>Cancel</Trans>
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmErase(true)}
          >
            <Trans>Erase my measurements…</Trans>
          </Button>
        )}
      </div>
      {erased ? (
        <p className="text-muted-foreground text-xs" role="status">
          <Trans>Measurements and pseudonym erased from this computer.</Trans>
        </p>
      ) : null}

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => !open && setPreview(null)}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <Trans>Export my measurements</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>
                This is the whole file: counts, local indexes and days since you
                joined, under a random pseudonym. No text, title, name or date.
                Nothing is sent: you save the file and choose whether to share
                it.
              </Trans>
            </DialogDescription>
          </DialogHeader>
          {preview && "json" in preview ? (
            <>
              <p className="text-xs">
                {t`Measured meetings: ${preview.meetings}`}
              </p>
              <pre
                data-testid="beta-export-preview"
                className="bg-muted max-h-[50vh] overflow-auto rounded p-3 text-xs"
              >
                {preview.json}
              </pre>
            </>
          ) : preview?.error === "empty" ? (
            <p className="text-sm">
              <Trans>No measurement yet: measure a summary first.</Trans>
            </p>
          ) : (
            <p className="text-destructive text-sm" role="alert">
              <Trans>The export could not be built or saved.</Trans>
            </p>
          )}
          {saved ? (
            <p className="text-muted-foreground text-xs" role="status">
              <Trans>File saved.</Trans>
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              <Trans>Close</Trans>
            </Button>
            {preview && "json" in preview ? (
              <Button disabled={saving} onClick={() => void save(preview.json)}>
                <Trans>Save the file…</Trans>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
