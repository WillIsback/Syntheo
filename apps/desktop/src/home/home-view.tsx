import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";

import type { HomeFolder } from "./active-folders";
import { FolderCards } from "./folder-cards";
import { HomeCapsule } from "./home-capsule";
import { NoteIndex } from "./note-index";
import type { RecentNote } from "./queries";
import { StartButton } from "./start-button";

import type { ShortcutPlatform } from "~/shared/shortcuts";
import { type PaletteId, useDocumentPalette } from "~/shared/theme/palette";
import type { TranscriptionSource } from "~/stt/usable-transcription";
import type { TemplateIcon } from "~/templates/template-icon";

// Filigrane de l'accueil selon la palette (maquette, objet PAL) : 茶 Thé vert,
// 藤 Glycine, 紅 Laque et encre.
const WATERMARK: Record<PaletteId, string> = {
  cha: "茶",
  fuji: "藤",
  enji: "紅",
};

/** Où se fait le traitement, pour la ligne du bas de l'accueil (QA 0.8.0-3). */
export type HomeProcessing = {
  /** Source de transcription utilisable (useUsableTranscription), sinon `null`. */
  transcription: TranscriptionSource | null;
  /** Un modèle de synthèse est configuré. */
  summary: boolean;
  /** État encore en chargement : rien à affirmer. */
  loading?: boolean;
};

export type HomeViewProps = {
  firstName: string;
  recentNotes: readonly RecentNote[];
  folders?: readonly HomeFolder[];
  folderIcons?: Record<string, TemplateIcon | undefined>;
  os?: ShortcutPlatform;
  onStart: () => void;
  onOpenNote: (sessionId: string) => void;
  onExportNote: (sessionId: string) => void;
  onDeleteNote: (note: RecentNote) => void;
  onMoveNote?: (note: RecentNote) => void;
  onSearch: () => void;
  onOpenFolder?: (folderPath: string) => void;
  onOpenAllFolders?: () => void;
  // Carte « En cours » (issue 517), placée au-dessus des notes récentes.
  liveNote?: ReactNode;
  processing?: HomeProcessing;
};

const NO_FOLDERS: readonly HomeFolder[] = [];
const noop = () => {};

// Accueil guidé « Thé vert » (maquette piste C, écran Accueil) : colonne de
// 640px, salutation, prochaine réunion, bouton Démarrer, « Vos dossiers »
// (issue 500), « Reprendre ».
export function HomeView({
  firstName,
  recentNotes,
  folders = NO_FOLDERS,
  folderIcons,
  os = "pc",
  onStart,
  onOpenNote,
  onExportNote,
  onDeleteNote,
  onMoveNote,
  onSearch,
  onOpenFolder = noop,
  onOpenAllFolders = noop,
  liveNote = null,
  processing,
}: HomeViewProps) {
  const palette = useDocumentPalette();

  return (
    <div
      data-tauri-drag-region
      data-home
      className="bg-background relative flex h-full min-h-0 flex-col overflow-hidden"
    >
      <span
        aria-hidden="true"
        data-home-watermark
        className="font-kanji text-primary pointer-events-none absolute top-16 right-12 text-[300px] leading-none font-bold opacity-[0.06] select-none"
      >
        {WATERMARK[palette]}
      </span>
      <div className="relative flex min-h-0 flex-1 justify-center overflow-y-auto px-6 pt-6 pb-24">
        <div className="mt-10 flex w-[640px] max-w-full flex-col gap-[26px]">
          <header className="flex flex-col gap-1.5">
            <h1 className="text-foreground font-serif text-[52px] leading-[1.05] font-medium tracking-[-0.01em] text-balance">
              {firstName ? (
                <Trans>Hello {firstName}.</Trans>
              ) : (
                <Trans>Hello.</Trans>
              )}
            </h1>
          </header>
          <StartButton onStart={onStart} os={os} />
          <FolderCards
            folders={folders}
            onOpenFolder={onOpenFolder}
            onOpenAllFolders={onOpenAllFolders}
          />
          {liveNote}
          <NoteIndex
            notes={recentNotes}
            folderIcons={folderIcons}
            onOpen={onOpenNote}
            onExport={onExportNote}
            onDelete={onDeleteNote}
            onMove={onMoveNote}
          />
          <ProcessingLine processing={processing} />
        </div>
      </div>
      <HomeCapsule onSearch={onSearch} os={os} />
    </div>
  );
}

// Ligne du bas (QA 0.8.0-3) : dit où se fait le traitement, d'après la source
// de transcription utilisable, au lieu d'un « serveur local » affiché en dur.
// Sans transcription utilisable (ou pendant le chargement) : ni pastille ni
// texte.
function ProcessingLine({ processing }: { processing?: HomeProcessing }) {
  if (!processing || processing.loading || !processing.transcription) {
    return null;
  }
  let text: ReactNode;
  if (processing.transcription === "on_device") {
    text = processing.summary ? (
      <Trans>
        Transcription runs on this computer; summaries on your server
      </Trans>
    ) : (
      <Trans>Transcription runs on this computer</Trans>
    );
  } else {
    text = processing.summary ? (
      <Trans>Everything is processed on your server</Trans>
    ) : (
      <Trans>Transcription runs on your server</Trans>
    );
  }
  return (
    <p
      data-home-processing
      className="text-muted-foreground flex items-center gap-2 text-[13px]"
    >
      <span aria-hidden="true" className="bg-primary size-[7px] rounded-full" />
      {text}
    </p>
  );
}
