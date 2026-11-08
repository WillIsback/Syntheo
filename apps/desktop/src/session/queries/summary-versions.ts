// Versions remplacées d'une synthèse (issue 415). Elles vivent dans
// `session_summary_versions`, à part de `session_documents` : seule l'étape
// Synthèse du document vivant les lit, pour le menu des versions et leur
// lecture seule. Tout le reste de l'application ne voit que la version
// actuelle.

import { json2md } from "@syntheo/editor/markdown";

import { useLiveQuery } from "~/db";

export type SummaryGenerationMetadata = {
  generatedAt: string | null;
  sourceNoteFingerprint: string | null;
  // Issue 417 : passages validés venus des notes, rangés à part du corps
  // (aucune balise n'est enregistrée) ; null : aucune balise, repli.
  notePassages: string[] | null;
};

export type SummaryVersionRecord = {
  id: string;
  documentId: string;
  version: number;
  title: string;
  templateId: string;
  markdown: string;
  generatedAt: string | null;
  supersededAt: string;
};

type SummaryVersionSqlRow = {
  id: string;
  document_id: string;
  version: number;
  title: string;
  template_id: string;
  body_format: string;
  body: string;
  generated_at: string;
  superseded_at: string;
};

export const SUMMARY_VERSIONS_SQL = `
  SELECT
    id,
    document_id,
    version,
    title,
    template_id,
    body_format,
    body,
    generated_at,
    superseded_at
  FROM session_summary_versions
  WHERE document_id = ?
  ORDER BY version DESC
`;

const EMPTY_VERSIONS: SummaryVersionRecord[] = [];

function readText(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value ? value : null;
}

function readTextList(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string");
}

export function parseSummaryGenerationMetadata(
  json: string | null | undefined,
): SummaryGenerationMetadata {
  let parsed: unknown = null;
  try {
    parsed = json ? (JSON.parse(json) as unknown) : null;
  } catch {
    parsed = null;
  }
  const record =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return {
    generatedAt: readText(record, "generatedAt"),
    sourceNoteFingerprint: readText(record, "sourceNoteFingerprint"),
    notePassages: readTextList(record, "notePassages"),
  };
}

function bodyToMarkdown(body: string, format: string): string {
  if (!body || format === "markdown") {
    return body;
  }
  try {
    return json2md(JSON.parse(body));
  } catch (error) {
    console.error("[session] failed to read a summary version", error);
    return "";
  }
}

export function mapSummaryVersionRow(
  row: SummaryVersionSqlRow,
): SummaryVersionRecord {
  return {
    id: row.id,
    documentId: row.document_id,
    version: Number(row.version),
    title: row.title,
    templateId: row.template_id,
    markdown: bodyToMarkdown(row.body, row.body_format),
    generatedAt: row.generated_at || null,
    supersededAt: row.superseded_at,
  };
}

// Versions remplacées d'une synthèse, la plus récente en tête.
export function useSummaryVersions(
  enhancedNoteId: string | null,
): SummaryVersionRecord[] {
  const { data = EMPTY_VERSIONS } = useLiveQuery<
    SummaryVersionSqlRow,
    SummaryVersionRecord[]
  >({
    sql: SUMMARY_VERSIONS_SQL,
    params: [enhancedNoteId ?? ""],
    enabled: Boolean(enhancedNoteId),
    mapRows: (rows) => rows.map(mapSummaryVersionRow),
  });
  return enhancedNoteId ? data : EMPTY_VERSIONS;
}
