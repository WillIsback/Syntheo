import { type MarkSpec, type NodeSpec, Schema } from "prosemirror-model";

import {
  appLinkNodeSpec,
  imageNodeSpec,
  mentionNodeSpec,
  sessionNodeSpec,
  taskItemNodeSpec,
  taskListNodeSpec,
  fileAttachmentNodeSpec,
} from "../node-views";
import { clipNodeSpec } from "../plugins";
import { baseMarks, baseNodes } from "../schema/base";

// Node names keep legacy JSON content compatibility.
const nodes: Record<string, NodeSpec> = {
  ...baseNodes,

  bulletList: {
    ...baseNodes.bulletList,
    parseDOM: [{ tag: "ul:not([data-type])" }],
  },

  orderedList: {
    ...baseNodes.orderedList,
    toDOM(node) {
      // Markers are drawn from a CSS counter, which cannot read `start`; seed
      // it inline so a non-1 start is visible and not just serialized.
      return node.attrs.start === 1
        ? ["ol", 0]
        : [
            "ol",
            {
              start: node.attrs.start,
              style: `counter-reset: ol-counter ${node.attrs.start - 1}`,
            },
            0,
          ];
    },
  },

  listItem: {
    ...baseNodes.listItem,
    parseDOM: [{ tag: "li:not([data-type])" }],
  },

  taskList: taskListNodeSpec,
  taskItem: taskItemNodeSpec,
  image: imageNodeSpec,
  fileAttachment: fileAttachmentNodeSpec,
  appLink: appLinkNodeSpec,
  "mention-@": mentionNodeSpec,
  session: sessionNodeSpec,
  clip: clipNodeSpec,
};

const marks: Record<string, MarkSpec> = {
  ...baseMarks,

  bold: {
    parseDOM: [
      { tag: "strong" },
      {
        tag: "b",
        getAttrs: (node) =>
          (node as HTMLElement).style.fontWeight !== "normal" && null,
      },
      {
        style: "font-weight=400",
        clearMark: (m) => m.type.name === "bold",
      },
      {
        style: "font-weight",
        getAttrs: (value) =>
          /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null,
      },
    ],
    toDOM() {
      return ["strong", 0];
    },
  },

  italic: {
    parseDOM: [
      { tag: "em" },
      {
        tag: "i",
        getAttrs: (node) =>
          (node as HTMLElement).style.fontStyle !== "normal" && null,
      },
      { style: "font-style=italic" },
    ],
    toDOM() {
      return ["em", 0];
    },
  },

  underline: {
    parseDOM: [
      { tag: "u" },
      {
        style: "text-decoration",
        getAttrs: (value) => (value as string).includes("underline") && null,
      },
    ],
    toDOM() {
      return ["u", 0];
    },
  },

  strike: {
    parseDOM: [
      { tag: "s" },
      { tag: "del" },
      {
        style: "text-decoration",
        getAttrs: (value) => (value as string).includes("line-through") && null,
      },
    ],
    toDOM() {
      return ["s", 0];
    },
  },

  link: {
    attrs: {
      href: {},
      target: { default: null },
    },
    inclusive: false,
    parseDOM: [
      {
        tag: "a[href]",
        getAttrs(dom) {
          const href = (dom as HTMLElement).getAttribute("href");
          if (href && href.startsWith("asset://")) {
            return false;
          }
          return {
            href,
            target: (dom as HTMLElement).getAttribute("target"),
          };
        },
      },
    ],
    toDOM(node) {
      return [
        "a",
        {
          href: node.attrs.href,
          target: node.attrs.target,
          rel: "noopener noreferrer nofollow",
        },
        0,
      ];
    },
  },
};

export const schema = new Schema({ nodes, marks });
