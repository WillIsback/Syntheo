// Réunions d'un dossier projet (issue 496) : les notes du dossier et de ses
// sous-dossiers, plus récentes d'abord, avec leur synthèse quand elle existe.
// La synthèse sert deux fois : son premier paragraphe donne le résumé d'une
// ligne de la chronologie, et son texte nourrit le fil rouge. Rien n'est
// généré ici.

import {
  type JSONContent,
  json2md,
  md2json,
  parseJsonContent,
} from "@syntheo/editor/markdown";
import { folderPathMatchesFilter } from "@syntheo/utils/folders";
import {
  hasSummaryContent,
  resolveSummaryDocument,
} from "@syntheo/utils/session";

import { useLiveQuery } from "~/db";

export type FolderMeeting = {
  id: string;
  title: string;
  createdAt: string;
  folderPath: string;
  summaryMarkdown: string | null;
  oneLine: string | null;
};

export type FolderMeetingSqlRow = {
  id: string;
  title: string;
  created_at: string;
  folder_path: string;
  document_id: string | null;
  body: string | null;
  body_format: string | null;
  kind: string | null;
  template_id: string | null;
  sort_order: number | null;
};

const FOLDER_MEETINGS_SQL = `
  SELECT
    session.id,
    session.title,
    session.created_at,
    session.folder_path,
    document.id AS document_id,
    document.body,
    document.body_format,
    document.kind,
    document.template_id,
    document.sort_order
  FROM sessions AS session
  LEFT JOIN session_documents AS document
    ON document.session_id = session.id
    AND document.kind IN ('summary', 'template_output')
    AND document.deleted_at IS NULL
  WHERE session.deleted_at IS NULL
    AND (
      session.folder_path = ?
      OR session.folder_path LIKE ?
      OR session.folder_path LIKE ?
    )
  ORDER BY session.created_at DESC, session.id
`;

function folderMeetingsParams(folderPath: string): string[] {
  return [folderPath, `${folderPath}/%`, `${folderPath}\\%`];
}

const ONE_LINE_MAX_LENGTH = 220;
const SPACES = /\s+/g;

function nodeText(node: JSONContent): string {
  if (node.type === "text") {
    return node.text ?? "";
  }
  if (node.type === "mention-@") {
    return String(node.attrs?.label ?? "");
  }
  return (node.content ?? []).map(nodeText).join("");
}

function cleanLine(text: string): string | null {
  const line = text.replace(SPACES, " ").trim();
  if (!line) {
    return null;
  }
  if (line.length <= ONE_LINE_MAX_LENGTH) {
    return line;
  }
  const slice = line.slice(0, ONE_LINE_MAX_LENGTH);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 120 ? lastSpace : ONE_LINE_MAX_LENGTH)}…`;
}

function firstListItemText(node: JSONContent): string | null {
  for (const child of node.content ?? []) {
    if (child.type === "listItem" || child.type === "taskItem") {
      const line = cleanLine(nodeText(child));
      if (line) return line;
    }
  }
  return null;
}

// Premier paragraphe de la synthèse (le titre exclu), sinon premier élément
// de liste : c'est le résumé d'une ligne de la chronologie.
export function summaryFirstLine(doc: JSONContent): string | null {
  const blocks = doc.content ?? [];
  for (const block of blocks) {
    if (block.type === "paragraph") {
      const line = cleanLine(nodeText(block));
      if (line) return line;
    }
  }
  for (const block of blocks) {
    if (
      block.type === "bulletList" ||
      block.type === "orderedList" ||
      block.type === "taskList"
    ) {
      const line = firstListItemText(block);
      if (line) return line;
    }
  }
  return null;
}

function summaryDoc(body: string, format: string): JSONContent {
  return format === "markdown" ? md2json(body) : parseJsonContent(body);
}

function withoutTitleHeading(doc: JSONContent, title: string): JSONContent {
  const [first, ...rest] = doc.content ?? [];
  if (
    first?.type === "heading" &&
    first.attrs?.level === 1 &&
    nodeText(first).trim() === title.trim()
  ) {
    return { ...doc, content: rest };
  }
  return doc;
}

export function mapFolderMeetingRows(
  rows: readonly FolderMeetingSqlRow[],
  folderPath: string,
): FolderMeeting[] {
  const order: string[] = [];
  const grouped = new Map<
    string,
    { row: FolderMeetingSqlRow; documents: FolderMeetingSqlRow[] }
  >();
  for (const row of rows) {
    if (!folderPathMatchesFilter(row.folder_path, folderPath)) {
      continue;
    }
    let entry = grouped.get(row.id);
    if (!entry) {
      entry = { row, documents: [] };
      grouped.set(row.id, entry);
      order.push(row.id);
    }
    if (row.document_id) {
      entry.documents.push(row);
    }
  }

  return order.map((id) => {
    const { row, documents } = grouped.get(id)!;
    const summary = resolveSummaryDocument(
      documents.map((document) => ({
        id: document.document_id ?? "",
        body: document.body ?? "",
        body_format: document.body_format ?? "",
        kind: document.kind ?? "",
        template_id: document.template_id ?? "",
        sort_order: Number(document.sort_order ?? 0),
      })),
      row.title,
    );
    const hasSummary = Boolean(
      summary && hasSummaryContent(summary.body, row.title),
    );
    const doc =
      summary && hasSummary
        ? withoutTitleHeading(
            summaryDoc(summary.body, summary.body_format),
            row.title,
          )
        : null;
    const markdown = doc ? json2md(doc).trim() : "";
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      folderPath: row.folder_path,
      summaryMarkdown: markdown || null,
      oneLine: doc ? summaryFirstLine(doc) : null,
    };
  });
}

export type FolderMeetingStats = {
  count: number;
  firstAt: string | null;
  lastAt: string | null;
};

export function folderMeetingStats(
  meetings: readonly FolderMeeting[],
): FolderMeetingStats {
  const dates = meetings
    .map((meeting) => meeting.createdAt)
    .filter(Boolean)
    .sort();
  return {
    count: meetings.length,
    firstAt: dates[0] ?? null,
    lastAt: dates[dates.length - 1] ?? null,
  };
}

const EMPTY_MEETINGS: FolderMeeting[] = [];

export function useFolderMeetings(folderPath: string): FolderMeeting[] {
  const { data = EMPTY_MEETINGS } = useLiveQuery<
    FolderMeetingSqlRow,
    FolderMeeting[]
  >({
    sql: FOLDER_MEETINGS_SQL,
    params: folderMeetingsParams(folderPath),
    enabled: Boolean(folderPath),
    mapRows: (rows) => mapFolderMeetingRows(rows, folderPath),
  });
  return folderPath ? data : EMPTY_MEETINGS;
}
