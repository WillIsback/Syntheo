import { folderDisplayName } from "@syntheo/utils/folders";

import { type UserTemplate } from "./queries";
import { groupUserTemplates } from "./utils";

import { type FolderTemplateAssignment } from "~/folders/folder-template";

type FolderTemplateGroup = {
  // Dossiers qui utilisent ces modèles, triés : un groupe par dossier, ou par
  // ensemble de dossiers quand un modèle sert à plusieurs.
  folderPaths: string[];
  label: string;
  templates: UserTemplate[];
};

// Écran Modèles (issue 502) : les favoris, puis un groupe par dossier qui
// utilise un modèle (nommé comme le dossier), puis les modèles généraux.
// Chaque modèle n'apparaît qu'une fois : un favori reste dans les favoris. La
// recherche porte sur le modèle et sur le nom des dossiers qui l'utilisent.
export function groupTemplatesForSidebar(
  userTemplates: UserTemplate[],
  search: string,
  assignments: readonly FolderTemplateAssignment[],
): {
  favorites: UserTemplate[];
  folders: FolderTemplateGroup[];
  general: UserTemplate[];
} {
  const foldersByTemplate = new Map<string, string[]>();
  for (const { folderPath, templateId } of assignments) {
    const paths = foldersByTemplate.get(templateId) ?? [];
    paths.push(folderPath);
    foldersByTemplate.set(templateId, paths);
  }

  const query = search.trim().toLowerCase();
  const searched = groupUserTemplates(userTemplates, search);
  const matched = new Set(
    [...searched.favorites, ...searched.others].map((template) => template.id),
  );
  const visible = query
    ? userTemplates.filter(
        (template) =>
          matched.has(template.id) ||
          (foldersByTemplate.get(template.id) ?? []).some((path) =>
            folderDisplayName(path).toLowerCase().includes(query),
          ),
      )
    : userTemplates;
  const { favorites, others } = groupUserTemplates(visible);

  const groups = new Map<string, FolderTemplateGroup>();
  const general: UserTemplate[] = [];
  for (const template of others) {
    const paths = [...(foldersByTemplate.get(template.id) ?? [])].sort(
      (left, right) =>
        folderDisplayName(left).localeCompare(folderDisplayName(right)) ||
        left.localeCompare(right),
    );
    if (paths.length === 0) {
      general.push(template);
      continue;
    }
    const key = paths.join("\n");
    const group = groups.get(key) ?? {
      folderPaths: paths,
      label: paths.map(folderDisplayName).join(", "),
      templates: [],
    };
    group.templates.push(template);
    groups.set(key, group);
  }

  const folders = [...groups.values()].sort(
    (left, right) =>
      left.label.localeCompare(right.label, undefined, {
        sensitivity: "base",
      }) || left.folderPaths[0]!.localeCompare(right.folderPaths[0]!),
  );

  return { favorites, folders, general };
}
