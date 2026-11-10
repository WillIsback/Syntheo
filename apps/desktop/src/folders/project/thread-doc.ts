// Document du fil rouge d'un dossier (issue 496). C'est un document de note
// ordinaire, modifiable avec l'éditeur de note : un paragraphe d'état, puis
// trois sections titrées (Décisions, Points ouverts, Tâches non faites).
// Chaque élément se termine par une mention de la réunion d'où il vient.
//
// Fusion d'une mise à jour, sans écraser les corrections : on part du
// document actuel, tel que l'utilisateur l'a laissé. `generated` liste, par
// section, les textes écrits par le modèle et jamais retouchés ; tout texte
// absent de cette liste est une correction ou un ajout de l'utilisateur.
// - Paragraphes d'état : ceux du modèle sont remplacés par le nouvel état ;
//   ceux de l'utilisateur restent tels quels, avant le nouvel état.
// - Décisions : jamais retirées ; les nouvelles s'ajoutent à la fin.
// - Points ouverts : un point que les nouvelles réunions ont tranché n'est
//   retiré que s'il vient du modèle et n'a pas été retouché.
// - Tâches : une tâche signalée faite est cochée (son texte ne change pas).
// - Tout autre contenu (sections renommées ou ajoutées) reste en place.

import type { JSONContent } from "@syntheo/editor/markdown";

export type ThreadSectionKey = "decisions" | "openPoints" | "tasks";

export type ThreadLabels = Record<ThreadSectionKey, string>;

export const ENGLISH_THREAD_LABELS: ThreadLabels = {
  decisions: "Decisions",
  openPoints: "Open points",
  tasks: "Open tasks",
};

const SECTION_KEYS: readonly ThreadSectionKey[] = [
  "decisions",
  "openPoints",
  "tasks",
];

export type ThreadItem = {
  text: string;
  sessionId: string | null;
  done: boolean;
};

export type ParsedThread = {
  status: string[];
  decisions: ThreadItem[];
  openPoints: ThreadItem[];
  tasks: ThreadItem[];
};

export type GeneratedTexts = {
  status: string[];
  decisions: string[];
  openPoints: string[];
  tasks: string[];
};

export const EMPTY_GENERATED_TEXTS: GeneratedTexts = {
  status: [],
  decisions: [],
  openPoints: [],
  tasks: [],
};

export type NewThreadItem = { text: string; sessionId: string };

export type ThreadUpdate = {
  status: string;
  decisions: NewThreadItem[];
  openPoints: NewThreadItem[];
  tasks: NewThreadItem[];
  // Indices dans `parseThread(document actuel).openPoints` / `.tasks`.
  resolvedOpenPoints: number[];
  doneTasks: number[];
};

const SPACES = /\s+/g;
const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);
const ITEM_TYPES = new Set(["listItem", "taskItem"]);

function normalizeThreadText(text: string): string {
  return text.replace(SPACES, " ").trim();
}

function plainText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "mention-@") return "";
  return (node.content ?? []).map(plainText).join("");
}

function itemText(item: JSONContent): string {
  const paragraph = item.content?.[0];
  return normalizeThreadText(paragraph ? plainText(paragraph) : "");
}

function findSessionMention(node: JSONContent): string | null {
  if (node.type === "mention-@" && node.attrs?.type === "session") {
    return typeof node.attrs.id === "string" ? node.attrs.id : null;
  }
  for (const child of node.content ?? []) {
    const found = findSessionMention(child);
    if (found) return found;
  }
  return null;
}

function isDone(item: JSONContent): boolean {
  return (
    item.type === "taskItem" &&
    (item.attrs?.status === "done" || item.attrs?.checked === true)
  );
}

function sectionForHeading(
  heading: JSONContent,
  labels: ThreadLabels,
): ThreadSectionKey | "other" {
  const text = normalizeThreadText(plainText(heading)).toLowerCase();
  for (const key of SECTION_KEYS) {
    if (
      text === labels[key].toLowerCase() ||
      text === ENGLISH_THREAD_LABELS[key].toLowerCase()
    ) {
      return key;
    }
  }
  return "other";
}

type Section = "status" | ThreadSectionKey | "other";

function* walkSections(
  blocks: readonly JSONContent[],
  labels: ThreadLabels,
): Generator<{ block: JSONContent; index: number; section: Section }> {
  let section: Section = "status";
  for (const [index, block] of blocks.entries()) {
    if (block.type === "heading") {
      section = sectionForHeading(block, labels);
    }
    yield { block, index, section };
  }
}

export function isEmptyThreadDoc(doc: JSONContent | null | undefined) {
  const blocks = doc?.content ?? [];
  return blocks.every(
    (block) =>
      block.type === "paragraph" && !normalizeThreadText(plainText(block)),
  );
}

export function parseThread(
  doc: JSONContent | null | undefined,
  labels: ThreadLabels,
): ParsedThread {
  const parsed: ParsedThread = {
    status: [],
    decisions: [],
    openPoints: [],
    tasks: [],
  };
  for (const { block, section } of walkSections(doc?.content ?? [], labels)) {
    if (section === "status") {
      if (block.type === "paragraph") {
        const text = normalizeThreadText(plainText(block));
        if (text) parsed.status.push(text);
      }
      continue;
    }
    if (section === "other" || !LIST_TYPES.has(block.type ?? "")) {
      continue;
    }
    for (const item of block.content ?? []) {
      if (!ITEM_TYPES.has(item.type ?? "")) continue;
      const text = itemText(item);
      if (!text) continue;
      parsed[section].push({
        text,
        sessionId: findSessionMention(item),
        done: isDone(item),
      });
    }
  }
  return parsed;
}

function textNode(text: string): JSONContent {
  return { type: "text", text };
}

function paragraph(text: string): JSONContent {
  return text
    ? { type: "paragraph", content: [textNode(text)] }
    : { type: "paragraph" };
}

function itemParagraph(
  item: NewThreadItem,
  meetingLabel: (sessionId: string) => string,
): JSONContent {
  return {
    type: "paragraph",
    content: [
      textNode(`${item.text} `),
      {
        type: "mention-@",
        attrs: {
          id: item.sessionId,
          type: "session",
          label: meetingLabel(item.sessionId),
        },
      },
    ],
  };
}

function itemNode(
  item: NewThreadItem,
  asTask: boolean,
  meetingLabel: (sessionId: string) => string,
): JSONContent {
  const content = [itemParagraph(item, meetingLabel)];
  return asTask
    ? {
        type: "taskItem",
        attrs: {
          status: "todo",
          checked: false,
          taskId: null,
          taskItemId: null,
        },
        content,
      }
    : { type: "listItem", content };
}

function headingNode(label: string): JSONContent {
  return { type: "heading", attrs: { level: 3 }, content: [textNode(label)] };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function mergeThread({
  current,
  generated,
  update,
  labels,
  meetingLabel,
}: {
  current: JSONContent | null;
  generated: GeneratedTexts;
  update: ThreadUpdate;
  labels: ThreadLabels;
  meetingLabel: (sessionId: string) => string;
}): { doc: JSONContent; generated: GeneratedTexts } {
  const source = current && !isEmptyThreadDoc(current) ? current.content! : [];
  const generatedStatus = new Set(generated.status);
  const generatedOpenPoints = new Set(generated.openPoints);
  const resolved = new Set(update.resolvedOpenPoints);
  const done = new Set(update.doneTasks);

  const blocks: JSONContent[] = [];
  let statusInsertAt: number | null = null;
  const lastBlockOf: Partial<Record<ThreadSectionKey, number>> = {};
  const lastListOf: Partial<Record<ThreadSectionKey, number>> = {};
  let openPointIndex = 0;
  let taskIndex = 0;

  for (const { block: original, section } of walkSections(source, labels)) {
    const block = clone(original);
    if (section !== "status" && statusInsertAt === null) {
      statusInsertAt = blocks.length;
    }
    if (section === "status") {
      const text =
        block.type === "paragraph" ? normalizeThreadText(plainText(block)) : "";
      if (block.type === "paragraph" && (!text || generatedStatus.has(text))) {
        continue;
      }
      blocks.push(block);
      continue;
    }
    if (section === "other") {
      blocks.push(block);
      continue;
    }
    if (LIST_TYPES.has(block.type ?? "")) {
      const items: JSONContent[] = [];
      for (const item of block.content ?? []) {
        const text = ITEM_TYPES.has(item.type ?? "") ? itemText(item) : "";
        if (section === "openPoints" && text) {
          const index = openPointIndex++;
          if (resolved.has(index) && generatedOpenPoints.has(text)) {
            continue;
          }
        }
        if (section === "tasks" && text) {
          const index = taskIndex++;
          if (done.has(index) && item.type === "taskItem") {
            item.attrs = { ...item.attrs, status: "done", checked: true };
          }
        }
        items.push(item);
      }
      if (items.length === 0) {
        continue;
      }
      block.content = items;
      blocks.push(block);
      lastListOf[section] = blocks.length - 1;
      lastBlockOf[section] = blocks.length - 1;
      continue;
    }
    blocks.push(block);
    lastBlockOf[section] = blocks.length - 1;
  }

  // Nouveaux éléments : à la fin de la liste de leur section, sinon juste
  // après sa dernière ligne, sinon dans une nouvelle section en fin de page.
  const appended: JSONContent[] = [];
  const insertions: Array<{ at: number; nodes: JSONContent[] }> = [];
  for (const key of SECTION_KEYS) {
    const newItems = update[key];
    if (newItems.length === 0) continue;
    const listIndex = lastListOf[key];
    if (listIndex !== undefined) {
      const list = blocks[listIndex]!;
      const asTask = list.type === "taskList";
      list.content = [
        ...(list.content ?? []),
        ...newItems.map((item) => itemNode(item, asTask, meetingLabel)),
      ];
      continue;
    }
    const asTask = key === "tasks";
    const list: JSONContent = {
      type: asTask ? "taskList" : "bulletList",
      content: newItems.map((item) => itemNode(item, asTask, meetingLabel)),
    };
    const lastIndex = lastBlockOf[key];
    if (lastIndex !== undefined) {
      insertions.push({ at: lastIndex + 1, nodes: [list] });
    } else {
      appended.push(headingNode(labels[key]), list);
    }
  }
  for (const { at, nodes } of insertions.sort((a, b) => b.at - a.at)) {
    blocks.splice(at, 0, ...nodes);
    if (statusInsertAt !== null && at <= statusInsertAt) {
      statusInsertAt += nodes.length;
    }
  }
  blocks.push(...appended);

  const status = normalizeThreadText(update.status);
  if (status) {
    blocks.splice(
      statusInsertAt ?? firstHeadingIndex(blocks),
      0,
      paragraph(status),
    );
  }
  if (blocks.length === 0) {
    blocks.push(paragraph(""));
  }

  const doc: JSONContent = { type: "doc", content: blocks };
  return { doc, generated: nextGeneratedTexts(doc, generated, update, labels) };
}

function firstHeadingIndex(blocks: readonly JSONContent[]): number {
  const index = blocks.findIndex((block) => block.type === "heading");
  return index === -1 ? blocks.length : index;
}

function nextGeneratedTexts(
  doc: JSONContent,
  previous: GeneratedTexts,
  update: ThreadUpdate,
  labels: ThreadLabels,
): GeneratedTexts {
  const parsed = parseThread(doc, labels);
  const status = normalizeThreadText(update.status);
  const keep = (key: ThreadSectionKey) => {
    const known = new Set([
      ...previous[key],
      ...update[key].map((item) => normalizeThreadText(item.text)),
    ]);
    return parsed[key]
      .map((item) => item.text)
      .filter((text) => known.has(text));
  };
  return {
    status: status ? [status] : [],
    decisions: keep("decisions"),
    openPoints: keep("openPoints"),
    tasks: keep("tasks"),
  };
}
