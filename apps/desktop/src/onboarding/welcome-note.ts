import { i18n } from "@lingui/core";

import { md2json } from "@syntheo/editor/markdown";

import { liveQueryClient } from "~/db";
import {
  WELCOME_NOTE_TRACKING_ID,
  WELCOME_NOTES,
} from "~/onboarding/welcome-note.constants";
import { createSession } from "~/session/queries";
import { DEFAULT_USER_ID } from "~/shared/utils";

const PENDING_WELCOME_SESSION_KEY = "syntheo.pending-welcome-session";

function welcomeNote() {
  return i18n.locale?.startsWith("fr") ? WELCOME_NOTES.fr : WELCOME_NOTES.en;
}

let pendingWelcomeSession: Promise<string> | null = null;

export function getOrCreateWelcomeSession(): Promise<string> {
  if (!pendingWelcomeSession) {
    pendingWelcomeSession = findOrCreateWelcomeSession().finally(() => {
      pendingWelcomeSession = null;
    });
  }
  return pendingWelcomeSession;
}

export function setPendingWelcomeSession(sessionId: string | null) {
  if (sessionId) {
    localStorage.setItem(PENDING_WELCOME_SESSION_KEY, sessionId);
  } else {
    localStorage.removeItem(PENDING_WELCOME_SESSION_KEY);
  }
}

export function takePendingWelcomeSession(): string | null {
  const sessionId = localStorage.getItem(PENDING_WELCOME_SESSION_KEY);
  localStorage.removeItem(PENDING_WELCOME_SESSION_KEY);
  return sessionId;
}

async function findOrCreateWelcomeSession(): Promise<string> {
  const rows = await liveQueryClient.execute<{ id: string }>(
    `
      SELECT id
      FROM sessions
      WHERE deleted_at IS NULL
        AND CASE
          WHEN json_valid(metadata_json)
          THEN json_extract(metadata_json, '$.welcome_note')
        END = ?
      ORDER BY created_at, id
      LIMIT 1
    `,
    [WELCOME_NOTE_TRACKING_ID],
  );
  if (rows[0]) return rows[0].id;

  const note = welcomeNote();
  return createSession(note.title, DEFAULT_USER_ID, {
    metadata_json: JSON.stringify({ welcome_note: WELCOME_NOTE_TRACKING_ID }),
    raw_md: JSON.stringify(md2json(note.body)),
  });
}
