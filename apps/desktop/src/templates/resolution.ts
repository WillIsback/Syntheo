import { ancestorFolderPaths } from "@syntheo/utils/folders";

// Modèle de compte rendu d'une note (issue 502), résolu au démarrage de la
// synthèse : modèle choisi sur la note > modèle du dossier (ou du dossier
// parent le plus proche) > défaut global > Automatique (aucun modèle, format
// libre). Un identifiant vide vaut « pas de choix » à chaque niveau.

export type TemplateResolutionSource = "note" | "folder" | "global" | "auto";

export type TemplateResolution = {
  templateId: string | undefined;
  source: TemplateResolutionSource;
};

export function resolveSummaryTemplate({
  requestedTemplateId,
  noteTemplateId,
  folderTemplateId,
  globalTemplateId,
}: {
  // Choix fait au lancement (changer de modèle, régénérer) : `null` force
  // Automatique, une chaîne vide ou `undefined` laisse résoudre.
  requestedTemplateId?: string | null;
  noteTemplateId?: string | null;
  folderTemplateId?: string | null;
  globalTemplateId?: string | null;
}): TemplateResolution {
  if (requestedTemplateId === null) {
    return { templateId: undefined, source: "auto" };
  }
  if (requestedTemplateId) {
    return { templateId: requestedTemplateId, source: "note" };
  }
  if (noteTemplateId) {
    return { templateId: noteTemplateId, source: "note" };
  }
  if (folderTemplateId) {
    return { templateId: folderTemplateId, source: "folder" };
  }
  if (globalTemplateId) {
    return { templateId: globalTemplateId, source: "global" };
  }
  return { templateId: undefined, source: "auto" };
}

export function resolveSummaryTemplateId(
  input: Parameters<typeof resolveSummaryTemplate>[0],
): string | undefined {
  return resolveSummaryTemplate(input).templateId;
}

// Modèle du dossier de la note, ou du dossier parent le plus proche qui en a
// un. `folderTemplates` : chemin du dossier → identifiant du modèle.
export function nearestFolderTemplate(
  folderPath: string | null | undefined,
  folderTemplates: ReadonlyMap<string, string>,
): { folderPath: string; templateId: string } | undefined {
  const ancestors = ancestorFolderPaths(folderPath ?? "");
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const path = ancestors[index]!;
    const templateId = folderTemplates.get(path);
    if (templateId) {
      return { folderPath: path, templateId };
    }
  }
  return undefined;
}
