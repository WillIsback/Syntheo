import { Fragment, type NodeType, type ResolvedPos } from "prosemirror-model";
import { liftListItem } from "prosemirror-schema-list";
import {
  TextSelection,
  type Command,
  type EditorState,
  type Transaction,
} from "prosemirror-state";

import { schema } from "./schema";

export function isInListItem(state: EditorState): string | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name;
    if (name === "listItem" || name === "taskItem") return name;
  }
  return null;
}

export function moveListItem(direction: "up" | "down"): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;

    let depth = -1;
    for (let d = $from.depth; d > 0; d--) {
      const name = $from.node(d).type.name;
      if (name === "listItem" || name === "taskItem") {
        depth = d;
        break;
      }
    }
    if (depth === -1) return false;

    const parent = $from.node(depth - 1);
    const index = $from.index(depth - 1);
    const atBoundary =
      direction === "up" ? index === 0 : index >= parent.childCount - 1;

    if (!atBoundary) {
      // Swap with adjacent sibling
      const siblingIndex = direction === "up" ? index - 1 : index + 1;
      const currentItem = parent.child(index);
      const siblingItem = parent.child(siblingIndex);

      if (dispatch) {
        const tr = state.tr;
        const currentStart = $from.before(depth);
        const currentEnd = $from.after(depth);

        if (direction === "up") {
          const prevStart = currentStart - siblingItem.nodeSize;
          tr.replaceWith(
            prevStart,
            currentEnd,
            Fragment.from([currentItem, siblingItem]),
          );
          const offset = prevStart - currentStart;
          tr.setSelection(
            TextSelection.create(
              tr.doc,
              state.selection.anchor + offset,
              state.selection.head + offset,
            ),
          );
        } else {
          const nextEnd = currentEnd + siblingItem.nodeSize;
          tr.replaceWith(
            currentStart,
            nextEnd,
            Fragment.from([siblingItem, currentItem]),
          );
          const offset = siblingItem.nodeSize;
          tr.setSelection(
            TextSelection.create(
              tr.doc,
              state.selection.anchor + offset,
              state.selection.head + offset,
            ),
          );
        }

        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    // At boundary: lift item into the outer (parent) list
    let outerDepth = -1;
    for (let d = depth - 2; d > 0; d--) {
      const name = $from.node(d).type.name;
      if (name === "listItem" || name === "taskItem") {
        outerDepth = d;
        break;
      }
    }
    if (outerDepth === -1) return false;

    // Only lift when the item type is compatible with the outer list
    const outerListName = $from.node(outerDepth - 1).type.name;
    const currentItemName = $from.node(depth).type.name;
    const compatible =
      (currentItemName === "listItem" &&
        (outerListName === "bulletList" || outerListName === "orderedList")) ||
      (currentItemName === "taskItem" && outerListName === "taskList");
    if (!compatible) return false;

    if (dispatch) {
      const tr = state.tr;
      const currentItem = parent.child(index);
      const currentStart = $from.before(depth);
      const currentEnd = $from.after(depth);
      const anchorOffset = state.selection.anchor - currentStart;

      // Delete the item, or the entire nested list when it's the only child
      if (parent.childCount === 1) {
        tr.delete($from.before(depth - 1), $from.after(depth - 1));
      } else {
        tr.delete(currentStart, currentEnd);
      }

      // Insert into the outer list: before the outer item (up) or after (down)
      const targetPos =
        direction === "up" ? $from.before(outerDepth) : $from.after(outerDepth);
      const insertPos = tr.mapping.map(targetPos);
      tr.insert(insertPos, currentItem);

      tr.setSelection(TextSelection.create(tr.doc, insertPos + anchorOffset));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

export function joinTaskItemBackward(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
) {
  const { selection } = state;
  const { $from } = selection;

  if (!selection.empty || $from.parentOffset !== 0) {
    return false;
  }

  let itemDepth = -1;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type === schema.nodes.taskItem) {
      itemDepth = depth;
      break;
    }
  }

  if (itemDepth === -1 || $from.parent.type !== schema.nodes.paragraph) {
    return false;
  }

  const list = $from.node(itemDepth - 1);
  if (list.type !== schema.nodes.taskList) {
    return false;
  }

  if ($from.index(itemDepth) !== 0) {
    return false;
  }

  const itemIndex = $from.index(itemDepth - 1);
  const currentItem = list.child(itemIndex);
  if (itemIndex === 0) {
    // Lift instead of falling through to joinBackward, which would merge the
    // item's text into the preceding block and silently destroy the task
    if (!currentItem.firstChild?.content.size) return false;
    return liftListItem(schema.nodes.taskItem)(state, dispatch);
  }

  const previousItem = list.child(itemIndex - 1);
  const previousParagraphIndex = previousItem.childCount - 1;
  const previousParagraph = previousItem.child(previousParagraphIndex);
  const currentParagraph = currentItem.firstChild;

  if (
    previousParagraph.type !== schema.nodes.paragraph ||
    currentParagraph?.type !== schema.nodes.paragraph
  ) {
    return false;
  }

  if (!dispatch) {
    return true;
  }

  const mergedParagraph = previousParagraph.type.create(
    previousParagraph.attrs,
    previousParagraph.content.append(currentParagraph.content),
    previousParagraph.marks,
  );

  const mergedPreviousContent = [
    ...Array.from({ length: previousParagraphIndex }, (_, index) =>
      previousItem.child(index),
    ),
    mergedParagraph,
    ...Array.from({ length: currentItem.childCount - 1 }, (_, index) =>
      currentItem.child(index + 1),
    ),
  ];
  const mergedPreviousItem = previousItem.type.create(
    previousItem.attrs,
    Fragment.from(mergedPreviousContent),
    previousItem.marks,
  );

  const currentStart = $from.before(itemDepth);
  const currentEnd = $from.after(itemDepth);
  const previousStart = currentStart - previousItem.nodeSize;
  let paragraphOffset = 0;
  for (let index = 0; index < previousParagraphIndex; index++) {
    paragraphOffset += previousItem.child(index).nodeSize;
  }
  const selectionPos =
    previousStart + 1 + paragraphOffset + 1 + previousParagraph.content.size;

  const tr = state.tr.replaceWith(
    previousStart,
    currentEnd,
    mergedPreviousItem,
  );
  tr.setSelection(TextSelection.create(tr.doc, selectionPos));
  dispatch(tr.scrollIntoView());
  return true;
}

// ---------------------------------------------------------------------------
// Input rules
// ---------------------------------------------------------------------------
function findItemDepth($from: ResolvedPos, itemType: NodeType): number | null {
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type === itemType) return depth;
  }
  return null;
}

function atStartOfItem($from: ResolvedPos, itemDepth: number): boolean {
  if ($from.parentOffset !== 0) return false;
  for (let depth = $from.depth; depth > itemDepth; depth--) {
    if ($from.index(depth - 1) !== 0) return false;
  }
  return true;
}

// Enter at the very start of the first list item inserts an empty paragraph
// before the list, giving the writer a way to open a row above it.
export function insertParagraphBeforeFirstListItem(
  itemType: NodeType,
): Command {
  return (state, dispatch) => {
    if (!state.selection.empty) return false;

    const paragraphType = schema.nodes.paragraph;
    const { $from } = state.selection;
    const itemDepth = findItemDepth($from, itemType);
    if (itemDepth === null) return false;
    if (!atStartOfItem($from, itemDepth)) return false;
    if (
      $from.parent.type !== paragraphType ||
      $from.parent.content.size === 0
    ) {
      return false;
    }

    const listDepth = itemDepth - 1;
    const listParentDepth = listDepth - 1;
    if (listParentDepth < 0) return false;
    if ($from.index(listDepth) !== 0) return false;

    // Inside a nested list the paragraph would land inside the parent item;
    // fall through to splitListItem so Enter makes an empty sibling instead.
    const listParentName = $from.node(listParentDepth).type.name;
    if (listParentName === "listItem" || listParentName === "taskItem") {
      return false;
    }

    const listIndex = $from.index(listParentDepth);
    if (
      !$from
        .node(listParentDepth)
        .canReplaceWith(listIndex, listIndex, paragraphType)
    ) {
      return false;
    }

    const paragraph = paragraphType.createAndFill();
    if (!paragraph) return false;

    if (dispatch) {
      const insertPos = $from.before(listDepth);
      const tr = state.tr.insert(insertPos, paragraph);
      tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// ---------------------------------------------------------------------------
// Keymaps
// ---------------------------------------------------------------------------
