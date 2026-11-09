// Rectangles et focus d'une sélection dans la transcription rendue.
import {
  parseStringArray,
  rangeIntersectsNode,
  type TranscriptWordSelection,
} from "./selection-dom";

export function isRangeCoveredBySelection(
  range: Range,
  selection: Selection | null,
) {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return false;
  }

  try {
    const native = selection.getRangeAt(0);
    return (
      native.compareBoundaryPoints(Range.START_TO_START, range) <= 0 &&
      native.compareBoundaryPoints(Range.END_TO_END, range) >= 0
    );
  } catch {
    return false;
  }
}

// Range.getClientRects() returns the box of every fully selected element plus
// the boxes of the text inside it, so word spans would be painted twice.
export function getTranscriptRangeRects(range: Range): DOMRect[] {
  const rects: DOMRect[] = [];
  const textRange = document.createRange();

  for (const node of getRangeTextNodes(range)) {
    textRange.selectNodeContents(node);
    if (node === range.startContainer) {
      textRange.setStart(node, range.startOffset);
    }
    if (node === range.endContainer) {
      textRange.setEnd(node, range.endOffset);
    }

    for (const rect of Array.from(textRange.getClientRects())) {
      if (rect.width > 0 && rect.height > 0) {
        appendLineRect(rects, rect);
      }
    }
  }

  return rects;
}

function getRangeTextNodes(range: Range): Node[] {
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) {
    return [root];
  }

  const nodes: Node[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (rangeIntersectsNode(range, node)) {
      nodes.push(node);
    }
  }
  return nodes;
}

function appendLineRect(rects: DOMRect[], rect: DOMRect) {
  const last = rects[rects.length - 1];
  const continuesLine =
    last !== undefined &&
    Math.abs(last.top - rect.top) < 1 &&
    Math.abs(last.height - rect.height) < 1 &&
    rect.left >= last.left &&
    rect.left <= last.right + 1;
  if (!continuesLine) {
    rects.push(rect);
    return;
  }

  rects[rects.length - 1] = new DOMRect(
    last.left,
    last.top,
    Math.max(last.right, rect.right) - last.left,
    last.height,
  );
}

export function focusTranscriptSelection(
  selection: TranscriptWordSelection,
  container: HTMLElement,
) {
  const group = selection.groups[0];
  if (!group) return;
  for (const editor of container.querySelectorAll<HTMLElement>(
    "[data-transcript-editor]",
  )) {
    if (
      editor.closest<HTMLElement>("[data-transcript-id]")?.dataset
        .transcriptId !== group.transcriptId
    )
      continue;
    const ids = parseStringArray(editor.dataset.transcriptEditWordIds);
    const start = ids.indexOf(group.wordIds[0]);
    if (start < 0) continue;
    const texts = parseStringArray(editor.dataset.transcriptEditWordTexts);
    const end = Math.max(
      start,
      ids.indexOf(group.wordIds[group.wordIds.length - 1]),
    );
    editor.focus({ preventScroll: true });
    const text = editor.firstChild;
    if (text?.nodeType === Node.TEXT_NODE) {
      const range = document.createRange();
      const startOffset =
        texts.slice(0, start).join(" ").length + (start > 0 ? 1 : 0);
      const endOffset = texts.slice(0, end + 1).join(" ").length;
      range.setStart(
        text,
        Math.min(startOffset, text.textContent?.length ?? 0),
      );
      range.setEnd(text, Math.min(endOffset, text.textContent?.length ?? 0));
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
    return editor;
  }
}
