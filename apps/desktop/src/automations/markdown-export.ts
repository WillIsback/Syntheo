import type { MarkdownExportOptions } from "@syntheo/plugin-local-api";

export const DEFAULT_MARKDOWN_EXPORT_OPTIONS: MarkdownExportOptions = {
  include_memo: true,
  include_summary: true,
  include_transcript: true,
  include_action_items: true,
  filename: "",
  include_id_suffix: true,
};

export function parseMarkdownExportOptions(
  value: unknown,
): MarkdownExportOptions {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const boolean = (key: Exclude<keyof MarkdownExportOptions, "filename">) =>
    typeof record[key] === "boolean"
      ? record[key]
      : DEFAULT_MARKDOWN_EXPORT_OPTIONS[key];
  return {
    include_memo: boolean("include_memo"),
    include_summary: boolean("include_summary"),
    include_transcript: boolean("include_transcript"),
    include_action_items: boolean("include_action_items"),
    filename: typeof record.filename === "string" ? record.filename : "",
    include_id_suffix: boolean("include_id_suffix"),
  };
}

export function hasMarkdownExportContent(
  options: MarkdownExportOptions,
): boolean {
  // `#[serde(default)]` côté Rust : un champ absent vaut sa valeur par défaut.
  const included = (key: Exclude<keyof MarkdownExportOptions, "filename">) =>
    options[key] ?? DEFAULT_MARKDOWN_EXPORT_OPTIONS[key] ?? false;
  return (
    included("include_memo") ||
    included("include_summary") ||
    included("include_transcript") ||
    included("include_action_items")
  );
}
