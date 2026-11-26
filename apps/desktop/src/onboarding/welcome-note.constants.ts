// Identifiant de la note de bienvenue créée à la fin de l'onboarding, rangé
// dans `sessions.metadata_json.welcome_note`. Conservé tel quel : la migration
// 20261109120000_drop_calendar le recopie depuis l'ancien `event_json`.
export const WELCOME_NOTE_TRACKING_ID = "syntheo-onboarding-demo-v1";

// Espace insécable de la typographie française devant « : ; ! ? »
// (issue 765) : contrôlée par src/i18n/french-typography.test.ts.
const NBSP = "\u00a0";

// La note suit la langue de l'interface au moment de sa création (issue 696).
// Le document rédigé par Syntheo s'appelle « synthèse » (issue 746).
export const WELCOME_NOTES = {
  fr: {
    title: "Bienvenue sur Syntheo",
    body: `Bienvenue sur Syntheo 👋

Une réunion tient sur une seule page, en trois temps${NBSP}: **Préparer**, **Écouter**, **Synthèse**.

- **Préparer**${NBSP}: choisissez le **type de réunion**. Il détermine le modèle de la synthèse.
- **Écouter**${NBSP}: lancez l'écoute depuis la capsule en bas de la page. La transcription s'affiche en marge pendant que vous prenez vos notes ici.
- **Synthèse**${NBSP}: à l'arrêt, Syntheo fusionne vos notes et la transcription dans la synthèse. Vos notes restent en vert, le texte rédigé par Syntheo à l'encre${NBSP}: vous voyez d'un coup d'œil qui a écrit quoi.

Pourquoi le thé${NBSP}? Syn·thé·o${NBSP}: ce qu'on rassemble autour du thé. Comme le *kaiki*, le carnet qu'un invité garde d'une réunion de thé, votre synthèse part de vos notes. La réunion ne se rejoue pas${NBSP}: l'audio n'est jamais conservé, seule la note reste.

Avant votre première réunion, réglez la transcription et la synthèse avec les boutons ci-dessus.

Astuce${NBSP}: **Ctrl K** ouvre la palette pour retrouver une note, un dossier ou un réglage.`,
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
