import { type NodeSpec, Schema } from "prosemirror-model";

import { DEFAULT_EDITOR_WIDTH } from "../image-markdown";
import { baseMarks, baseNodes } from "../schema/base";

// ---------------------------------------------------------------------------

const nodes: Record<string, NodeSpec> = {
  ...baseNodes,

  codeBlock: {
    ...baseNodes.codeBlock,
    attrs: { language: { default: "" } },
  },

  taskList: {
    content: "taskItem+",
    group: "block",
    parseDOM: [{ tag: 'ul[data-type="taskList"]' }],
    toDOM() {
      return ["ul", { "data-type": "taskList" }, 0];
    },
  },

  taskItem: {
    content: "paragraph block*",
    defining: true,
    attrs: { checked: { default: false } },
    parseDOM: [
      {
        tag: 'li[data-type="taskItem"]',
        getAttrs(dom) {
          return {
            checked:
              (dom as HTMLElement).getAttribute("data-checked") === "true",
          };
        },
      },
    ],
    toDOM(node) {
      return [
        "li",
        {
          "data-type": "taskItem",
          "data-checked": node.attrs.checked ? "true" : "false",
        },
        0,
      ];
    },
  },

  image: {
    inline: true,
    group: "inline",
    attrs: {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      attachmentId: { default: null },
      editorWidth: { default: DEFAULT_EDITOR_WIDTH },
    },
    parseDOM: [
      {
        tag: "img[src]",
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return {
            src: el.getAttribute("src"),
            alt: el.getAttribute("alt"),
            title: el.getAttribute("title"),
          };
        },
      },
    ],
    toDOM(node) {
      return [
        "img",
        { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title },
      ];
    },
  },

  clip: {
    group: "block",
    atom: true,
    attrs: { src: { default: null } },
    parseDOM: [
      {
        tag: 'div[data-type="clip"]',
        getAttrs(dom) {
          return { src: (dom as HTMLElement).getAttribute("data-src") };
        },
      },
    ],
    toDOM(node) {
      return ["div", { "data-type": "clip", "data-src": node.attrs.src }];
    },
  },

  fileAttachment: {
    group: "block",
    atom: true,
    attrs: {
      attachmentId: { default: null },
      name: { default: "" },
      mimeType: { default: "" },
      src: { default: null },
      path: { default: null },
      size: { default: null },
    },
    parseDOM: [
      {
        tag: 'div[data-type="file-attachment"]',
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return {
            attachmentId: el.getAttribute("data-attachment-id"),
            name: el.getAttribute("data-name"),
            mimeType: el.getAttribute("data-mime-type"),
            src: el.getAttribute("data-src"),
            size: el.getAttribute("data-size")
              ? Number(el.getAttribute("data-size"))
              : null,
          };
        },
      },
    ],
    toDOM(node) {
      const attrs: Record<string, string> = {
        "data-type": "file-attachment",
      };
      if (node.attrs.attachmentId) {
        attrs["data-attachment-id"] = node.attrs.attachmentId;
      }
      if (node.attrs.name) attrs["data-name"] = node.attrs.name;
      if (node.attrs.mimeType) attrs["data-mime-type"] = node.attrs.mimeType;
      if (node.attrs.src) attrs["data-src"] = node.attrs.src;
      if (node.attrs.size != null) attrs["data-size"] = String(node.attrs.size);
      return ["div", attrs];
    },
  },

  "mention-@": {
    group: "inline",
    inline: true,
    atom: true,
    attrs: {
      id: { default: null },
      type: { default: null },
      label: { default: null },
    },
    parseDOM: [
      {
        tag: "mention",
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return {
            id: el.getAttribute("data-id"),
            type: el.getAttribute("data-type"),
            label: el.getAttribute("data-label"),
          };
        },
      },
    ],
    toDOM(node) {
      return [
        "mention",
        {
          "data-id": node.attrs.id,
          "data-type": node.attrs.type,
          "data-label": node.attrs.label,
        },
      ];
    },
  },
};

export const markdownSchema = new Schema({ nodes, marks: baseMarks });

// ---------------------------------------------------------------------------
// markdown-it plugins
