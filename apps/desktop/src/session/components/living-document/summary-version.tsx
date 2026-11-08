import { Trans, useLingui } from "@lingui/react/macro";
import { type RefObject, useCallback, useMemo, useState } from "react";
import { Streamdown } from "streamdown";

import type { NoteEditorRef } from "@syntheo/editor/note";
import { streamdownIcons } from "@syntheo/ui/components/streamdown-icons";
import { Button } from "@syntheo/ui/components/ui/button";
import { cn } from "@syntheo/utils";

import { streamdownComponents } from "../streamdown";
import { formatVersionDate } from "./summary-switcher-view";

import { flushDatabaseWrites } from "~/db/write-queue";
import { useEnhancedNoteActions } from "~/session/components/note-input/enhanced-actions";
import { noteChangedSinceSummary } from "~/session/note-fingerprint";
import { type SummaryVersionRecord, useEnhancedNote } from "~/session/queries";

// Une version remplacée d'une synthèse (issue 415), en lecture seule : la
// version actuelle l'emporte toujours, on ne peut pas en promouvoir une
// ancienne. Pas de coloration des notes : elle ne concerne que la version
// actuelle.
export function SummaryVersionView({
  version,
  onBackToCurrent,
}: {
  version: SummaryVersionRecord;
  onBackToCurrent: () => void;
}) {
  const { t, i18n } = useLingui();
  const date = formatVersionDate(
    version.generatedAt ?? version.supersededAt,
    i18n.locale,
  );
  const versionNumber = version.version;
  const versionLabel = date
    ? t`Version ${versionNumber} · ${date}`
    : t`Version ${versionNumber}`;

  return (
    <section
      aria-label={versionLabel}
      data-summary-version
      className="flex flex-col gap-3"
    >
      <div className="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-foreground text-[13px] font-medium">
            {versionLabel}
          </p>
          <p className="text-muted-foreground text-[12px]">
            <Trans>
              Earlier version, read only. The latest summary stays the current
              one.
            </Trans>
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onBackToCurrent}
        >
          <Trans>Back to current version</Trans>
        </Button>
      </div>
      <div data-provenance="ai" aria-readonly="true">
        <Streamdown
          icons={streamdownIcons}
          components={streamdownComponents}
          className={cn(["note-typography", "flex flex-col"])}
          linkSafety={{ enabled: false }}
        >
          {version.markdown}
        </Streamdown>
      </div>
    </section>
  );
}

// Bandeau de la vue « Mes notes » : affiché quand la note a changé depuis la
// synthèse actuelle (on compare son empreinte avec celle de la note qui a
// servi à la générer). Régénérer en crée la version suivante.
export function NotesChangedBanner({
  sessionId,
  enhancedNoteId,
  rawMd,
  editorRef,
  onShowSummary,
}: {
  sessionId: string;
  enhancedNoteId: string;
  rawMd: string;
  editorRef: RefObject<NoteEditorRef | null>;
  onShowSummary: () => void;
}) {
  const sourceNoteFingerprint =
    useEnhancedNote(enhancedNoteId)?.sourceNoteFingerprint;
  const { isGenerating, onRegenerate } = useEnhancedNoteActions({
    sessionId,
    enhancedNoteId,
  });
  const changed = useMemo(
    () => noteChangedSinceSummary(rawMd, sourceNoteFingerprint),
    [rawMd, sourceNoteFingerprint],
  );
  const handleRegenerate = useCallback(async () => {
    // La régénération relit la note en base : la saisie y est écrite d'abord.
    editorRef.current?.flushPendingChanges();
    await flushDatabaseWrites([`session:${sessionId}`]);
    onShowSummary();
    await onRegenerate(null);
  }, [editorRef, onRegenerate, onShowSummary, sessionId]);

  return changed ? (
    <RegenerateWithNotesBanner
      isGenerating={isGenerating}
      onRegenerate={handleRegenerate}
    />
  ) : null;
}

export function RegenerateWithNotesBanner({
  isGenerating,
  onRegenerate,
}: {
  isGenerating: boolean;
  onRegenerate: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div
      role="status"
      data-regenerate-banner
      className="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-4 py-2.5"
    >
      <p className="text-foreground min-w-0 text-[13px]">
        <Trans>Your notes have changed since this summary.</Trans>
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={busy || isGenerating}
        onClick={() => {
          setBusy(true);
          void Promise.resolve(onRegenerate()).finally(() => setBusy(false));
        }}
      >
        <Trans>Regenerate with my notes</Trans>
      </Button>
    </div>
  );
}
