import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { Platform } from "@tauri-apps/plugin-os";

import type { SettingsTab } from "~/store/zustand/tabs";

// Index unique de la recherche de paramètres (issue 373) : la palette Ctrl+K,
// sa version filtrée Ctrl+Maj+P et le champ de la colonne des Paramètres le
// lisent tous. Une entrée par réglage, pas par page. Chaque `id` est posé
// sur la ligne du réglage (`data-setting-id`, prop `settingId`) : un test le
// vérifie. Les mots-clés sont des mots courants (« micro », « sombre »,
// « allumer le PC »), traduits comme le reste de l'interface.
export type SettingsSearchEntry = {
  id: string;
  page: SettingsTab;
  // Message Lingui du libellé de la ligne, le même que dans la page.
  label: MessageDescriptor;
  // Titre de la partie de page, quand la page en a plusieurs.
  section?: MessageDescriptor;
  keywords: MessageDescriptor;
  // Réglage affiché seulement sur ces plateformes.
  platforms?: readonly Platform[];
  // Réglage masqué dans la version App Store.
  hiddenInAppStore?: boolean;
  // Réglage affiché sous condition (option activée, serveur configuré) : sans
  // lui, l'arrivée cible ce réglage parent de la même page.
  fallback?: string;
};

const LANGUAGE_REGION = msg`Language & Region`;
const STORAGE = msg`Storage`;
const IDENTITY = msg`Identity`;
const AUDIO = msg`Audio`;
const CLI_MCP = msg`CLI & MCP`;

export const SETTINGS_SEARCH_INDEX = [
  // Profil
  {
    id: "profile-name",
    page: "app",
    section: IDENTITY,
    label: msg`Name`,
    keywords: msg`first name, last name, identity, signature`,
  },
  {
    id: "profile-job-title",
    page: "app",
    section: IDENTITY,
    label: msg`Job Title`,
    keywords: msg`position, role, function, job`,
  },
  {
    id: "profile-email",
    page: "app",
    section: IDENTITY,
    label: msg`Email`,
    keywords: msg`email address, mail, attendees`,
  },
  {
    id: "profile-company",
    page: "app",
    section: IDENTITY,
    label: msg`Company`,
    keywords: msg`organization, employer, department, administration`,
  },
  {
    id: "profile-notes",
    page: "app",
    section: IDENTITY,
    label: msg`Notes`,
    keywords: msg`memo, about me, description`,
  },
  {
    id: "autostart",
    page: "app",
    label: msg`Start Syntheo at login`,
    keywords: msg`startup, turn on the computer, launch, open automatically, boot`,
    hiddenInAppStore: true,
  },
  {
    id: "automatic-updates",
    page: "app",
    label: msg`Automatically install updates`,
    keywords: msg`update, new version, upgrade`,
    hiddenInAppStore: true,
  },
  {
    id: "release-notes",
    page: "app",
    label: msg`Show release notes`,
    keywords: msg`what's new, changes, version, changelog`,
  },
  {
    id: "show-app-in-dock",
    page: "app",
    label: msg`Show app in Dock`,
    keywords: msg`Dock, app switcher, icon`,
    platforms: ["macos"],
  },
  {
    id: "show-tray-icon",
    page: "app",
    label: msg`Show tray icon`,
    keywords: msg`notification area, taskbar, menu bar, icon, clock`,
  },
  {
    id: "main-language",
    page: "app",
    section: LANGUAGE_REGION,
    label: msg`Main language`,
    keywords: msg`language, French, English, translation`,
  },
  {
    id: "summary-language",
    page: "app",
    section: LANGUAGE_REGION,
    label: msg`Use main language for summaries`,
    keywords: msg`language, summary, translation`,
  },
  {
    id: "spoken-languages",
    page: "app",
    section: LANGUAGE_REGION,
    label: msg`Additional spoken languages`,
    keywords: msg`languages, multilingual, foreign language, English, Spanish, German`,
  },
  {
    id: "timezone",
    page: "app",
    section: LANGUAGE_REGION,
    label: msg`Timezone`,
    keywords: msg`time, hour, country, time difference`,
  },
  {
    id: "export-location",
    page: "app",
    section: STORAGE,
    label: msg`Export location`,
    keywords: msg`Downloads, PDF, folder, export, save, Markdown, text file`,
  },

  // Réunions
  {
    id: "auto-stop-meetings",
    page: "meetings",
    label: msg`Stop when meeting ends`,
    keywords: msg`automatic, stop, end of call, hang up`,
  },
  {
    id: "meeting-disclosure",
    page: "meetings",
    label: msg`Post recording disclosure in meeting chat`,
    keywords: msg`consent, announce, participants, chat, inform`,
    platforms: ["macos", "linux"],
  },
  {
    id: "capture-meeting-chat",
    page: "meetings",
    label: msg`Capture meeting chat in the note`,
    keywords: msg`chat, messages, note, Teams, Zoom`,
    platforms: ["macos", "linux"],
  },
  {
    id: "capture-shared-screens",
    page: "meetings",
    label: msg`Capture shared screens in the note`,
    keywords: msg`screen, slides, screenshot, presentation, screen sharing`,
    platforms: ["macos", "windows"],
  },
  {
    id: "capture-reminder",
    page: "meetings",
    label: msg`Remind participants about recording`,
    keywords: msg`consent, reminder, inform participants, recording`,
  },
  {
    id: "floating-bar",
    page: "meetings",
    label: msg`Show floating bar`,
    keywords: msg`bar, small window, control, always on top`,
  },
  {
    id: "meetings-microphone",
    page: "meetings",
    section: AUDIO,
    label: msg`Microphone`,
    keywords: msg`mic, headset, earphones, sound, audio device, webcam`,
  },
  {
    id: "meetings-system-audio",
    page: "meetings",
    section: AUDIO,
    label: msg`System sound`,
    keywords: msg`speakers, output, headphones, HDMI, loopback, participants, sound`,
    // macOS capte toujours la sortie par défaut (issue 450).
    platforms: ["linux", "windows"],
  },

  // Apparence
  {
    id: "theme",
    page: "appearance",
    label: msg`Theme`,
    keywords: msg`dark, light, color, night mode, system`,
  },
  {
    id: "palette",
    page: "appearance",
    label: msg`Palette`,
    keywords: msg`colors, color, green tea, wisteria, contrast`,
  },
  {
    id: "use-24-hour-time",
    page: "appearance",
    label: msg`Use 24-hour time`,
    keywords: msg`time, clock, hour, AM, PM`,
  },
  {
    id: "color-notes-in-summary",
    page: "appearance",
    label: msg`Color my notes in the summary`,
    keywords: msg`green, color, my notes, summary, highlight`,
  },

  // Notifications
  {
    id: "notifications-disabled",
    page: "notifications",
    label: msg`Disable all notifications`,
    keywords: msg`silence, mute, alerts, quiet, do not disturb`,
  },
  {
    id: "notify-summary-complete",
    page: "notifications",
    label: msg`Summary complete`,
    keywords: msg`notification, alert, summary ready`,
  },
  {
    id: "notify-cloud-sync",
    page: "notifications",
    label: msg`Cloud sync complete`,
    keywords: msg`notification, alert, synchronization, cloud`,
  },
  {
    id: "notify-recording",
    page: "notifications",
    label: msg`Recording status prompts`,
    keywords: msg`end of meeting, stop, question, alert`,
  },
  {
    id: "completion-sound",
    page: "notifications",
    label: msg`Completion sound`,
    keywords: msg`sound, beep, ring, volume, audio`,
  },
  {
    id: "completion-sound-name",
    page: "notifications",
    label: msg`Sound`,
    keywords: msg`sound, beep, ring, chime, preview`,
    fallback: "completion-sound",
  },
  {
    id: "notify-bounce",
    page: "notifications",
    label: msg`Bounce app icon`,
    keywords: msg`icon, taskbar, Dock, attention, flash`,
  },
  {
    id: "mic-detection",
    page: "notifications",
    label: msg`Microphone detection`,
    keywords: msg`mic, detect, automatic, meeting, call`,
  },
  {
    id: "detection-delay",
    page: "notifications",
    label: msg`Detection delay`,
    keywords: msg`mic, delay, wait, seconds`,
    fallback: "mic-detection",
  },
  {
    id: "excluded-apps",
    page: "notifications",
    label: msg`Exclude apps from detection`,
    keywords: msg`mic, apps, ignore, exclude, software`,
    fallback: "mic-detection",
  },
  {
    id: "respect-dnd",
    page: "notifications",
    label: msg`Respect Do-Not-Disturb mode`,
    keywords: msg`do not disturb, focus, silence, quiet`,
    platforms: ["macos"],
  },

  // Permissions
  {
    id: "permission-microphone",
    page: "permissions",
    section: AUDIO,
    label: msg`Microphone`,
    keywords: msg`mic, access, authorize, allow, privacy`,
  },
  {
    id: "permission-system-audio",
    page: "permissions",
    section: AUDIO,
    label: msg`System audio`,
    keywords: msg`sound, speakers, participants, access, authorize`,
  },
  {
    id: "permission-accessibility",
    page: "permissions",
    label: msg`Accessibility`,
    keywords: msg`access, authorize, meeting controls, chat`,
    platforms: ["macos"],
  },

  // Confidentialité
  {
    id: "lock-app",
    page: "privacy",
    label: msg`Lock app`,
    keywords: msg`password, PIN, Windows Hello, security, fingerprint, privacy`,
  },

  // Développeurs
  {
    id: "cli",
    page: "developers",
    section: CLI_MCP,
    label: msg`Syntheo CLI`,
    keywords: msg`command line, terminal, install`,
  },
  {
    id: "mcp-server",
    page: "developers",
    section: CLI_MCP,
    label: msg`MCP server`,
    keywords: msg`MCP, configuration, AI agent, assistant`,
  },
  {
    id: "agent-skills",
    page: "developers",
    section: CLI_MCP,
    label: msg`Agent skills`,
    keywords: msg`skill, AI agent, assistant, install`,
  },
  {
    id: "webhooks",
    page: "developers",
    label: msg`Webhooks`,
    keywords: msg`webhook, URL, events, integration, automation`,
  },

  // Dictée (Pro)
  {
    id: "dictation-enabled",
    page: "dictation",
    label: msg`Enable dictation`,
    keywords: msg`dictation, voice typing, speak, text, write`,
  },
  {
    id: "dictation-shortcut",
    page: "dictation",
    label: msg`Dictation shortcut`,
    keywords: msg`dictation, shortcut, key, keyboard`,
  },
  {
    id: "dictation-hands-free",
    page: "dictation",
    label: msg`Hands-free dictation`,
    keywords: msg`dictation, hands-free, hold, press`,
  },
  {
    id: "dictation-microphone",
    page: "dictation",
    label: msg`Microphone`,
    keywords: msg`dictation, mic, headset, sound, audio device`,
  },
  {
    id: "dictation-live-preview",
    page: "dictation",
    label: msg`Live transcript preview`,
    keywords: msg`dictation, bubble, preview, live text`,
  },
  {
    id: "dictation-language",
    page: "dictation",
    label: msg`Language and vocabulary`,
    keywords: msg`dictation, language, words, vocabulary`,
  },

  // Dictionnaire (Pro)
  {
    id: "dictionary-terms",
    page: "dictionary",
    label: msg`Dictionary`,
    keywords: msg`words, vocabulary, names, jargon, spelling, acronyms`,
  },

  // Transcription
  {
    id: "stt-server",
    page: "transcription",
    label: msg`Server address`,
    keywords: msg`transcription server, speech recognition, URL, API key, Whisper`,
  },
  {
    id: "stt-protocol",
    page: "transcription",
    label: msg`Protocol`,
    keywords: msg`OpenAI, NVIDIA, NIM, transcription server`,
  },
  {
    id: "stt-model",
    page: "transcription",
    label: msg`Model`,
    keywords: msg`transcription model, Whisper, Parakeet, speech recognition`,
    fallback: "stt-server",
  },

  // Synthèse
  {
    id: "llm-server",
    page: "intelligence",
    label: msg`Server address`,
    keywords: msg`AI, artificial intelligence, language model, Ollama, vLLM, URL, API key`,
  },
  {
    id: "llm-model",
    page: "intelligence",
    label: msg`Model`,
    keywords: msg`AI, artificial intelligence, language model, Mistral, Llama`,
    fallback: "llm-server",
  },
  {
    id: "llm-reasoning-effort",
    page: "intelligence",
    label: msg`Reasoning effort`,
    keywords: msg`AI, reasoning, quality, speed, thinking`,
  },
] as const satisfies readonly SettingsSearchEntry[];

export type SettingId = (typeof SETTINGS_SEARCH_INDEX)[number]["id"];

const FALLBACKS = new Map<string, string>(
  SETTINGS_SEARCH_INDEX.flatMap((item) =>
    "fallback" in item ? [[item.id, item.fallback] as const] : [],
  ),
);

/** Réglage parent à cibler quand `id` n'est pas affiché. */
export function settingFallback(id: string): string | undefined {
  return FALLBACKS.get(id);
}
