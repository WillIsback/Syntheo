import {
  loadActiveSessionIds,
  loadSessionContentSnapshot,
  type SessionContentSnapshot,
} from "~/session/content-queries";
import {
  formatMeetingChatRecordsAsMarkdown,
  loadMeetingChatRecords,
} from "~/stt/meeting-chat-records";

export const DEFAULT_SEARCH_LIMIT = 5;
export const MAX_SEARCH_LIMIT = 10;
const SNIPPET_RADIUS = 180;

type NoteSection = {
  title: string;
  text: string;
};

type LoadedNoteFile = {
  sessionId: string;
  title: string;
  date: string | null;
  participantIds: string[];
  participants: string[];
  participantNamesById?: Record<string, string>;
  sections: NoteSection[];
};

type SearchSnippet = {
  section: string;
  text: string;
};

type SearchMatch = {
  sessionId: string;
  title: string;
  date: string | null;
  score: number;
  snippets: SearchSnippet[];
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractTranscriptText(
  transcripts: SessionContentSnapshot["transcripts"],
): string | null {
  const chunks = transcripts.flatMap((item) => {
    const memo = item.memo.trim();
    if (memo) {
      return [memo];
    }

    const words = item.words ?? [];
    const text = normalizeWhitespace(words.map((word) => word.text).join(" "));
    return text ? [text] : [];
  });

  return chunks.length > 0 ? chunks.join("\n\n") : null;
}

export function buildNoteSections(
  snapshot: SessionContentSnapshot,
  meetingChatMarkdown = "",
): NoteSection[] {
  const sections: NoteSection[] = [];

  if (snapshot.rawMarkdown.trim()) {
    sections.push({
      title: "Raw note",
      text: snapshot.rawMarkdown.trim(),
    });
  }

  if (meetingChatMarkdown.trim()) {
    sections.push({
      title: "Meeting chat",
      text: meetingChatMarkdown.trim(),
    });
  }

  for (const note of snapshot.enhancedNotes) {
    if (!note.markdown.trim()) {
      continue;
    }

    sections.push({
      title: note.title.trim() || "Enhanced note",
      text: note.markdown.trim(),
    });
  }

  const transcriptText = extractTranscriptText(snapshot.transcripts);
  if (transcriptText) {
    sections.push({
      title: "Transcript",
      text: transcriptText,
    });
  }

  return sections;
}

async function loadNoteFile(sessionId: string): Promise<LoadedNoteFile | null> {
  const snapshot = await loadSessionContentSnapshot(sessionId);
  if (!snapshot) return null;
  const meetingChatMarkdown = formatMeetingChatRecordsAsMarkdown(
    await loadMeetingChatRecords(sessionId),
  );

  const participantIds = snapshot.participants.map(
    (participant) => participant.humanId,
  );
  const participants = snapshot.participants
    .map((participant) => participant.name.trim())
    .filter(Boolean);
  const participantNamesById = Object.fromEntries(
    snapshot.participants.flatMap((participant) =>
      participant.name.trim()
        ? [[participant.humanId, participant.name.trim()]]
        : [],
    ),
  );

  return {
    sessionId,
    title: snapshot.title.trim() || "Untitled",
    date: snapshot.createdAt || null,
    participantIds,
    participants,
    participantNamesById,
    sections: buildNoteSections(snapshot, meetingChatMarkdown),
  };
}

async function loadNoteFiles(sessionIds: string[]): Promise<LoadedNoteFile[]> {
  const notes = await Promise.all(
    sessionIds.map((sessionId) => loadNoteFile(sessionId)),
  );
  return notes.filter((note): note is LoadedNoteFile => note !== null);
}

export function queryTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9@\-.]+/i)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ),
  );
}

function createSnippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + length + SNIPPET_RADIUS);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${normalizeWhitespace(text.slice(start, end))}${suffix}`;
}

function matchSection(
  section: NoteSection,
  query: string,
  terms: string[],
): {
  score: number;
  snippets: SearchSnippet[];
} {
  const lowerText = section.text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const snippets: SearchSnippet[] = [];
  let score = 0;

  const exactIndex = lowerText.indexOf(lowerQuery);
  if (lowerQuery && exactIndex >= 0) {
    score += 20;
    snippets.push({
      section: section.title,
      text: createSnippet(section.text, exactIndex, query.length),
    });
  }

  for (const term of terms) {
    const index = lowerText.indexOf(term);
    if (index < 0) {
      continue;
    }

    score += 3;
    if (snippets.length < 3) {
      snippets.push({
        section: section.title,
        text: createSnippet(section.text, index, term.length),
      });
    }
  }

  return { score, snippets };
}

export function searchNote(
  note: LoadedNoteFile,
  query: string,
): SearchMatch | null {
  const terms = queryTerms(query);
  let score = 0;
  const snippets: SearchSnippet[] = [];
  const lowerQuery = query.toLowerCase();

  if (note.title.toLowerCase().includes(lowerQuery)) {
    score += 8;
    snippets.push({
      section: "Title",
      text: note.title,
    });
  }
  const matchingParticipants = note.participants.filter((name) =>
    name.toLowerCase().includes(lowerQuery),
  );
  if (matchingParticipants.length > 0) {
    score += 8;
    snippets.push({
      section: "Participants",
      text: matchingParticipants.join(", "),
    });
  }

  for (const section of note.sections) {
    const match = matchSection(section, query, terms);
    score += match.score;
    snippets.push(...match.snippets);
  }

  if (score <= 0 || snippets.length === 0) {
    return null;
  }

  return {
    sessionId: note.sessionId,
    title: note.title,
    date: note.date,
    score,
    snippets: snippets.slice(0, 3),
  };
}

export async function searchMeetingContent({
  query,
  sessionIds,
  limit,
}: {
  query: string;
  sessionIds?: string[];
  limit: number;
}) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return {
      query,
      results: [],
      message: "Query is empty",
    };
  }

  const candidateIds = sessionIds ?? (await loadActiveSessionIds());
  const notes = await loadNoteFiles(candidateIds);
  const results: SearchMatch[] = [];

  for (const note of notes) {
    const match = searchNote(note, trimmedQuery);
    if (match) {
      results.push(match);
    }
  }

  results.sort((a, b) => b.score - a.score);
  return {
    query: trimmedQuery,
    scanned: candidateIds.length,
    results: results.slice(0, limit),
  };
}

function sharedParticipantReasons(
  baseIds: Set<string>,
  candidate: LoadedNoteFile,
): string[] {
  return candidate.participantIds.flatMap((humanId) => {
    if (!baseIds.has(humanId)) {
      return [];
    }

    const name = candidate.participantNamesById?.[humanId];
    if (!name) {
      return ["shared participant"];
    }

    return [`shared participant: ${name}`];
  });
}

function getDateDistanceDays(
  a: string | null,
  b: string | null,
): number | null {
  if (!a || !b) {
    return null;
  }

  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) {
    return null;
  }

  return Math.abs(aMs - bMs) / (24 * 60 * 60 * 1000);
}

type RelatedNoteMatch = {
  sessionId: string;
  title: string;
  date: string | null;
  score: number;
  reasons: string[];
};

function scoreRelatedNote(
  base: LoadedNoteFile,
  baseParticipantIds: Set<string>,
  candidate: LoadedNoteFile,
): RelatedNoteMatch | null {
  const reasons: string[] = [];
  let score = 0;

  const participantReasons = sharedParticipantReasons(
    baseParticipantIds,
    candidate,
  );
  if (participantReasons.length > 0) {
    reasons.push(...participantReasons);
    score += participantReasons.length * 8;
  }

  const distanceDays = getDateDistanceDays(base.date, candidate.date);
  if (distanceDays !== null && distanceDays <= 7) {
    reasons.push("nearby date");
    score += Math.max(1, 7 - Math.floor(distanceDays));
  }

  if (score <= 0) {
    return null;
  }

  return {
    sessionId: candidate.sessionId,
    title: candidate.title,
    date: candidate.date,
    score,
    reasons,
  };
}

export async function listRelatedNotes({
  sessionId,
  limit,
}: {
  sessionId: string;
  limit: number;
}) {
  const base = await loadNoteFile(sessionId);
  if (!base) {
    return {
      status: "error" as const,
      message: `Could not read note ${sessionId}`,
      sessionId,
      results: [],
    };
  }

  const baseParticipantIds = new Set(base.participantIds);
  const candidateIds = (await loadActiveSessionIds()).filter(
    (candidateId) => candidateId !== sessionId,
  );
  const candidates = await loadNoteFiles(candidateIds);

  const results = candidates
    .map((candidate) => scoreRelatedNote(base, baseParticipantIds, candidate))
    .filter((match): match is RelatedNoteMatch => match !== null);

  results.sort((a, b) => b.score - a.score);
  return {
    status: "ok" as const,
    sessionId,
    title: base.title,
    results: results.slice(0, limit),
  };
}

export function resolveContentSearchSessionIds(
  folderSessionIds: string[] | undefined,
  meetingIds: string[] | undefined,
): string[] | undefined {
  if (folderSessionIds === undefined) {
    return meetingIds;
  }

  if (!meetingIds?.length) {
    return folderSessionIds;
  }

  return meetingIds.filter((id) => folderSessionIds.includes(id));
}
