import {
  commands as exportCommands,
  type ExportInput,
} from "@syntheo/plugin-export";
import { commands as openerCommands } from "@syntheo/plugin-opener2";

// « Imprimer… » (issue 374). Pas de `window.print()` : WebView2 imprimerait
// toute l'interface. Le compte rendu est écrit dans un PDF temporaire (même
// rendu que l'export PDF), que le lecteur PDF du système ouvre ; la personne y
// choisit Imprimer. L'impression native viendra plus tard (issue 398).
//
// Le PDF vit dans le cache privé de l'app, sous un nom non devinable (voir
// plugins/export/src/print.rs). On le supprime une fois que le lecteur a eu
// le temps de l'ouvrir : le plugin efface les PDF de plus de dix minutes
// quand on le lui demande, après ce délai, et tous ceux qui restent au
// lancement suivant (fichier encore verrouillé par le lecteur, app fermée).
// Les dix minutes sont dans `PRINT_FILE_TTL`, côté Rust ; la demande part
// une demi-minute après, pour que le fichier soit assurément assez vieux.
export const PRINT_CLEANUP_DELAY_MS = 10 * 60 * 1000 + 30 * 1000;

class PrintPdfError extends Error {}

function schedulePrintCleanup() {
  window.setTimeout(() => {
    void exportCommands
      .cleanupPrintFiles()
      .catch((error) =>
        console.error("[export] failed to clean print files", error),
      );
  }, PRINT_CLEANUP_DELAY_MS);
}

export async function printPdf(input: ExportInput): Promise<void> {
  const created = await exportCommands.printPdf(input);
  if (created.status === "error") {
    throw new PrintPdfError(created.error);
  }

  schedulePrintCleanup();

  const opened = await openerCommands.openPath(created.data, null);
  if (opened.status === "error") {
    throw new PrintPdfError(opened.error);
  }
}
