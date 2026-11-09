import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { CaretRight } from "@syntheo/ui/components/icons";
import { cn } from "@syntheo/utils";

import { useExpandedFolders } from "./expanded-folders";
import { formatShortDate } from "./project/format";
import {
  type FolderTreeNode,
  type FolderTreeRow,
  folderRowKey,
  visibleFolderTreeRows,
} from "./sidebar-tree";

import { useTabs } from "~/store/zustand/tabs";
import {
  type TemplateIcon,
  TemplateIconGlyph,
} from "~/templates/template-icon";

const INDENT_PX = 14;

function openNote(id: string) {
  useTabs.getState().openNew({ type: "sessions", id });
}

// Dossiers en projets dépliables (issue 497) : arbre WAI-ARIA à focus mobile.
// Flèches haut/bas : ligne précédente/suivante ; droite : déplier puis entrer ;
// gauche : plier puis remonter au parent ; Entrée : ouvrir.
export function FolderTreeView({
  tree,
  forcedExpanded,
  activeFolder,
  iconFor,
  onSelectFolder,
}: {
  tree: readonly FolderTreeNode[];
  forcedExpanded: ReadonlySet<string>;
  activeFolder: string | null;
  iconFor: (path: string) => TemplateIcon;
  onSelectFolder: (path: string) => void;
}) {
  const { t } = useLingui();
  const expanded = useExpandedFolders((state) => state.expanded);
  const setExpanded = useExpandedFolders((state) => state.setExpanded);
  const rows = useMemo(() => {
    const open = new Set(expanded);
    return visibleFolderTreeRows(
      tree,
      (path) => open.has(path) || forcedExpanded.has(path),
    );
  }, [tree, expanded, forcedExpanded]);

  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const activeKey = activeFolder ? folderRowKey(activeFolder) : null;
  const tabStopKey =
    [focusedKey, activeKey].find(
      (key) => key && rows.some((row) => row.key === key),
    ) ??
    rows[0]?.key ??
    null;

  const moveFocus = useCallback((key: string | undefined | null) => {
    if (!key) return;
    setFocusedKey(key);
    itemRefs.current.get(key)?.focus();
  }, []);

  const activate = (row: FolderTreeRow) => {
    setFocusedKey(row.key);
    if (row.kind === "note") {
      openNote(row.note.id);
    } else {
      onSelectFolder(row.path);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const index = rows.findIndex((row) => row.key === tabStopKey);
    const row = rows[index];
    if (!row) return;
    let handled = true;
    switch (event.key) {
      case "ArrowDown":
        moveFocus(rows[index + 1]?.key);
        break;
      case "ArrowUp":
        moveFocus(rows[index - 1]?.key);
        break;
      case "Home":
        moveFocus(rows[0]?.key);
        break;
      case "End":
        moveFocus(rows[rows.length - 1]?.key);
        break;
      case "ArrowRight":
        if (row.kind === "folder" && row.expandable) {
          if (row.expanded) moveFocus(rows[index + 1]?.key);
          else setExpanded(row.path, true);
        }
        break;
      case "ArrowLeft":
        if (row.kind === "folder" && row.expanded) {
          setExpanded(row.path, false);
        } else {
          moveFocus(row.parentKey);
        }
        break;
      case "Enter":
      case " ":
        activate(row);
        break;
      default:
        handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <ul
      role="tree"
      aria-label={t`Folders`}
      className="flex flex-col gap-px"
      onKeyDown={handleKeyDown}
    >
      {rows.map((row) => (
        <TreeRow
          key={row.key}
          row={row}
          selected={row.key === activeKey}
          tabbable={row.key === tabStopKey}
          itemRef={(element) => {
            if (element) itemRefs.current.set(row.key, element);
            else itemRefs.current.delete(row.key);
          }}
          onActivate={() => activate(row)}
          onToggle={() => {
            if (row.kind === "folder") {
              setFocusedKey(row.key);
              setExpanded(row.path, !row.expanded);
            }
          }}
        >
          {(countId) => (
            <RowContent row={row} iconFor={iconFor} countId={countId} />
          )}
        </TreeRow>
      ))}
    </ul>
  );
}

function TreeRow({
  row,
  selected,
  tabbable,
  itemRef,
  onActivate,
  onToggle,
  children,
}: {
  row: FolderTreeRow;
  selected: boolean;
  tabbable: boolean;
  itemRef: (element: HTMLLIElement | null) => void;
  onActivate: () => void;
  onToggle: () => void;
  children: (countId: string) => ReactNode;
}) {
  const { t } = useLingui();
  const countId = useId();
  const isFolder = row.kind === "folder";
  const label =
    row.kind === "folder"
      ? row.name
      : row.kind === "note"
        ? row.note.title.trim() || t`Untitled`
        : undefined;

  return (
    <li
      ref={itemRef}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={isFolder && row.expandable ? row.expanded : undefined}
      aria-selected={selected}
      aria-label={label}
      aria-describedby={isFolder ? countId : undefined}
      tabIndex={tabbable ? 0 : -1}
      data-folder-tree-row={row.kind}
      onClick={onActivate}
      style={{ paddingLeft: 4 + row.depth * INDENT_PX }}
      className={cn([
        "flex min-w-0 cursor-default items-center gap-1.5 rounded-lg py-1.5 pr-2 text-sm transition-colors select-none",
        "focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-hidden",
        selected
          ? "bg-accent text-foreground font-medium"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        !isFolder && "text-[12.5px]",
      ])}
    >
      {isFolder ? (
        <span
          role="presentation"
          data-folder-tree-toggle
          onClick={(event) => {
            event.stopPropagation();
            if (row.expandable) onToggle();
          }}
          className={cn([
            "flex size-4 shrink-0 items-center justify-center rounded",
            row.expandable
              ? "text-muted-foreground hover:text-foreground"
              : "invisible",
          ])}
        >
          <CaretRight
            size={12}
            className={cn([
              "transition-transform",
              row.expanded && "rotate-90",
            ])}
          />
        </span>
      ) : (
        <span aria-hidden className="size-4 shrink-0" />
      )}
      {children(countId)}
    </li>
  );
}

function RowContent({
  row,
  iconFor,
  countId,
}: {
  row: FolderTreeRow;
  iconFor: (path: string) => TemplateIcon;
  countId: string;
}) {
  const { i18n } = useLingui();

  switch (row.kind) {
    case "folder":
      return (
        <>
          <TemplateIconGlyph
            icon={iconFor(row.path)}
            className="size-4 shrink-0 text-sm"
          />
          <span className="min-w-0 flex-1 truncate">{row.name}</span>
          <span className="text-muted-foreground shrink-0 text-[11.5px] font-normal tabular-nums">
            <span aria-hidden>{row.noteCount}</span>
            <span id={countId} className="sr-only">
              <Plural
                value={row.noteCount}
                one="# meeting"
                other="# meetings"
              />
            </span>
          </span>
        </>
      );
    case "note":
      return (
        <>
          <span className="min-w-0 flex-1 truncate">
            {row.note.title.trim() || <Trans>Untitled</Trans>}
          </span>
          <span className="text-muted-foreground shrink-0 text-[11.5px]">
            {formatShortDate(row.note.createdAt, i18n.locale)}
          </span>
        </>
      );
    case "more":
      return (
        <span className="text-muted-foreground min-w-0 flex-1 truncate">
          <Plural value={row.hiddenCount} one="… # other" other="… # others" />
        </span>
      );
  }
}
