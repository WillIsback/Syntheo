import { md2json } from "@syntheo/editor/markdown";

import { liveQueryClient } from "~/db";
import { WELCOME_NOTE_TRACKING_ID } from "~/onboarding/welcome-note.constants";
import { createSession } from "~/session/queries";
import { DEFAULT_USER_ID } from "~/shared/utils";

const PENDING_WELCOME_SESSION_KEY = "syntheo.pending-welcome-session";

const WELCOME_NOTE = `Bienvenue sur Syntheo 👋

Une réunion tient sur une seule page, en trois temps : **Préparer**, **Écouter**, **Synthèse**.

- **Préparer** : choisissez le **type de réunion**. Il détermine le modèle du compte-rendu.
- **Écouter** : lancez l'écoute depuis la capsule en bas de la page. La transcription s'affiche en marge pendant que vous prenez vos notes ici.
- **Synthèse** : à l'arrêt, Syntheo fusionne vos notes et la transcription dans le compte-rendu. Vos notes restent en vert, le texte rédigé par Syntheo à l'encre : vous voyez d'un coup d'œil qui a écrit quoi.

Pourquoi le thé ? Syn·thé·o : ce qu'on rassemble autour du thé. Comme le *kaiki*, le carnet qu'un invité garde d'une réunion de thé, votre compte rendu part de vos notes. La réunion ne se rejoue pas : l'audio n'est jamais conservé, seule la note reste.

Avant votre première réunion, réglez la transcription et la synthèse avec les boutons ci-dessus.

Astuce : **Ctrl K** ouvre la palette pour retrouver une note, un dossier ou un réglage.`;

const WELCOME_NOTE_TITLE = "Bienvenue sur Syntheo";

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

  return createSession(WELCOME_NOTE_TITLE, DEFAULT_USER_ID, {
    metadata_json: JSON.stringify({ welcome_note: WELCOME_NOTE_TRACKING_ID }),
    raw_md: JSON.stringify(md2json(WELCOME_NOTE)),
  });
}
