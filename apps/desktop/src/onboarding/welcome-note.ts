import { i18n } from "@lingui/core";

import { md2json } from "@syntheo/editor/markdown";

import { liveQueryClient } from "~/db";
import { WELCOME_NOTE_TRACKING_ID } from "~/onboarding/welcome-note.constants";
import { createSession } from "~/session/queries";
import { DEFAULT_USER_ID } from "~/shared/utils";

const PENDING_WELCOME_SESSION_KEY = "syntheo.pending-welcome-session";

// La note suit la langue de l'interface au moment de sa création (issue 696).
// Le document rédigé par Syntheo s'appelle « synthèse » (issue 746).
const WELCOME_NOTES = {
  fr: {
    title: "Bienvenue sur Syntheo",
    body: `Bienvenue sur Syntheo 👋

Une réunion tient sur une seule page, en trois temps : **Préparer**, **Écouter**, **Synthèse**.

- **Préparer** : choisissez le **type de réunion**. Il détermine le modèle de la synthèse.
- **Écouter** : lancez l'écoute depuis la capsule en bas de la page. La transcription s'affiche en marge pendant que vous prenez vos notes ici.
- **Synthèse** : à l'arrêt, Syntheo fusionne vos notes et la transcription dans la synthèse. Vos notes restent en vert, le texte rédigé par Syntheo à l'encre : vous voyez d'un coup d'œil qui a écrit quoi.

Pourquoi le thé ? Syn·thé·o : ce qu'on rassemble autour du thé. Comme le *kaiki*, le carnet qu'un invité garde d'une réunion de thé, votre synthèse part de vos notes. La réunion ne se rejoue pas : l'audio n'est jamais conservé, seule la note reste.

Avant votre première réunion, réglez la transcription et la synthèse avec les boutons ci-dessus.

Astuce : **Ctrl K** ouvre la palette pour retrouver une note, un dossier ou un réglage.`,
  },
  en: {
    title: "Welcome to Syntheo",
    body: `Welcome to Syntheo 👋

A meeting fits on a single page, in three steps: **Prepare**, **Listen**, **Synthesis**.

- **Prepare**: choose the **meeting type**. It sets the template of the summary.
- **Listen**: start listening from the capsule at the bottom of the page. The transcript shows in the margin while you take your notes here.
- **Synthesis**: when you stop, Syntheo merges your notes and the transcript into the summary. Your notes stay green, the text Syntheo wrote stays in ink: you see at a glance who wrote what.

Why tea? Syn·thé·o: what gathers around tea. Like the *kaiki*, the notebook a guest keeps of a tea gathering, your summary starts from your notes. The meeting is not replayed: the audio is never kept, only the note remains.

Before your first meeting, set up transcription and summaries with the buttons above.

Tip: **Ctrl K** opens the palette to find a note, a folder or a setting.`,
  },
};

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
