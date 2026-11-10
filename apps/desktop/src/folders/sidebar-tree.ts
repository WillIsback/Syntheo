// Arborescence des dossiers de la barre latérale (issue 497) : chaque dossier
// se déplie en sous-dossiers, puis en notes par date. Le compteur reprend
// celui de la recherche unifiée (sous-dossiers compris).

import { countNotesByFolder } from "~/search/unified/rank";
import type { SearchNote } from "~/search/unified/types";
import { collectFolderPaths, folderDisplayName } from "~/session/folders";

/** Notes affichées sous un dossier déplié avant « … N autres ». */
const VISIBLE_FOLDER_NOTES = 5;

export type FolderTreeNode = {
  path: string;
  name: string;
  // Réunions du dossier, sous-dossiers compris.
  noteCount: number;
  children: FolderTreeNode[];
  // Notes rangées directement dans ce dossier, plus récentes d'abord.
  notes: SearchNote[];
};

type RowBase = { key: string; depth: number; parentKey: string | null };

export type FolderTreeRow =
  | (RowBase & {
      kind: "folder";
      path: string;
      name: string;
      noteCount: number;
      expandable: boolean;
      expanded: boolean;
    })
  | (RowBase & { kind: "note"; note: SearchNote })
  | (RowBase & { kind: "more"; path: string; hiddenCount: number });

export function folderRowKey(path: string): string {
  return `folder:${path}`;
}

function byNewest(left: SearchNote, right: SearchNote): number {
  return right.createdAt.localeCompare(left.createdAt);
}

export function buildFolderTree(
  paths: readonly string[],
  notes: readonly SearchNote[],
): FolderTreeNode[] {
  const counts = countNotesByFolder(notes);
  const notesByFolder = new Map<string, SearchNote[]>();
  for (const item of notes) {
    if (!item.folderPath) continue;
    const list = notesByFolder.get(item.folderPath) ?? [];
    list.push(item);
    notesByFolder.set(item.folderPath, list);
  }

  const nodes = new Map<string, FolderTreeNode>();
  const roots: FolderTreeNode[] = [];
  // Triés par chemin : un parent passe toujours avant ses sous-dossiers.
  for (const path of collectFolderPaths(paths)) {
    const node: FolderTreeNode = {
      path,
      name: folderDisplayName(path) || path,
      noteCount: counts.get(path) ?? 0,
      children: [],
      notes: [...(notesByFolder.get(path) ?? [])].sort(byNewest),
    };
    nodes.set(path, node);
    const slash = path.lastIndexOf("/");
    const parent = slash > 0 ? nodes.get(path.slice(0, slash)) : undefined;
    (parent ? parent.children : roots).push(node);
  }

  const sortByName = (list: FolderTreeNode[]) => {
    list.sort((left, right) => left.name.localeCompare(right.name));
    for (const node of list) sortByName(node.children);
  };
  sortByName(roots);
  return roots;
}

/** Lignes visibles, dans l'ordre d'affichage (et de navigation clavier). */
export function visibleFolderTreeRows(
  tree: readonly FolderTreeNode[],
  isExpanded: (path: string) => boolean,
  limit = VISIBLE_FOLDER_NOTES,
): FolderTreeRow[] {
  const rows: FolderTreeRow[] = [];
  const walk = (
    nodes: readonly FolderTreeNode[],
    depth: number,
    parentKey: string | null,
  ) => {
    for (const node of nodes) {
      const key = folderRowKey(node.path);
      const expandable = node.children.length > 0 || node.notes.length > 0;
      const expanded = expandable && isExpanded(node.path);
      rows.push({
        kind: "folder",
        key,
        depth,
        parentKey,
        path: node.path,
        name: node.name,
        noteCount: node.noteCount,
        expandable,
        expanded,
      });
      if (!expanded) continue;
      walk(node.children, depth + 1, key);
      for (const item of node.notes.slice(0, limit)) {
        rows.push({
          kind: "note",
          key: `note:${item.id}`,
          depth: depth + 1,
          parentKey: key,
          note: item,
        });
      }
      if (node.notes.length > limit) {
        rows.push({
          kind: "more",
          key: `more:${node.path}`,
          depth: depth + 1,
          parentKey: key,
          path: node.path,
          hiddenCount: node.notes.length - limit,
        });
      }
    }
  };
  walk(tree, 0, null);
  return rows;
}

/**
 * Filtre de la recherche des dossiers : un dossier qui correspond garde tout
 * son contenu ; ses parents restent affichés (sans leurs notes) et ouverts.
 */
export function filterFolderTree(
  tree: FolderTreeNode[],
  query: string,
): { tree: FolderTreeNode[]; forcedExpanded: Set<string> } {
  const needle = query.trim().toLowerCase();
  const forcedExpanded = new Set<string>();
  if (!needle) {
    return { tree, forcedExpanded };
  }

  const prune = (nodes: readonly FolderTreeNode[]): FolderTreeNode[] =>
    nodes.flatMap((node) => {
      if (node.path.toLowerCase().includes(needle)) {
        return [node];
      }
      const children = prune(node.children);
      if (children.length === 0) {
        return [];
      }
      forcedExpanded.add(node.path);
      return [{ ...node, children, notes: [] }];
    });

  return { tree: prune(tree), forcedExpanded };
}
