import { ExportModal } from "~/session/components/outer-header/overflow/export-modal";
import { useSessionNoteView } from "~/session/components/shared";

// Fenêtre d'export d'une note depuis l'accueil, sans l'ouvrir (issue 420) :
// même fenêtre que le menu de la note, avec la vue affichée par défaut à
// l'ouverture (premier résumé s'il existe).
export function NoteExportDialog({
  sessionId,
  open,
  onOpenChange,
}: {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const currentView = useSessionNoteView(sessionId);

  return (
    <ExportModal
      sessionId={sessionId}
      currentView={currentView}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
