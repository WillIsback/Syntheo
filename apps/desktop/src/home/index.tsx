import { useCallback, useMemo, useState } from "react";

import { useActiveFolders } from "./active-folders";
import { HomeView } from "./home-view";
import { HomeLiveNoteCard, useHomeLiveSessionId } from "./live-note-card";
import { NoteExportDialog } from "./note-export-dialog";
import {
  RECENT_NOTES_LIMIT,
  type RecentNote,
  useOwnerFirstName,
  useRecentNotes,
} from "./queries";

import { useFolderSelection } from "~/folders/selection";
import { useDeleteSession } from "~/session/hooks/useDeleteSession";
import { useFolderIcons } from "~/session/queries";
import { useOpenNoteDialog } from "~/shared/open-note-dialog";
import { getShortcutPlatform } from "~/shared/shortcuts";
import { useNewNote } from "~/shared/useNewNote";
import { useTabs } from "~/store/zustand/tabs";

export { HomeView } from "./home-view";

export function HomePage() {
  const firstName = useOwnerFirstName();
  // Pendant l'écoute, la note figure dans la carte « En cours » (issue 517)
  // et pas dans « Reprendre » : une note de plus est lue pour garder la liste
  // pleine.
  const liveSessionId = useHomeLiveSessionId();
  const latestNotes = useRecentNotes(RECENT_NOTES_LIMIT + 1);
  const recentNotes = useMemo(
    () =>
      latestNotes
        .filter((note) => note.id !== liveSessionId)
        .slice(0, RECENT_NOTES_LIMIT),
    [latestNotes, liveSessionId],
  );
  const folders = useActiveFolders();
  const folderIcons = useFolderIcons();
  const setSelectedPath = useFolderSelection((state) => state.setSelectedPath);
  const openCurrent = useTabs((state) => state.openCurrent);
  // Ouvre la palette de recherche existante (même action que Ctrl+K).
  const { open: openSearch } = useOpenNoteDialog();
  const newNote = useNewNote({ behavior: "current" });
  const os = useMemo(() => getShortcutPlatform(), []);

  const openNote = useCallback(
    (sessionId: string) => openCurrent({ type: "sessions", id: sessionId }),
    [openCurrent],
  );
  // Une carte ouvre la page de son dossier ; « Tous les dossiers » ouvre la
  // vue des dossiers telle que l'utilisateur l'a laissée.
  const openFolder = useCallback(
    (folderPath: string) => {
      setSelectedPath(folderPath);
      openCurrent({ type: "folders" });
    },
    [openCurrent, setSelectedPath],
  );
  const openAllFolders = useCallback(
    () => openCurrent({ type: "folders" }),
    [openCurrent],
  );

  // Menu d'une note (issue 420) : même suppression que partout (toast
  // « Annuler », sans confirmation) et même fenêtre d'export que dans la
  // note, sans l'ouvrir.
  const deleteSession = useDeleteSession();
  const deleteNote = useCallback(
    (note: RecentNote) =>
      deleteSession(note.id, {
        title: note.title,
      }),
    [deleteSession],
  );
  const [exportSessionId, setExportSessionId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportNote = useCallback((sessionId: string) => {
    setExportSessionId(sessionId);
    setExportOpen(true);
  }, []);

  return (
    <>
      <HomeView
        firstName={firstName}
        recentNotes={recentNotes}
        folders={folders}
        folderIcons={folderIcons}
        os={os}
        onStart={newNote}
        onOpenNote={openNote}
        onExportNote={exportNote}
        onDeleteNote={deleteNote}
        onSearch={openSearch}
        onOpenFolder={openFolder}
        onOpenAllFolders={openAllFolders}
        liveNote={
          liveSessionId ? (
            <HomeLiveNoteCard sessionId={liveSessionId} onOpen={openNote} />
          ) : null
        }
      />
      {exportSessionId ? (
        <NoteExportDialog
          key={exportSessionId}
          sessionId={exportSessionId}
          open={exportOpen}
          onOpenChange={setExportOpen}
        />
      ) : null}
    </>
  );
}
