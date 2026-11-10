import MarkdownIt from "markdown-it";
import { MarkdownParser } from "prosemirror-markdown";

import {
  DEFAULT_EDITOR_WIDTH,
  parseImageTitleMetadata,
} from "../image-markdown";
import {
  clipPlugin,
  emptyParagraphsPlugin,
  fileAttachmentPlugin,
  mentionPlugin,
  tableCellParagraphsPlugin,
  taskListPlugin,
} from "./parser-block-plugins";
import {
  hardBreakTagPlugin,
  highlightPlugin,
  strikethroughPlugin,
  underlinePlugin,
} from "./parser-inline-plugins";
import { markdownSchema } from "./schema";

let _parser: MarkdownParser | null = null;

export function getParser(): MarkdownParser {
  if (_parser) return _parser;

  const md = MarkdownIt("commonmark", { html: false });

  md.use(strikethroughPlugin);
  md.use(underlinePlugin);
  md.use(highlightPlugin);
  md.use(hardBreakTagPlugin);
  md.enable("table");
  md.use(tableCellParagraphsPlugin);
  md.use(taskListPlugin);
  md.use(clipPlugin);
  md.use(fileAttachmentPlugin);
  md.use(mentionPlugin);
  md.use(emptyParagraphsPlugin);

  // prosemirror-markdown 1.13 type encore contre @types/markdown-it 14, alors
  // que markdown-it 15 fournit ses propres types. Le runtime est compatible ;
  // on contourne uniquement la frontière de types.
  _parser = new MarkdownParser(
    markdownSchema,
    md as unknown as ConstructorParameters<typeof MarkdownParser>[1],
    {
      blockquote: { block: "blockquote" },
      paragraph: { block: "paragraph" },
      list_item: { block: "listItem" },
      bullet_list: { block: "bulletList" },
      ordered_list: {
        block: "orderedList",
        getAttrs: (tok) => ({ start: +tok.attrGet("start")! || 1 }),
      },
      heading: {
        block: "heading",
        getAttrs: (tok) => ({ level: +tok.tag.slice(1) }),
      },
      code_block: { block: "codeBlock", noCloseToken: true },
      fence: {
        block: "codeBlock",
        getAttrs: (tok) => ({ language: tok.info || "" }),
        noCloseToken: true,
      },
      hr: { node: "horizontalRule" },
      image: {
        node: "image",
        getAttrs: (tok) => {
          const rawTitle = tok.attrGet("title") || undefined;
          const metadata = parseImageTitleMetadata(rawTitle);
          return {
            src: tok.attrGet("src"),
            alt: (tok.children?.[0] && tok.children[0].content) || "",
            title: metadata.title,
            attachmentId: null,
            editorWidth: metadata.editorWidth ?? DEFAULT_EDITOR_WIDTH,
          };
        },
      },
      hardbreak: { node: "hardBreak" },
      table: { block: "table" },
      thead: { ignore: true },
      tbody: { ignore: true },
      tr: { block: "tableRow" },
      th: { block: "tableHeader" },
      td: { block: "tableCell" },

      em: { mark: "italic" },
      strong: { mark: "bold" },
      s: { mark: "strike" },
      link: {
        mark: "link",
        getAttrs: (tok) => ({
          href: tok.attrGet("href"),
          target: tok.attrGet("target"),
        }),
      },
      code_inline: { mark: "code", noCloseToken: true },

      underline: { mark: "underline" },
      highlight: { mark: "highlight" },
      task_list: { block: "taskList" },
      task_item: {
        block: "taskItem",
        getAttrs: (tok) => ({
          checked: tok.attrGet("checked") === "true",
        }),
      },
      clip: {
        node: "clip",
        getAttrs: (tok) => ({ src: tok.attrGet("src") }),
      },
      file_attachment: {
        node: "fileAttachment",
        getAttrs: (tok) => ({
          attachmentId: tok.attrGet("attachment-id"),
          name: tok.attrGet("name") ?? "",
          mimeType: "",
          src: tok.attrGet("src"),
          path: null,
          size: null,
        }),
      },
      mention: {
        node: "mention-@",
        getAttrs: (tok) => ({
          id: tok.attrGet("data-id"),
          type: tok.attrGet("data-type"),
          label: tok.attrGet("data-label"),
        }),
      },
    },
  );

  return _parser;
}

// ---------------------------------------------------------------------------
// Serializer
