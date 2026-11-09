import type {
  MarkdownIt as MarkdownItInstance,
  StateInline,
} from "markdown-it";

// ---------------------------------------------------------------------------

export function strikethroughPlugin(md: MarkdownItInstance) {
  md.inline.ruler.before(
    "emphasis",
    "strikethrough",
    (state: StateInline, silent: boolean) => {
      const start = state.pos;
      const marker = state.src.charCodeAt(start);
      if (marker !== 0x7e /* ~ */) return false;
      if (state.src.charCodeAt(start + 1) !== 0x7e) return false;

      const match = state.src.slice(start).match(/^~~([\s\S]+?)~~/);
      if (!match) return false;

      if (!silent) {
        const token = state.push("s_open", "s", 1);
        token.markup = "~~";

        const content = state.push("text", "", 0);
        content.content = match[1];

        const close = state.push("s_close", "s", -1);
        close.markup = "~~";
      }

      state.pos += match[0].length;
      return true;
    },
  );
}

export function underlinePlugin(md: MarkdownItInstance) {
  md.inline.ruler.before(
    "emphasis",
    "underline",
    (state: StateInline, silent: boolean) => {
      const start = state.pos;
      const src = state.src.slice(start);

      // ++text++ syntax
      if (
        state.src.charCodeAt(start) === 0x2b /* + */ &&
        state.src.charCodeAt(start + 1) === 0x2b
      ) {
        const match = src.match(/^\+\+([\s\S]+?)\+\+/);
        if (match) {
          if (!silent) {
            const open = state.push("underline_open", "u", 1);
            open.markup = "++";
            const text = state.push("text", "", 0);
            text.content = match[1];
            const close = state.push("underline_close", "u", -1);
            close.markup = "++";
          }
          state.pos += match[0].length;
          return true;
        }
      }

      // <u>text</u> syntax
      if (state.src.charCodeAt(start) === 0x3c /* < */) {
        const match = src.match(/^<u>([\s\S]+?)<\/u>/);
        if (match) {
          if (!silent) {
            const open = state.push("underline_open", "u", 1);
            open.markup = "<u>";
            const text = state.push("text", "", 0);
            text.content = match[1];
            const close = state.push("underline_close", "u", -1);
            close.markup = "</u>";
          }
          state.pos += match[0].length;
          return true;
        }
      }

      return false;
    },
  );
}

export function highlightPlugin(md: MarkdownItInstance) {
  md.inline.ruler.before(
    "emphasis",
    "highlight",
    (state: StateInline, silent: boolean) => {
      const start = state.pos;
      if (
        state.src.charCodeAt(start) !== 0x3d /* = */ ||
        state.src.charCodeAt(start + 1) !== 0x3d
      ) {
        return false;
      }

      const match = state.src.slice(start).match(/^==([\s\S]+?)==/);
      if (!match) return false;

      if (!silent) {
        const open = state.push("highlight_open", "mark", 1);
        open.markup = "==";
        const text = state.push("text", "", 0);
        text.content = match[1];
        const close = state.push("highlight_close", "mark", -1);
        close.markup = "==";
      }

      state.pos += match[0].length;
      return true;
    },
  );
}

export function hardBreakTagPlugin(md: MarkdownItInstance) {
  md.inline.ruler.before(
    "html_inline",
    "hardbreak_tag",
    (state: StateInline, silent: boolean) => {
      const match = state.src.slice(state.pos).match(/^<br\s*\/?>/i);
      if (!match) return false;

      if (!silent) {
        const token = state.push("hardbreak", "br", 0);
        token.markup = match[0];
      }

      state.pos += match[0].length;
      return true;
    },
  );
}
