import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { join } from "@tauri-apps/api/path";
import { useMemo, useRef, useState } from "react";

import { json2md } from "@syntheo/editor/markdown";
import { commands as exportCommands } from "@syntheo/plugin-export";
import { commands as openerCommands } from "@syntheo/plugin-opener2";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@syntheo/ui/components/ui/dialog";
import { cn } from "@syntheo/utils";

import {
  buildMarkdownExport,
  buildOrgExport,
  buildPdfExport,
  buildTextExport,
  type ExportDocument,
  formatExportDuration,
} from "./export-document";
import {
  folderName,
  resolveExportFolder,
  useExportFolder,
} from "./export-folder";
import { printPdf } from "./print-pdf";

import { useTranscriptExportSegments } from "~/session/components/note-input/transcript/export-data";
import {
  useEnhancedNote,
  useSession,
  useSessionParticipants,
} from "~/session/queries";
import { isAppStoreBuild } from "~/shared/app-store";
import type { EditorView } from "~/store/zustand/tabs/schema";
import { useSessionTranscriptMetadata } from "~/stt/queries";

type FileFormat = "pdf" | "txt" | "md" | "org";

export function ExportModal({
  sessionId,
  currentView,
  open,
  onOpenChange,
}: {
  sessionId: string;
  currentView: EditorView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const [format, setFormat] = useState<FileFormat>("pdf");
  const [includeMemo, setIncludeMemo] = useState(false);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeTranscript, setIncludeTranscript] = useState(false);

  const session = useSession(sessionId);
  const sessionTitle = session?.title;
  const sessionCreatedAt = session?.created_at;
  const rawMd = session?.raw_md;

  const enhancedNoteId = currentView.type === "enhanced" ? currentView.id : "";
  const enhancedNoteContent = useEnhancedNote(enhancedNoteId)?.content;
  const summaryContent = enhancedNoteContent;
  const participants = useSessionParticipants(sessionId);

  const participantNames = useMemo(
    () => participants.map((participant) => participant.name).filter(Boolean),
    [participants],
  );

  const { data: transcriptItems, isLoading: isTranscriptLoading } =
    useTranscriptExportSegments(sessionId);

  const transcripts = useSessionTranscriptMetadata(sessionId);

  const transcriptDuration = useMemo((): string | null => {
    if (transcripts.length === 0) {
      return null;
    }

    let minStartedAt: number | null = null;
    let maxEndedAt: number | null = null;

    for (const transcript of transcripts) {
      if (minStartedAt === null || transcript.startedAt < minStartedAt) {
        minStartedAt = transcript.startedAt;
      }
      if (transcript.endedAt !== undefined) {
        if (maxEndedAt === null || transcript.endedAt > maxEndedAt) {
          maxEndedAt = transcript.endedAt;
        }
      }
    }

    if (minStartedAt !== null && maxEndedAt !== null) {
      return formatExportDuration(minStartedAt, maxEndedAt);
    }
    return null;
  }, [transcripts]);

  const getMemoMd = (): string => {
    if (!rawMd) return "";
    try {
      const parsed = JSON.parse(rawMd);
      return json2md(parsed);
    } catch {
      return "";
    }
  };

  const getSummaryMd = (): string => {
    if (!summaryContent) return "";
    try {
      const parsed = JSON.parse(summaryContent);
      return json2md(parsed);
    } catch {
      return "";
    }
  };

  const buildDocument = (): ExportDocument => ({
    title: sessionTitle || t`Untitled`,
    createdAt: sessionCreatedAt ?? null,
    participants: participantNames,
    duration: transcriptDuration,
    memoMd: includeMemo ? getMemoMd() || null : null,
    summaryMd: includeSummary ? getSummaryMd() || null : null,
    transcript: includeTranscript ? transcriptItems : null,
  });

  const buildPdfContent = () => buildPdfExport(buildDocument());

  const { mutate, isPending, error } = useMutation({
    mutationFn: async () => {
      const { path: directory } = await resolveExportFolder();
      const sanitizedTitle = (
        (sessionTitle ?? t`Untitled`).trim() || t`Untitled`
      ).replace(/[<>:"/\\|?*]/g, "_");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${sanitizedTitle}_${timestamp}.${format}`;
      const defaultPath = await join(directory, filename);
      // App Store sandbox grants must be reacquired after relaunch. Rust opens
      // the dialog so the chosen path is the only one it accepts outside the
      // export folder (issue 422).
      let path: string | null = defaultPath;
      if (isAppStoreBuild()) {
        const chosen = await exportCommands.chooseExportPath(
          defaultPath,
          format,
        );
        if (chosen.status === "error") {
          throw new Error(chosen.error);
        }
        path = chosen.data;
      }
      if (!path) return null;

      if (format === "pdf") {
        const exportContent = buildPdfContent();
        const result = await exportCommands.export(path, exportContent);
        if (result.status === "error") {
          throw new Error(result.error);
        }
      } else {
        const exportDocument = buildDocument();
        const textContent =
          format === "md"
            ? buildMarkdownExport(exportDocument)
            : format === "org"
              ? buildOrgExport(exportDocument)
              : buildTextExport(exportDocument);
        const result = await exportCommands.exportText(path, textContent);
        if (result.status === "error") {
          throw new Error(result.error);
        }
      }

      return path;
    },
    onSuccess: (path) => {
      if (!path) return;
      void openerCommands
        .revealItemInDir(path)
        .catch((error) =>
          console.error("[export] failed to reveal exported file", error),
        );
      onOpenChange(false);
    },
    onError: console.error,
  });

  // « Imprimer… » : toujours le PDF, quel que soit le format choisi.
  const printing = useMutation({
    mutationFn: () => printPdf(buildPdfContent()),
    onSuccess: () => onOpenChange(false),
    onError: console.error,
  });
  const exportFolder = useExportFolder(open);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  const hasAnyContentSelected =
    includeMemo || includeSummary || includeTranscript;
  const isTranscriptPending = includeTranscript && isTranscriptLoading;
  const busy = isPending || printing.isPending;
  const actionDisabled = busy || isTranscriptPending || !hasAnyContentSelected;
  const folder = exportFolder.data;
  const folderLabel = folder ? folderName(folder.path) : "";
  if (!open) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-scrim backdrop-blur-xs"
        // « Enregistrer » est l'action principale : Entrée la déclenche.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          saveButtonRef.current?.focus();
        }}
        className={cn([
          "w-full max-w-xs gap-0 border-0 bg-transparent p-4 shadow-none sm:rounded-none",
          "[&>button:last-child]:hidden",
        ])}
      >
        <div
          className={cn([
            "border-border/80 bg-background rounded-xl border",
            "shadow-2xl",
            "flex flex-col gap-4 p-5 text-center",
          ])}
        >
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-base leading-normal font-semibold">
              <Trans>Export or print</Trans>
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              <Trans>Choose a file format and what to include.</Trans>
            </DialogDescription>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                <Trans>File format</Trans>
              </span>
              <div className="flex justify-center gap-4">
                {(["pdf", "txt", "md", "org"] as const).map((f) => (
                  <label
                    key={f}
                    className="flex cursor-pointer items-center gap-1.5 text-sm"
                  >
                    <input
                      type="radio"
                      name="export-format"
                      checked={format === f}
                      onChange={() => setFormat(f)}
                      className="accent-primary"
                    />
                    {f === "md"
                      ? "Markdown"
                      : f === "org"
                        ? "Org"
                        : f.toUpperCase()}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                <Trans>Include</Trans>
              </span>
              <div className="flex justify-center gap-4">
                {[
                  {
                    id: "memo",
                    label: <Trans>Memo</Trans>,
                    checked: includeMemo,
                    setter: setIncludeMemo,
                  },
                  {
                    id: "summary",
                    label: <Trans>Summary</Trans>,
                    checked: includeSummary,
                    setter: setIncludeSummary,
                  },
                  {
                    id: "transcript",
                    label: <Trans>Transcript</Trans>,
                    checked: includeTranscript,
                    setter: setIncludeTranscript,
                  },
                ].map(({ id, label, checked, setter }) => (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setter(e.target.checked)}
                      className="accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-destructive text-xs">
              <Trans>
                Could not export. Check the export location in Settings and try
                again.
              </Trans>
            </p>
          )}
          {printing.error && (
            <p role="alert" className="text-destructive text-xs">
              <Trans>
                Could not open the PDF to print. Try again, or save it instead.
              </Trans>
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <button
              ref={saveButtonRef}
              type="button"
              onClick={() => mutate(null)}
              disabled={actionDisabled}
              className="border-primary bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-full rounded-full border-2 text-sm font-medium shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending
                ? t`Saving...`
                : isTranscriptPending
                  ? t`Preparing transcript...`
                  : t`Save`}
            </button>
            {folder ? (
              <p
                className="text-muted-foreground truncate text-xs"
                title={folder.path}
              >
                {folder.isDownloads
                  ? t`Saved in Downloads`
                  : t`Saved in ${folderLabel}`}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => printing.mutate()}
              disabled={actionDisabled}
              className="border-border bg-background text-foreground hover:bg-accent h-10 w-full rounded-full border text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {printing.isPending ? t`Opening the PDF...` : t`Print…`}
            </button>
            <p className="text-muted-foreground text-xs">
              <Trans>The PDF opens in your reader. Choose Print.</Trans>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
