import { useCallback, useMemo, useState } from "react";

import { HomeView } from "./home-view";
import { NoteExportDialog } from "./note-export-dialog";
import { type RecentNote, useOwnerFirstName, useRecentNotes } from "./queries";

import { useDeleteSession } from "~/session/hooks/useDeleteSession";
import { useOpenNoteDialog } from "~/shared/open-note-dialog";
import { getShortcutPlatform } from "~/shared/shortcuts";
import { useNewNote } from "~/shared/useNewNote";
import { useTabs } from "~/store/zustand/tabs";

export { HomeView } from "./home-view";

export function HomePage() {
  const firstName = useOwnerFirstName();
  const recentNotes = useRecentNotes();
  const openCurrent = useTabs((state) => state.openCurrent);
  // Ouvre la palette de recherche existante (même action que Ctrl+K).
  const { open: openSearch } = useOpenNoteDialog();
  const newNote = useNewNote({ behavior: "current" });
  const os = useMemo(() => getShortcutPlatform(), []);

  const openNote = useCallback(
    (sessionId: string) => openCurrent({ type: "sessions", id: sessionId }),
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
        os={os}
        onStart={newNote}
        onOpenNote={openNote}
        onExportNote={exportNote}
        onDeleteNote={deleteNote}
        onSearch={openSearch}
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
