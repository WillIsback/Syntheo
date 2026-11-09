import { get as getEmojiByShortcode } from "node-emoji";
import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import { Fragment, type MarkType, type NodeType } from "prosemirror-model";
import { TextSelection, type EditorState } from "prosemirror-state";
import { findWrapping } from "prosemirror-transform";

import { createTaskItemAttrs } from "../tasks";
import { schema } from "./schema";

function headingRule(nodeType: NodeType, maxLevel: number) {
  return textblockTypeInputRule(
    new RegExp(`^(#{1,${maxLevel}})\\s$`),
    nodeType,
    (match) => ({ level: match[1].length }),
  );
}

function blockquoteRule(nodeType: NodeType) {
  return wrappingInputRule(/^\s*>\s$/, nodeType);
}

function bulletListRule(nodeType: NodeType) {
  return wrappingInputRule(/^\s*([-+*])\s$/, nodeType);
}

function orderedListRule(nodeType: NodeType) {
  return wrappingInputRule(
    /^\s*(\d+)\.\s$/,
    nodeType,
    (match) => ({ start: +match[1] }),
    (match, node) => node.childCount + node.attrs.start === +match[1],
  );
}

function codeBlockRule(nodeType: NodeType) {
  return textblockTypeInputRule(/^```$/, nodeType);
}

function horizontalRuleRule() {
  return new InputRule(
    /^(?:---|___|\*\*\*)\s$/,
    (state, _match, start, end) => {
      const hr = schema.nodes.horizontalRule.create();
      return state.tr.replaceWith(start - 1, end, [
        hr,
        schema.nodes.paragraph.create(),
      ]);
    },
  );
}

function markInputRule(pattern: RegExp, markType: MarkType, delimLen: number) {
  return new InputRule(pattern, (state, match, start, end) => {
    if (isInCodeInputContext(state)) return null;
    const prefix = match[1];
    const content = match[2];
    const { tr } = state;

    const openStart = start + prefix.length;
    // The typed character that triggered this rule is the last char of
    // the closing delimiter and is NOT in the document yet.  Only the
    // remaining delimLen-1 chars need to be removed.
    const closeCharsInDoc = delimLen - 1;

    const $start = state.doc.resolve(openStart);
    if (!$start.parent.type.allowsMarkType(markType)) return null;

    if (closeCharsInDoc > 0) {
      tr.delete(end - closeCharsInDoc, end);
    }
    tr.delete(openStart, openStart + delimLen);
    tr.addMark(openStart, openStart + content.length, markType.create());
    tr.removeStoredMark(markType);

    return tr;
  });
}

function isInCodeInputContext(state: EditorState) {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.spec.code) {
      return true;
    }
  }

  return Boolean(schema.marks.code.isInSet(state.storedMarks ?? $from.marks()));
}

function textReplacementRule(pattern: RegExp, replacement: string) {
  return new InputRule(pattern, (state, _match, start, end) => {
    if (isInCodeInputContext(state)) {
      return null;
    }

    return state.tr.insertText(replacement, start, end);
  });
}

// Char-style typographic replacements. Patterns capture an optional prefix
// (kept) and the token (replaced); a third group is a kept suffix.
const SYMBOL_REPLACEMENTS: Record<string, string> = {
  "->": "→",
  "<-": "←",
  "<->": "↔",
  "==>": "⇒",
  "<==": "⇐",
  "<=>": "⇔",
  "+-": "±",
  "+/-": "±",
  "=/=": "≠",
};

const ABBREVIATION_REPLACEMENTS: Record<string, string> = {
  "(c)": "©",
  "(r)": "®",
  "(tm)": "™",
};

const FRACTION_REPLACEMENTS: Record<string, string> = {
  "c/o": "℅",
  "1/2": "½",
  "1/3": "⅓",
  "1/4": "¼",
  "1/5": "⅕",
  "1/6": "⅙",
  "1/8": "⅛",
  "2/3": "⅔",
  "2/5": "⅖",
  "3/4": "¾",
  "3/5": "⅗",
  "3/8": "⅜",
  "4/5": "⅘",
  "5/6": "⅚",
  "5/8": "⅝",
  "7/8": "⅞",
};

function mappedReplacementRule(pattern: RegExp, map: Record<string, string>) {
  return new InputRule(pattern, (state, match, start, end) => {
    if (isInCodeInputContext(state)) return null;
    const prefix = match[1] ?? "";
    const replacement = map[(match[2] ?? "").toLowerCase()];
    if (!replacement) return null;
    const suffix = match[3] ?? "";
    return state.tr.insertText(
      replacement + suffix,
      start + prefix.length,
      end,
    );
  });
}

function symbolReplacementRule() {
  return new InputRule(
    /(?:<->|==>|<==|<=>|->|<-|\+\/-|\+-|=\/=)$/,
    (state, match, start, end) => {
      if (isInCodeInputContext(state)) return null;
      const replacement = SYMBOL_REPLACEMENTS[match[0].toLowerCase()];
      if (!replacement) return null;
      return state.tr.insertText(replacement, start, end);
    },
  );
}

// The preceding character must not be a dash, so a line-start `---` survives
// long enough for horizontalRuleRule to claim it on the following space.
function dashReplacementRule() {
  return new InputRule(/([^-])--$/, (state, match, start, end) => {
    if (isInCodeInputContext(state)) return null;
    const prefix = match[1] ?? "";
    return state.tr.insertText("—", start + prefix.length, end);
  });
}

// Same semantics as prosemirror-inputrules smartQuotes/ellipsis, but guarded
// so quotes inside code stay straight.
function quoteRule(pattern: RegExp, replacement: string) {
  return new InputRule(pattern, (state, match, start, end) => {
    if (isInCodeInputContext(state)) return null;
    let insertStart = start;
    if (match.length > 1 && typeof match[1] === "string") {
      insertStart = start + match[0].lastIndexOf(match[1]);
    }
    return state.tr.insertText(replacement, insertStart, end);
  });
}

// `[]`, `[ ]`, `[x]`, or `[X]` followed by a space wraps the paragraph in
// taskList > taskItem wherever the surrounding node allows a taskList. Inside
// a bulletList/orderedList > listItem, the marker converts that listItem into
// a taskItem, splitting the list around it and merging with adjacent
// taskLists when possible. Ported from char's editor taskListRule.
function taskListRule() {
  return new InputRule(/^\s*\[([ xX]?)\]\s$/, (state, match, start, end) => {
    const $start = state.doc.resolve(start);
    const { taskList, taskItem, paragraph, bulletList, orderedList, listItem } =
      schema.nodes;
    if ($start.parent.type !== paragraph) return null;
    const checked = match[1] === "x" || match[1] === "X";
    const taskAttrs = createTaskItemAttrs(checked);

    const listDepth = $start.depth - 2;
    const itemDepth = $start.depth - 1;
    const listNode = listDepth >= 0 ? $start.node(listDepth) : null;
    const itemNode = itemDepth >= 0 ? $start.node(itemDepth) : null;

    // Inside a list item, only when the marker is at the very start
    // (first paragraph of the listItem).
    if (
      itemNode?.type === listItem &&
      listNode &&
      (listNode.type === bulletList || listNode.type === orderedList) &&
      $start.index(itemDepth) === 0
    ) {
      const firstParagraph = itemNode.firstChild;
      if (!firstParagraph || firstParagraph.type !== paragraph) return null;

      // Build the taskItem from the listItem's content, stripping the marker.
      // The handler runs against the doc *before* the typed char is inserted,
      // so the in-doc prefix length is `end - start`.
      const newFirstParagraph = paragraph.create(
        firstParagraph.attrs,
        firstParagraph.content.cut(end - start),
        firstParagraph.marks,
      );
      const taskItemChildren = [newFirstParagraph];
      for (let i = 1; i < itemNode.childCount; i++) {
        taskItemChildren.push(itemNode.child(i));
      }
      const newTaskItem = taskItem.create(
        taskAttrs,
        Fragment.from(taskItemChildren),
      );

      // Partition the list's items around the converted item.
      const itemIndex = $start.index(listDepth);
      const itemsBefore = [];
      const itemsAfter = [];
      for (let i = 0; i < listNode.childCount; i++) {
        if (i < itemIndex) itemsBefore.push(listNode.child(i));
        else if (i > itemIndex) itemsAfter.push(listNode.child(i));
      }

      // If the new taskList would be flush against an existing taskList
      // sibling (no leftover list items on that side), merge into it.
      const listStart = $start.before(listDepth);
      const listEnd = $start.after(listDepth);
      const grandParent = $start.node(listDepth - 1);
      const listIndex = $start.index(listDepth - 1);
      const prevSibling =
        listIndex > 0 ? grandParent.child(listIndex - 1) : null;
      const nextSibling =
        listIndex < grandParent.childCount - 1
          ? grandParent.child(listIndex + 1)
          : null;
      const mergePrev =
        itemsBefore.length === 0 && prevSibling?.type === taskList;
      const mergeNext =
        itemsAfter.length === 0 && nextSibling?.type === taskList;

      // Replace [list (+ adjacent taskList siblings to merge)] with
      // [list_before?, taskList, list_after?].
      let replaceFrom = listStart;
      let replaceTo = listEnd;
      const newNodes = [];

      if (itemsBefore.length > 0) {
        newNodes.push(
          listNode.type.create(listNode.attrs, Fragment.from(itemsBefore)),
        );
      }

      const taskListChildren = [];
      let prevSiblingChildSize = 0;
      if (mergePrev && prevSibling) {
        replaceFrom = listStart - prevSibling.nodeSize;
        for (let i = 0; i < prevSibling.childCount; i++) {
          taskListChildren.push(prevSibling.child(i));
          prevSiblingChildSize += prevSibling.child(i).nodeSize;
        }
      }
      taskListChildren.push(newTaskItem);
      if (mergeNext && nextSibling) {
        replaceTo = listEnd + nextSibling.nodeSize;
        for (let i = 0; i < nextSibling.childCount; i++) {
          taskListChildren.push(nextSibling.child(i));
        }
      }
      newNodes.push(taskList.create(null, Fragment.from(taskListChildren)));

      if (itemsAfter.length > 0) {
        // A trailing ordered list must continue numbering after the
        // converted item, not restart at the original `start`.
        const afterAttrs =
          listNode.type === orderedList
            ? {
                ...listNode.attrs,
                start: listNode.attrs.start + itemIndex + 1,
              }
            : listNode.attrs;
        newNodes.push(
          listNode.type.create(afterAttrs, Fragment.from(itemsAfter)),
        );
      }

      const tr = state.tr.replaceWith(replaceFrom, replaceTo, newNodes);

      // Place the cursor at the start of the new taskItem's paragraph: skip
      // the leading list (if any), enter taskList, skip any merged-in prior
      // taskItems, then enter taskItem and paragraph.
      let cursor = replaceFrom;
      if (itemsBefore.length > 0) cursor += newNodes[0].nodeSize;
      cursor += 1 + prevSiblingChildSize + 1 + 1;
      tr.setSelection(TextSelection.create(tr.doc, cursor));
      return tr;
    }

    // List-item paragraphs are only handled by the branch above; a marker in
    // a non-leading paragraph of an item should stay literal, not nest a list.
    const parentType = itemNode?.type ?? null;
    if (parentType === listItem || parentType === taskItem) return null;

    // Anywhere else — wrap the paragraph in taskList > taskItem when the
    // surrounding node allows it (findWrapping rejects e.g. list items).
    const tr = state.tr.delete(start, end);
    const range = tr.doc.resolve(start).blockRange();
    if (!range) return null;
    const wrapping = findWrapping(range, taskList);
    if (!wrapping) return null;
    tr.wrap(
      range,
      wrapping.map((wrapper) =>
        wrapper.type === taskItem
          ? { type: wrapper.type, attrs: taskAttrs }
          : wrapper,
      ),
    );
    return tr;
  });
}

function underlineRule() {
  return new InputRule(/<u>([^<]+)<\/u>$/i, (state, match, start, end) => {
    if (isInCodeInputContext(state)) return null;
    const content = match[1];
    if (!content) return null;
    const contentStart = start + "<u>".length;
    const contentEnd = contentStart + content.length;
    const markType = schema.marks.underline;
    if (!state.doc.resolve(contentStart).parent.type.allowsMarkType(markType)) {
      return null;
    }
    const tr = state.tr;
    if (end > contentEnd) tr.delete(contentEnd, end);
    tr.addMark(contentStart, contentEnd, markType.create());
    tr.delete(start, contentStart);
    tr.removeStoredMark(markType);
    return tr;
  });
}

function emojiReplacementRule() {
  return new InputRule(
    /(^|[\s([{])(:[\w+-]+:)$/,
    (state, match, start, end) => {
      if (isInCodeInputContext(state)) return null;
      const prefix = match[1] ?? "";
      const emoji = match[2] ? getEmojiByShortcode(match[2]) : undefined;
      if (!emoji) return null;
      return state.tr.insertText(emoji, start + prefix.length, end);
    },
  );
}

export function buildInputRules() {
  return inputRules({
    rules: [
      headingRule(schema.nodes.heading, 6),
      blockquoteRule(schema.nodes.blockquote),
      bulletListRule(schema.nodes.bulletList),
      orderedListRule(schema.nodes.orderedList),
      codeBlockRule(schema.nodes.codeBlock),
      horizontalRuleRule(),
      taskListRule(),
      symbolReplacementRule(),
      dashReplacementRule(),
      mappedReplacementRule(
        /(^|[\s([{])(\((?:c|r|tm)\))$/i,
        ABBREVIATION_REPLACEMENTS,
      ),
      mappedReplacementRule(
        /(^|[\s([{])((?:c\/o|1\/2|1\/3|1\/4|1\/5|1\/6|1\/8|2\/3|2\/5|3\/4|3\/5|3\/8|4\/5|5\/6|5\/8|7\/8))([\s.,;:!?])$/i,
        FRACTION_REPLACEMENTS,
      ),
      emojiReplacementRule(),
      quoteRule(/(?:^|[\s{[(<'"‘“])(")$/, "“"),
      quoteRule(/"$/, "”"),
      quoteRule(/(?:^|[\s{[(<'"‘“])(')$/, "‘"),
      quoteRule(/'$/, "’"),
      textReplacementRule(/\.\.\.$/, "…"),
      markInputRule(/(^|[^*])\*\*([^*]+)\*\*$/, schema.marks.bold, 2),
      markInputRule(/(^|[^_])__([^_]+)__$/, schema.marks.bold, 2),
      markInputRule(/(^|[^~])~~([^~]+)~~$/, schema.marks.strike, 2),
      markInputRule(/(^|[^=])==([^=]+)==$/, schema.marks.highlight, 2),
      markInputRule(/(^|[^*])\*([^*]+)\*$/, schema.marks.italic, 1),
      markInputRule(/(^|[^_])_([^_]+)_$/, schema.marks.italic, 1),
      markInputRule(/(^|[^~])~([^~]+)~$/, schema.marks.strike, 1),
      markInputRule(/(^|[^`])`([^`]+)`$/, schema.marks.code, 1),
      underlineRule(),
    ],
  });
}
