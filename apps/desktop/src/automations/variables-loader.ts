import { commands as transcriptionCommands } from "@syntheo/plugin-transcription";

import type { BaseVariable } from "./variables";

import { loadSessionContentSnapshot } from "~/session/content-queries";

// Variables de base d'une note, lues dans la base locale au moment où une
// étape en a besoin. Rien ne sort de la machine.
export async function loadBaseVariable(
  sessionId: string,
  name: BaseVariable,
): Promise<string> {
  if (name === "transcript") {
    return await loadTranscriptText(sessionId);
  }
  const snapshot = await loadSessionContentSnapshot(sessionId, {
    includeTranscriptWords: false,
  });
  if (!snapshot) {
    return "";
  }
  switch (name) {
    case "title":
      return snapshot.title;
    case "date":
      return snapshot.createdAt.slice(0, 10);
    case "notes":
      return snapshot.rawMarkdown;
    case "summary":
      return snapshot.enhancedNotes
        .map((note) => note.markdown.trim())
        .filter(Boolean)
        .join("\n\n---\n\n");
  }
}

async function loadTranscriptText(sessionId: string): Promise<string> {
  const result = await transcriptionCommands.renderSessionTranscript({
    session_id: sessionId,
    self_human_id: null,
  });
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return (result.data?.segments ?? [])
    .map((segment) =>
      segment.speaker_label
        ? `${segment.speaker_label}: ${segment.text}`
        : segment.text,
    )
    .join("\n");
}
