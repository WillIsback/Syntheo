import { t } from "@lingui/core/macro";

import { toast } from "@syntheo/ui/components/ui/toast";

import { runShortcutAction } from "~/shared/shortcut-actions";

// Ctrl+P et menu Fichier « Exporter… » (issue 374). La note au premier plan
// enregistre son action (`registerShortcutAction("exportNote", …)`) : elle
// ouvre la fenêtre « Exporter ou imprimer », ou rappelle de terminer l'écoute.
// Hors d'une note, un message court.
export function exportNoteFromShortcut() {
  if (runShortcutAction("exportNote")) {
    return;
  }

  toast.info(t`Open a note to export it.`);
}

// Pendant l'écoute : exporter une transcription en cours prête à confusion.
export function showFinishListeningToExport() {
  toast.info(t`Finish listening to export the note.`);
}
