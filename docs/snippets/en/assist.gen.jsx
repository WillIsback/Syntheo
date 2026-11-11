// Fichier généré par scripts/sync-docs-ui.mjs depuis scripts/docs-ui/core.jsx.tpl, scripts/docs-ui/note.jsx.tpl, scripts/docs-ui/settings.jsx.tpl, scripts/docs-ui/settings-meetings.jsx.tpl, scripts/docs-ui/settings-servers.jsx.tpl, scripts/docs-ui/settings-profile.jsx.tpl, scripts/docs-ui/settings-dictation.jsx.tpl, scripts/docs-ui/settings-privacy.jsx.tpl, scripts/docs-ui/palette.jsx.tpl, scripts/docs-ui/chat.jsx.tpl, scripts/docs-ui/automations.jsx.tpl, scripts/docs-ui/troubleshooting.jsx.tpl, scripts/docs-ui/en.json : ne pas modifier.
// Reproductions interactives de Syntheo pour la documentation Mintlify.
// Modèles de docs/snippets/*.gen.jsx : les blocs @TOKENS, @LABELS, @ICONS,
// @CSS_PARTS et @VERSION sont remplis par scripts/sync-docs-ui.mjs depuis les
// sources de l'app (tokens.css, messages.po, Hugeicons de packages/ui) ;
// @LOCALE est la langue de la sortie (fr-FR, ou en-US pour docs/snippets/en/).
// Libellés : L(msgid anglais de messages.po, entre guillemets), LP(msgid, n) pour un pluriel,
// LF(msgid, { nom: valeur }) pour une variable. Icônes : I("Folder"), le nom
// de packages/ui/src/components/icons-*.tsx.
// Mintlify fournit React et ses hooks sans import ; un snippet ne peut
// importer ni un autre snippet ni du JSON, d'où des fichiers autonomes.
// Feuilles de style propres à un modèle : const SYN_CSS_NOM = `…` (préfixe
// .syn-), ajoutées automatiquement à {h(SynStyle)}.

const SYN_VERSION = "0.7.0";
const SYN_LOCALE = "en-US";
const SYN_LIGHT = {
  "background": "hsl(50 43% 97%)",
  "foreground": "hsl(100 8% 15%)",
  "card": "hsl(48 100% 99%)",
  "muted": "hsl(53 22% 92%)",
  "muted-foreground": "hsl(95 6% 36%)",
  "accent": "hsl(105 25% 91%)",
  "accent-foreground": "hsl(146 39% 24%)",
  "border": "hsl(55 18% 87%)",
  "input": "hsl(55 14% 82%)",
  "primary": "hsl(142 36% 30%)",
  "primary-foreground": "hsl(50 43% 97%)",
  "recording": "hsl(357 54% 51%)",
  "seal": "hsl(357 54% 51%)",
  "user-ink": "hsl(142 36% 30%)",
  "alert": "hsl(7 68% 95%)",
  "alert-foreground": "hsl(357 53% 42%)",
  "alert-border": "hsl(4 58% 86%)",
  "faint": "hsl(95 5% 56%)",
  "destructive": "hsl(358 51% 46%)",
  "destructive-foreground": "hsl(0 0% 100%)",
  "popover": "hsl(48 100% 99%)",
  "ring": "hsl(142 36% 30%)",
  "shadow-capsule": "0 8px 28px rgba(38, 42, 36, 0.18)"
};
const SYN_DARK = {
  "background": "hsl(105 7% 11%)",
  "foreground": "hsl(46 25% 90%)",
  "card": "hsl(103 10% 14%)",
  "muted": "hsl(105 9% 18%)",
  "muted-foreground": "hsl(86 8% 65%)",
  "accent": "hsl(141 22% 18%)",
  "accent-foreground": "hsl(140 36% 72%)",
  "border": "hsl(105 7% 21%)",
  "input": "hsl(102 8% 25%)",
  "primary": "hsl(142 34% 62%)",
  "primary-foreground": "hsl(143 32% 11%)",
  "recording": "hsl(4 72% 64%)",
  "seal": "hsl(4 72% 64%)",
  "user-ink": "hsl(142 34% 62%)",
  "alert": "hsl(358 35% 17%)",
  "alert-foreground": "hsl(4 77% 75%)",
  "alert-border": "hsl(359 36% 26%)",
  "faint": "hsl(90 6% 48%)",
  "destructive": "hsl(358 66% 64%)",
  "destructive-foreground": "hsl(358 45% 12%)",
  "popover": "hsl(103 10% 14%)",
  "ring": "hsl(142 34% 62%)",
  "shadow-capsule": "0 8px 28px rgba(0, 0, 0, 0.5)"
};
const SYN_LABELS = {
  "(Unavailable — using the default output)": "(Unavailable — using the default output)",
  "API key (optional)": "API key (optional)",
  "Action": "Action",
  "Actions": "Actions",
  "Activity": "Activity",
  "Add a step": "Add a step",
  "Add an argument": "Add an argument",
  "Add and configure at least one action first.": "Add and configure at least one action first.",
  "Add at least one configured action before enabling.": "Add at least one configured action before enabling.",
  "Add language": "Add language",
  "Add spoken language": "Add spoken language",
  "Added:": "Added:",
  "Additional spoken languages": "Additional spoken languages",
  "Address (URL)": "Address (URL)",
  "Advanced": "Advanced",
  "All Notes": "All Notes",
  "Appearance": "Appearance",
  "Applies an instruction (tasks, short summary, follow-up message); the result feeds the next steps.": "Applies an instruction (tasks, short summary, follow-up message); the result feeds the next steps.",
  "Apply to summary": "Apply to summary",
  "Argument {position}": "Argument {position}",
  "Arguments": "Arguments",
  "Ask anything": "Ask anything",
  "Ask the folder": "Ask the folder",
  "Ask the folder: “{question}”": "Ask the folder: “{question}”",
  "Ask the note": "Ask the note",
  "At the root of the vault": "At the root of the vault",
  "Audio": "Audio",
  "Auto": "Auto",
  "Automatically install updates": "Automatically install updates",
  "Automation actions": "Automation actions",
  "Automations": "Automations",
  "Available to the next steps": "Available to the next steps",
  "Backspace": "Backspace",
  "Begin listening": "Begin listening",
  "Beta": "Beta",
  "Cancel": "Cancel",
  "Cancel dictation": "Cancel dictation",
  "Capture meeting chat in the note": "Capture meeting chat in the note",
  "Captured right now:": "Captured right now:",
  "Chat history": "Chat history",
  "Choose": "Choose",
  "Choose at least one section to export.": "Choose at least one section to export.",
  "Choose folder": "Choose folder",
  "Choose the microphone that captures your voice.": "Choose the microphone that captures your voice.",
  "Choose the output whose sound Syntheo transcribes: the one where you hear the other participants.": "Choose the output whose sound Syntheo transcribes: the one where you hear the other participants.",
  "Click here, then use your dictation shortcut.": "Click here, then use your dictation shortcut.",
  "Click the shortcut to record a new key combination. Press Escape to cancel.": "Click the shortcut to record a new key combination. Press Escape to cancel.",
  "Close": "Close",
  "Close chat": "Close chat",
  "Close the test": "Close the test",
  "Collect action items": "Collect action items",
  "Command output": "Command output",
  "Complete the note with the same title": "Complete the note with the same title",
  "Configure every step before testing.": "Configure every step before testing.",
  "Connected · {0} models available": "Connected · {0} models available",
  "Connected · {0} ms": "Connected · {0} ms",
  "Contacts": "Contacts",
  "Content": "Content",
  "Control listening without reopening Syntheo.": "Control listening without reopening Syntheo.",
  "Copied": "Copied",
  "Copy": "Copy",
  "Copy last dictation": "Copy last dictation",
  "Copy to the clipboard": "Copy to the clipboard",
  "Create a new note": "Create a new note",
  "Created:": "Created:",
  "Creates or completes a note in the vault.": "Creates or completes a note in the vault.",
  "Current default": "Current default",
  "Current default output": "Current default output",
  "Decline": "Decline",
  "Default language for transcription and AI responses.": "Default language for transcription and AI responses.",
  "Delete automation": "Delete automation",
  "Developers": "Developers",
  "Device authentication is not available on this computer.": "Device authentication is not available on this computer.",
  "Dictation": "Dictation",
  "Dictation shortcut": "Dictation shortcut",
  "Dictation uses your microphone, transcription provider, languages, and dictionary. Audio is never written to disk; it only passes through memory. Your last transcript stays in memory until dictation is disabled or Syntheo closes.": "Dictation uses your microphone, transcription provider, languages, and dictionary. Audio is never written to disk; it only passes through memory. Your last transcript stays in memory until dictation is disabled or Syntheo closes.",
  "Dictionary": "Dictionary",
  "Disable": "Disable",
  "Draft": "Draft",
  "Draft a follow-up email to the participants": "Draft a follow-up email to the participants",
  "Draft follow-up email.": "Draft follow-up email.",
  "Each new step runs after the previous one.": "Each new step runs after the previous one.",
  "Edit summary — waiting for your review": "Edit summary — waiting for your review",
  "Email": "Email",
  "Enable dictation": "Enable dictation",
  "Enabled": "Enabled",
  "Enter": "Enter",
  "Enter a full address, for example {placeholder}.": "Enter a full address, for example {placeholder}.",
  "Enter another name": "Enter another name",
  "Esc": "Esc",
  "Every finished meeting is saved as a Markdown file in a folder.": "Every finished meeting is saved as a Markdown file in a folder.",
  "Export": "Export",
  "Export as Markdown": "Export as Markdown",
  "Export folder": "Export folder",
  "Export location": "Export location",
  "Exported file": "Exported file",
  "Extract tasks": "Extract tasks",
  "Find key decisions.": "Find key decisions.",
  "Finish": "Finish",
  "Float chat": "Float chat",
  "Folders": "Folders",
  "Forget this server's address and key?": "Forget this server's address and key?",
  "Generate with the local model": "Generate with the local model",
  "Generated text": "Generated text",
  "Go to": "Go to",
  "Hands-free dictation": "Hands-free dictation",
  "Have Syntheo ready when you sign in.": "Have Syntheo ready when you sign in.",
  "Help": "Help",
  "Hi, I'm Syntheo AI. Set up a language model and I'll be ready to help.": "Hi, I'm Syntheo AI. Set up a language model and I'll be ready to help.",
  "High": "High",
  "Hold your shortcut while speaking, then release it to finish.": "Hold your shortcut while speaking, then release it to finish.",
  "Identity": "Identity",
  "In this folder": "In this folder",
  "Include": "Include",
  "Insert": "Insert",
  "Instruction": "Instruction",
  "Invalid address": "Invalid address",
  "JSON body": "JSON body",
  "JSON to n8n, Home Assistant or a home server. The only step that leaves your computer.": "JSON to n8n, Home Assistant or a home server. The only step that leaves your computer.",
  "Job Title": "Job Title",
  "Keep Syntheo running to use your shortcut in other apps.": "Keep Syntheo running to use your shortcut in other apps.",
  "Key refused": "Key refused",
  "Language & Region": "Language & Region",
  "Language and vocabulary": "Language and vocabulary",
  "Last dictation": "Last dictation",
  "Last run {relative}: {0}": "Last run {relative}: {0}",
  "Launch it from a note: the ⋯ menu, the capsule in Synthesis, or Ask the note (Ctrl+J).": "Launch it from a note: the ⋯ menu, the capsule in Synthesis, or Ask the note (Ctrl+J).",
  "Launched by hand": "Launched by hand",
  "Leave empty if the server has no authentication": "Leave empty if the server has no authentication",
  "Leave the folder": "Leave the folder",
  "Lets you know when the automation has finished.": "Lets you know when the automation has finished.",
  "List action items.": "List action items.",
  "List the action items decided during the meeting, one per line, with the person responsible. Meeting summary:": "List the action items decided during the meeting, one per line, with the person responsible. Meeting summary:",
  "List the decisions and the tasks, one per line…": "List the decisions and the tasks, one per line…",
  "Listen": "Listen",
  "Listening time": "Listening time",
  "Listening…": "Listening…",
  "Live transcript preview": "Live transcript preview",
  "Live transcription paused: {cause}. No audio is kept: this passage will be missing from the transcription. Check the transcription server settings.": "Live transcription paused: {cause}. No audio is kept: this passage will be missing from the transcription. Check the transcription server settings.",
  "Live transcription paused: {cause}. No audio is kept: this passage will be missing from the transcription. Reconnecting…": "Live transcription paused: {cause}. No audio is kept: this passage will be missing from the transcription. Reconnecting…",
  "Live transcription resumed.": "Live transcription resumed.",
  "Local script with the path of the exported file. Asks for confirmation the first time.": "Local script with the path of the exported file. Asks for confirmation the first time.",
  "Lock app": "Lock app",
  "Low": "Low",
  "Main language": "Main language",
  "Make the current summary more detailed than it is now. Add supporting context, rationale, and examples from the transcript without inventing anything.": "Make the current summary more detailed than it is now. Add supporting context, rationale, and examples from the transcript without inventing anything.",
  "Make the current summary noticeably shorter than it is now. Keep every decision, owner, deadline, and open question; cut repetition and secondary detail.": "Make the current summary noticeably shorter than it is now. Keep every decision, owner, deadline, and open question; cut repetition and secondary detail.",
  "Make the summary longer.": "Make the summary longer.",
  "Make the summary shorter.": "Make the summary shorter.",
  "Manual": "Manual",
  "Me": "Me",
  "Medium": "Medium",
  "Meeting ends": "Meeting ends",
  "Meeting summary ready": "Meeting summary ready",
  "Meetings": "Meetings",
  "Memo": "Memo",
  "Microphone": "Microphone",
  "Missing output": "Missing output",
  "Model": "Model",
  "Model name": "Model name",
  "Model name served by your server": "Model name served by your server",
  "More effort gives finer summaries, but slower. Auto leaves it to the server.": "More effort gives finer summaries, but slower. Auto leaves it to the server.",
  "Mute system audio": "Mute system audio",
  "Mute the microphone": "Mute the microphone",
  "My automations": "My automations",
  "My meetings": "My meetings",
  "My server": "My server",
  "My servers": "My servers",
  "NVIDIA NeMo-Speech.cpp": "NVIDIA NeMo-Speech.cpp",
  "NVIDIA NeMo-Speech.cpp: your nemo-speech serve server, for example http://localhost:9000. Live transcription and imported files use its realtime WebSocket. NVIDIA's hosted gRPC endpoint is not supported.": "NVIDIA NeMo-Speech.cpp: your nemo-speech serve server, for example http://localhost:9000. Live transcription and imported files use its realtime WebSocket. NVIDIA's hosted gRPC endpoint is not supported.",
  "Name": "Name",
  "Needs setup": "Needs setup",
  "Nemotron": "Nemotron",
  "New automation": "New automation",
  "New chat": "New chat",
  "New note in this folder": "New note in this folder",
  "No automations found": "No automations found",
  "No folder selected yet.": "No folder selected yet.",
  "No matching languages found": "No matching languages found",
  "No note matches this search.": "No note matches this search.",
  "No notes in this folder match.": "No notes in this folder match.",
  "No results found.": "No results found.",
  "No server yet": "No server yet",
  "No step acts outside Syntheo: the test only shows the results.": "No step acts outside Syntheo: the test only shows the results.",
  "Not tested": "Not tested",
  "Note": "Note",
  "Note capsule": "Note capsule",
  "Note steps": "Note steps",
  "Note title": "Note title",
  "Note to test on": "Note to test on",
  "Note “{noteTitle}”": "Note “{noteTitle}”",
  "Notes": "Notes",
  "Notification title": "Notification title",
  "Notifications": "Notifications",
  "On Linux (Wayland or X11)": "On Linux (Wayland or X11)",
  "On Wayland, approve the shortcuts in your desktop's prompt. Use Control + Alt + Escape to cancel. On X11, press Escape to cancel. The target app must expose an editable accessibility field.": "On Wayland, approve the shortcuts in your desktop's prompt. Use Control + Alt + Escape to cancel. On X11, press Escape to cancel. The target app must expose an editable accessibility field.",
  "Only on-premise OpenAI-compatible servers are supported (vLLM, Ollama, llama.cpp server, LM Studio…). The address usually ends with /v1, for example http://localhost:8000/v1.": "Only on-premise OpenAI-compatible servers are supported (vLLM, Ollama, llama.cpp server, LM Studio…). The address usually ends with /v1, for example http://localhost:8000/v1.",
  "Open": "Open",
  "Open AI Settings": "Open AI Settings",
  "OpenAI compatible (realtime and batch)": "OpenAI compatible (realtime and batch)",
  "OpenAI: a server that speaks the OpenAI speech protocol (vLLM, speaches, faster-whisper-server), for example http://localhost:8000/v1. Live transcription uses /v1/realtime, imported files /v1/audio/transcriptions.": "OpenAI: a server that speaks the OpenAI speech protocol (vLLM, speaches, faster-whisper-server), for example http://localhost:8000/v1. Live transcription uses /v1/realtime, imported files /v1/audio/transcriptions.",
  "Opens the Next meeting block of the folder {folderPath}.": "Opens the Next meeting block of the folder {folderPath}.",
  "Pause listening": "Pause listening",
  "Paused": "Paused",
  "Permissions": "Permissions",
  "Post recording disclosure in meeting chat": "Post recording disclosure in meeting chat",
  "Prepare": "Prepare",
  "Prepare the agenda for the next meeting.": "Prepare the agenda for the next meeting.",
  "Press shortcut…": "Press shortcut…",
  "Press your shortcut to start, then press it again to finish.": "Press your shortcut to start, then press it again to finish.",
  "Privacy": "Privacy",
  "Profile": "Profile",
  "Program": "Program",
  "Proposed edit to the summary": "Proposed edit to the summary",
  "Proposed summary edit": "Proposed summary edit",
  "Protocol": "Protocol",
  "Put on pause": "Put on pause",
  "Ready to dictate": "Ready to dictate",
  "Ready to paste into a message or a document.": "Ready to paste into a message or a document.",
  "Reasoning effort": "Reasoning effort",
  "Recent": "Recent",
  "Record other participants in meetings.": "Record other participants in meetings.",
  "Record your voice in meetings and calls.": "Record your voice in meetings and calls.",
  "Remind participants about recording": "Remind participants about recording",
  "Remove argument {position}": "Remove argument {position}",
  "Remove step {stepNumber}": "Remove step {stepNumber}",
  "Remove the {name} folder filter": "Remove the {name} folder filter",
  "Removed text is struck through, added text is highlighted.": "Removed text is struck through, added text is highlighted.",
  "Removed:": "Removed:",
  "Require Windows Hello face, PIN, or password when opening Syntheo.": "Require Windows Hello face, PIN, or password when opening Syntheo.",
  "Reset": "Reset",
  "Reset this server…": "Reset this server…",
  "Result available to the next steps as": "Result available to the next steps as",
  "Result available to the next steps under the name": "Result available to the next steps under the name",
  "Resume listening": "Resume listening",
  "Run a command": "Run a command",
  "Run an automation": "Run an automation",
  "Run the test": "Run the test",
  "Save & enable": "Save & enable",
  "Save PDF, text, Markdown, and Org exports to this folder.": "Save PDF, text, Markdown, and Org exports to this folder.",
  "Save visible chat from supported meetings using Accessibility.": "Save visible chat from supported meetings using Accessibility.",
  "Search automations...": "Search automations...",
  "Search by title": "Search by title",
  "Search in this folder...": "Search in this folder...",
  "Search language...": "Search language...",
  "Search notes and pages...": "Search notes and pages...",
  "Search settings": "Search settings",
  "Search timezone...": "Search timezone...",
  "Select language": "Select language",
  "Select timezone": "Select timezone",
  "Select...": "Select...",
  "Send message": "Send message",
  "Send to an address (webhook)": "Send to an address (webhook)",
  "Server address": "Server address",
  "Server address (OpenAI-compatible: vLLM, Ollama, llama.cpp, LM Studio)": "Server address (OpenAI-compatible: vLLM, Ollama, llama.cpp, LM Studio)",
  "Server status": "Server status",
  "Set the trigger and the actions. The chat on the right can help you shape the automation.": "Set the trigger and the actions. The chat on the right can help you shape the automation.",
  "Settings": "Settings",
  "Shift": "Shift",
  "Show a reminder when a recording starts.": "Show a reminder when a recording starts.",
  "Show floating bar": "Show floating bar",
  "Show release notes": "Show release notes",
  "Show the timeline in your preferred timezone.": "Show the timeline in your preferred timezone.",
  "Show tray icon": "Show tray icon",
  "Simulate the steps with real effects": "Simulate the steps with real effects",
  "Simulated": "Simulated",
  "Speak into any text field, in any app. The text is inserted when you finish.": "Speak into any text field, in any app. The text is inserted when you finish.",
  "Start Syntheo at login": "Start Syntheo at login",
  "Start from a template": "Start from a template",
  "Start voice input": "Start voice input",
  "Stay current with updates installed the next time Syntheo opens.": "Stay current with updates installed the next time Syntheo opens.",
  "Steps": "Steps",
  "Stop listening when your call ends.": "Stop listening when your call ends.",
  "Stop when meeting ends": "Stop when meeting ends",
  "Storage": "Storage",
  "Summary": "Summary",
  "Summary edit declined": "Summary edit declined",
  "Summary updated": "Summary updated",
  "Syntheo asks for your confirmation the first time this exact command runs. Each argument is passed as is, without a shell; the run stops after 60 seconds.": "Syntheo asks for your confirmation the first time this exact command runs. Each argument is passed as is, without a shell; the run stops after 60 seconds.",
  "Syntheo chains local steps after your meetings. Nothing leaves your computer, except a webhook step if you add one.": "Syntheo chains local steps after your meetings. Nothing leaves your computer, except a webhook step if you add one.",
  "Syntheo runs the automation as it is edited, even unsaved, on the note you choose.": "Syntheo runs the automation as it is edited, even unsaved, on the note you choose.",
  "Syntheo runs the steps in order on your computer: the trigger is step 1, then each action follows.": "Syntheo runs the steps in order on your computer: the trigger is step 1, then each action follows.",
  "Syntheo uses it to recognize you among the participants of your meetings, so you are not counted twice. It stays on this device.": "Syntheo uses it to recognize you among the participants of your meetings, so you are not counted twice. It stays on this device.",
  "Synthesis": "Synthesis",
  "Synthesis · connected": "Synthesis · connected",
  "System audio": "System audio",
  "System notification": "System notification",
  "System permissions": "System permissions",
  "System sound": "System sound",
  "Tab: search inside": "Tab: search inside",
  "Tell participants when listening starts; this does not confirm consent.": "Tell participants when listening starts; this does not confirm consent.",
  "Templates": "Templates",
  "Test connection": "Test connection",
  "Test on a note": "Test on a note",
  "Test result": "Test result",
  "Test running…": "Test running…",
  "Test the connection to list the models served.": "Test the connection to list the models served.",
  "Testing…": "Testing…",
  "Text": "Text",
  "The API key is optional for servers without authentication. It is kept in your system keychain.": "The API key is optional for servers without authentication. It is kept in your system keychain.",
  "The language model that writes your meeting notes and answers when you ask a note a question.": "The language model that writes your meeting notes and answers when you ask a note a question.",
  "The live transcription model handles one language at a time. To transcribe several, <0>change models</0>.": "The live transcription model handles one language at a time. To transcribe several, <0>change models</0>.",
  "The local model lists the actions to take and adds them to the vault.": "The local model lists the actions to take and adds them to the vault.",
  "The microphone and system audio are muted: nothing is being transcribed.": "The microphone and system audio are muted: nothing is being transcribed.",
  "The one that captures your voice.": "The one that captures your voice.",
  "The only step that leaves your computer: the JSON is sent to the address below. Use an address you trust, such as n8n, Home Assistant or a home server.": "The only step that leaves your computer: the JSON is sent to the address below. Use an address you trust, such as n8n, Home Assistant or a home server.",
  "The server did not answer at {host}. Check that it is running and that you are on the right network (VPN, Tailscale), then test again.": "The server did not answer at {host}. Check that it is running and that you are on the right network (VPN, Tailscale), then test again.",
  "The server that turns speech into text during your meetings. Audio is never written to disk.": "The server that turns speech into text during your meetings. Audio is never written to disk.",
  "The server transcribes with the model it loaded, whatever the model chosen here.": "The server transcribes with the model it loaded, whatever the model chosen here.",
  "The test changes neither the last run nor the list of notes already processed.": "The test changes neither the last run nor the list of notes already processed.",
  "Then": "Then",
  "These steps will be simulated: nothing is written, sent or run.": "These steps will be simulated: nothing is written, sent or run.",
  "They describe what they would do, without acting. The local model still generates its text.": "They describe what they would do, without acting. The local model still generates its text.",
  "This information stays on your computer. It is used to recognize you in transcripts and to sign your meeting notes.": "This information stays on your computer. It is used to recognize you in transcripts and to sign your meeting notes.",
  "This is a real test: these steps really act.": "This is a real test: these steps really act.",
  "This server answers as {detectedLabel}.": "This server answers as {detectedLabel}.",
  "Timezone": "Timezone",
  "Transcribing…": "Transcribing…",
  "Transcript": "Transcript",
  "Transcription": "Transcription",
  "Transcription interrupted {gaps}": "Transcription interrupted {gaps}",
  "Transcription server ›": "Transcription server ›",
  "Transcription · connected": "Transcription · connected",
  "Trigger": "Trigger",
  "Try again": "Try again",
  "Try dictation": "Try dictation",
  "Try it": "Try it",
  "Unmute system audio": "Unmute system audio",
  "Unmute the microphone": "Unmute the microphone",
  "Unreachable": "Unreachable",
  "Untitled automation": "Untitled automation",
  "Use an http:// or https:// address.": "Use an http:// or https:// address.",
  "Use main language for summaries": "Use main language for summaries",
  "Use this protocol": "Use this protocol",
  "Used for transcription and automatic summary language detection.": "Used for transcription and automatic summary language detection.",
  "Uses the local model chosen in Settings › Synthesis. Nothing leaves your computer.": "Uses the local model chosen in Settings › Synthesis. Nothing leaves your computer.",
  "Variables are inserted as JSON text, inside quotes. Redirects are not followed; the request stops after 15 seconds.": "Variables are inserted as JSON text, inside quotes. Redirects are not followed; the request stops after 15 seconds.",
  "Vault folder": "Vault folder",
  "What are my action items from this meeting?": "What are my action items from this meeting?",
  "What to do in the vault": "What to do in the vault",
  "What were the key decisions that have been made?": "What were the key decisions that have been made?",
  "When": "When",
  "When off, summaries follow the detected meeting language.": "When off, summaries follow the detected meeting language.",
  "When the meeting ends": "When the meeting ends",
  "When the meeting summary is ready": "When the meeting summary is ready",
  "When you launch it from a note": "When you launch it from a note",
  "Words appear in a small bubble while you speak. Text is inserted when you finish.": "Words appear in a small bubble while you speak. Text is inserted when you finish.",
  "Words specific to you go in your": "Words specific to you go in your",
  "Write to the vault": "Write to the vault",
  "Writes the note to a folder on your computer.": "Writes the note to a folder on your computer.",
  "Writing": "Writing",
  "creates or completes a note in your vault": "creates or completes a note in your vault",
  "detected automatically": "detected automatically",
  "dictionary": "dictionary",
  "most recent": "most recent",
  "replaces the content of the clipboard": "replaces the content of the clipboard",
  "runs the program on your computer": "runs the program on your computer",
  "sends the JSON to the address, outside your computer": "sends the JSON to the address, outside your computer",
  "shows a system notification": "shows a system notification",
  "vLLM, speaches, faster-whisper-server": "vLLM, speaches, faster-whisper-server",
  "writes a Markdown file to the chosen folder": "writes a Markdown file to the chosen folder",
  "you are offline": "you are offline",
  "{chain} · last run {relative}": "{chain} · last run {relative}",
  "{chain} · never run": "{chain} · never run",
  "{count, plural, one {# meeting} other {# meetings}}": "{count, plural, one {# meeting} other {# meetings}}",
  "{providerName} rejected your API key": "{providerName} rejected your API key",
  "{seconds} s": "{seconds} s",
  "“{title}” ran on this note": "“{title}” ran on this note"
};
const SYN_ICONS = {
  "ArrowRight": "<path d=\"M18.5 12L4.99997 12\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M13 18C13 18 19 13.5811 19 12C19 10.4188 13 6 13 6\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "ArrowUp": "<path d=\"M12 5.5V19\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M18 11C18 11 13.5811 5.00001 12 5C10.4188 4.99999 6 11 6 11\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "ArrowsInSimple": "<path d=\"M14.2297 17.9947C14.2192 17.2447 13.704 14.7612 14.2305 14.2347C14.7571 13.7083 17.2398 14.2247 17.9895 14.2355M20.9995 20.9981L14.6147 14.6146\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M9.76961 17.9944C9.78011 17.2445 10.2953 14.761 9.76881 14.2344C9.24228 13.708 6.75956 14.2245 6.00985 14.2352M2.99981 20.9978L9.38459 14.6144\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M6.00746 9.76133C6.7572 9.7709 9.24073 10.2832 9.76644 9.75585C10.2921 9.22853 9.77265 6.74581 9.76097 5.99592M9.37696 9.36743L3.00176 3.00244\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M17.9916 9.76133C17.2419 9.7709 14.7584 10.2832 14.2326 9.75585C13.707 9.22853 14.2264 6.74581 14.2381 5.99592M14.6221 9.36743L20.9973 3.00244\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "ArrowsOutSimple": "<path d=\"M8.00001 3.09779C8.00001 3.09779 4.03375 2.74194 3.38784 3.38785C2.74192 4.03375 3.09784 8 3.09784 8\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M8.00001 20.9022C8.00001 20.9022 4.03375 21.2581 3.38784 20.6122C2.74192 19.9662 3.09784 16 3.09784 16\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M16 3.09779C16 3.09779 19.9663 2.74194 20.6122 3.38785C21.2581 4.03375 20.9022 8 20.9022 8\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M16 20.9022C16 20.9022 19.9663 21.2581 20.6122 20.6122C21.2581 19.9662 20.9022 16 20.9022 16\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M14.0107 9.99847L20.0625 3.94678\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M9.99696 14.0024L3.63966 20.3807\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M9.99732 10.0024L3.84571 3.85889\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M13.9795 14.0024L20.5279 20.4983\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Bell": "<path d=\"M16 18C16 20.2091 14.2091 22 12 22C9.79086 22 8 20.2091 8 18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M4.43654 18H19.5625C20.2903 18 20.6542 18 20.8648 17.8951C21.274 17.6913 21.4929 17.2359 21.3964 16.789C21.3468 16.559 21.1194 16.2749 20.6648 15.7066L20.4951 15.4944C20.0392 14.9246 19.8113 14.6397 19.6184 14.3409C19.0187 13.4119 18.6477 12.354 18.5356 11.254C18.4995 10.9002 18.4995 10.5353 18.4995 9.8056V8.5C18.4995 8.03572 18.4995 7.80358 18.4867 7.60758C18.2898 4.60304 15.8965 2.20977 12.892 2.01285C12.696 2 12.4638 2 11.9995 2C11.5353 2 11.3031 2 11.1071 2.01285C8.10258 2.20977 5.70931 4.60304 5.51239 7.60758C5.49954 7.80358 5.49954 8.03572 5.49954 8.5V9.8056C5.49954 10.5353 5.49954 10.9002 5.46349 11.254C5.35143 12.354 4.98035 13.4119 4.38067 14.3409C4.18779 14.6397 3.95985 14.9246 3.50401 15.4944L3.33427 15.7066C2.87964 16.2749 2.65233 16.559 2.60268 16.789C2.50621 17.2359 2.72509 17.6913 3.13431 17.8951C3.3449 18 3.70878 18 4.43654 18Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/>",
  "BookOpen": "<path d=\"M7.99978 3.5H6.60021C4.43183 3.5 3.34764 3.5 2.67399 4.17362C2.00034 4.84724 2.00029 5.93144 2.00021 8.09982L2 13.3998C1.99992 15.5684 1.99987 16.6526 2.67353 17.3263C3.34719 18 4.43146 18 6.6 18H8.95042C10.4329 18 11.7092 19.0464 11.9999 20.5V5.5C11.0556 4.24097 9.99989 3.5 7.99978 3.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M16.0001 3.5H17.3997C19.5681 3.5 20.6523 3.5 21.3259 4.17362C21.9996 4.84724 21.9996 5.93144 21.9997 8.09982L21.9999 13.3998C22 15.5684 22 16.6526 21.3264 17.3263C20.6527 18 19.5684 18 17.3999 18H15.0495C13.567 18 12.2907 19.0464 12 20.5V5.5C12.9443 4.24097 14 3.5 16.0001 3.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Brain": "<path d=\"M16.998 7.12652C17.3182 7.04393 17.654 7 18 7C20.2091 7 22 8.79086 22 11C22 13.2091 20.2091 15 18 15C17.6451 15 17.3009 14.9538 16.9733 14.867M16.998 7.12652C16.9993 7.08451 17 7.04233 17 7C17 4.79086 15.2091 3 13 3C11.0824 3 9.47994 4.34939 9.09041 6.15043M16.998 7.12652C16.9769 7.80763 16.7854 8.44584 16.4649 9M16.9733 14.867C16.9909 14.7472 17 14.6247 17 14.5C17 13.2905 16.1411 12.2816 15 12.05M16.9733 14.867C16.7957 16.0737 15.756 17 14.5 17H14C11.7909 17 10 18.7909 10 21M9.09041 6.15043C8.74377 6.05243 8.37801 6 8 6C5.79086 6 4 7.79086 4 10C4 10.3886 4.05542 10.7643 4.15878 11.1195M9.09041 6.15043C10.1015 6.43625 10.9498 7.10965 11.4649 8M4.15878 11.1195C2.9114 11.4832 2 12.6352 2 14C2 15.6569 3.34315 17 5 17C6.30622 17 7.41746 16.1652 7.82929 15M4.15878 11.1195C4.24921 11.4303 4.37632 11.7255 4.53513 12\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M11.8361 11.7435C11.3257 12.2353 10.453 12.3202 9.70713 11.9008C8.9612 11.4814 8.58031 10.6917 8.73535 10\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/>",
  "CaretDown": "<path d=\"M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "CaretRight": "<path d=\"M9.00005 6C9.00005 6 15 10.4189 15 12C15 13.5812 9 18 9 18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Check": "<path d=\"M5 13.2592L7.58583 15.9568C8.2525 16.6523 8.58583 17 9.00004 17C9.41425 17 9.74759 16.6523 10.4143 15.9568L19 7\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "CircleNotch": "<path d=\"M21.9961 12C21.9961 17.5228 17.5189 22 11.9961 22C6.47325 22 1.99609 17.5228 1.99609 12C1.99609 6.47715 6.47325 2 11.9961 2\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/>",
  "ClockCounterClockwise": "<path d=\"M3.49902 14.9656C4.72475 18.4791 8.06749 21 11.999 21C16.9696 21 20.999 16.9706 20.999 12C20.999 7.02944 16.9696 3 11.999 3C8.29827 3 4.8984 5.6756 3.68943 8.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M11.999 7V12L14.999 14\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M7.49751 8.74363C7.49751 8.74363 3.81388 9.3026 3.25487 8.7436C2.69585 8.1846 3.25488 4.50098 3.25488 4.50098\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Code": "<path d=\"M16 6.99998L19.0664 9.64296C20.3554 10.7541 21 11.3096 21 12C21 12.6903 20.3555 13.2459 19.0664 14.357L16 17\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M8 6.99998L4.93365 9.64296C3.64455 10.7541 3 11.3096 3 12C3 12.6903 3.64455 13.2459 4.93365 14.357L8 17\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Desktop": "<path d=\"M14 21H16M14 21C13.1716 21 12.5 20.3284 12.5 19.5V17L12 17M14 21H10M10 21H8M10 21C10.8284 21 11.5 20.3284 11.5 19.5V17L12 17M12 17V21\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M16 3H8C5.17157 3 3.75736 3 2.87868 3.87868C2 4.75736 2 6.17157 2 9V11C2 13.8284 2 15.2426 2.87868 16.1213C3.75736 17 5.17157 17 8 17H16C18.8284 17 20.2426 17 21.1213 16.1213C22 15.2426 22 13.8284 22 11V9C22 6.17157 22 4.75736 21.1213 3.87868C20.2426 3 18.8284 3 16 3Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "DotsThree": "<path d=\"M6.00449 12.5V12M18.0045 12.5V12M12.0045 12.5V12M7.00449 12.5C7.00449 11.9477 6.55677 11.5 6.00449 11.5C5.4522 11.5 5.00449 11.9477 5.00449 12.5C5.00449 13.0523 5.4522 13.5 6.00449 13.5C6.55677 13.5 7.00449 13.0523 7.00449 12.5ZM19.0045 12.5C19.0045 11.9477 18.5568 11.5 18.0045 11.5C17.4522 11.5 17.0045 11.9477 17.0045 12.5C17.0045 13.0523 17.4522 13.5 18.0045 13.5C18.5568 13.5 19.0045 13.0523 19.0045 12.5ZM13.0045 12.5C13.0045 11.9477 12.5568 11.5 12.0045 11.5C11.4522 11.5 11.0045 11.9477 11.0045 12.5C11.0045 13.0523 11.4522 13.5 12.0045 13.5C12.5568 13.5 13.0045 13.0523 13.0045 12.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Envelope": "<path d=\"M2 6L8.91302 9.91697C11.4616 11.361 12.5384 11.361 15.087 9.91697L22 6\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M2.01577 13.4756C2.08114 16.5412 2.11383 18.0739 3.24496 19.2094C4.37608 20.3448 5.95033 20.3843 9.09883 20.4634C11.0393 20.5122 12.9607 20.5122 14.9012 20.4634C18.0497 20.3843 19.6239 20.3448 20.7551 19.2094C21.8862 18.0739 21.9189 16.5412 21.9842 13.4756C22.0053 12.4899 22.0053 11.5101 21.9842 10.5244C21.9189 7.45886 21.8862 5.92609 20.7551 4.79066C19.6239 3.65523 18.0497 3.61568 14.9012 3.53657C12.9607 3.48781 11.0393 3.48781 9.09882 3.53656C5.95033 3.61566 4.37608 3.65521 3.24495 4.79065C2.11382 5.92608 2.08114 7.45885 2.01576 10.5244C1.99474 11.5101 1.99475 12.4899 2.01577 13.4756Z\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "FileText": "<path d=\"M8 18H16\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M8 14H16\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M8 10H10\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M13 2.5V3C13 5.82843 13 7.24264 13.8787 8.12132C14.7574 9 16.1716 9 19 9H19.5M20 10.6569V14C20 17.7712 20 19.6569 18.8284 20.8284C17.6569 22 15.7712 22 12 22C8.22876 22 6.34315 22 5.17157 20.8284C4 19.6569 4 17.7712 4 14V9.45584C4 6.21082 4 4.58831 4.88607 3.48933C5.06508 3.26731 5.26731 3.06508 5.48933 2.88607C6.58831 2 8.21082 2 11.4558 2C12.1614 2 12.5141 2 12.8372 2.11401C12.9044 2.13772 12.9702 2.165 13.0345 2.19575C13.3436 2.34355 13.593 2.593 14.0919 3.09188L18.8284 7.82843C19.4065 8.40649 19.6955 8.69552 19.8478 9.06306C20 9.4306 20 9.83935 20 10.6569Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Folder": "<path d=\"M13.6656 6.49446H16C18.8284 6.49446 20.2426 6.49446 21.1213 7.37314C22 8.25182 22 9.66603 22 12.4945V14.5C22 17.3284 22 18.7426 21.1213 19.6213C20.2426 20.5 18.8284 20.5 16 20.5H8C5.17157 20.5 3.75736 20.5 2.87868 19.6213C2 18.7426 2 17.3284 2 14.5V8.99183C2 6.65409 2 5.48521 2.61604 4.67881C2.7778 4.46706 2.96706 4.2778 3.17881 4.11604C3.98521 3.5 5.15409 3.5 7.49183 3.5C8.16633 3.5 8.50358 3.5 8.81392 3.60442C8.8976 3.63257 8.97932 3.66623 9.05854 3.70518C9.35239 3.84965 9.59179 4.08719 10.0706 4.56227L10.8483 5.33389C11.4254 5.9066 11.714 6.19295 12.08 6.3437C12.446 6.49446 12.8525 6.49446 13.6656 6.49446Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "FolderOpen": "<path d=\"M3.93802 21H14.9395C17.1335 21 18.2305 21 19.0351 20.3884C19.8398 19.7768 20.1334 18.7198 20.7206 16.6059L21.9197 12.289C21.973 12.0972 22 11.8991 22 11.7001C22 10.485 21.015 9.5 19.7999 9.5H12.5634C10.5123 9.5 9.48671 9.5 8.71918 10.0273C8.59312 10.1139 8.47387 10.21 8.36246 10.3148C7.68418 10.9528 7.46632 11.9549 7.03061 13.9592L5.83181 19.4737C5.63814 20.3646 4.84972 21 3.93802 21ZM3.93802 21C2.86768 21 2 20.1323 2 19.062V7.76613C2 5.53633 2 4.42144 2.68424 3.72186C2.69664 3.70918 2.70918 3.69664 2.72186 3.68424C3.42144 3 4.53633 3 6.76613 3C7.37053 3 7.67273 3 7.94502 3.11102C7.95015 3.11311 7.95527 3.11523 7.96038 3.11738C8.23142 3.23142 8.4451 3.4451 8.87248 3.87248L9.62132 4.62132C10.0549 5.05487 10.2716 5.27164 10.5473 5.38582C10.823 5.5 11.1295 5.5 11.7426 5.5H16.5C17.5245 5.5 18.0367 5.5 18.4454 5.65383C19.0922 5.89728 19.6027 6.40776 19.8462 7.0546C20 7.46331 20 7.97554 20 9\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "FolderSimple": "<path d=\"M13.6656 6.49446H16C18.8284 6.49446 20.2426 6.49446 21.1213 7.37314C22 8.25182 22 9.66603 22 12.4945V14.5C22 17.3284 22 18.7426 21.1213 19.6213C20.2426 20.5 18.8284 20.5 16 20.5H8C5.17157 20.5 3.75736 20.5 2.87868 19.6213C2 18.7426 2 17.3284 2 14.5V8.99183C2 6.65409 2 5.48521 2.61604 4.67881C2.7778 4.46706 2.96706 4.2778 3.17881 4.11604C3.98521 3.5 5.15409 3.5 7.49183 3.5C8.16633 3.5 8.50358 3.5 8.81392 3.60442C8.8976 3.63257 8.97932 3.66623 9.05854 3.70518C9.35239 3.84965 9.59179 4.08719 10.0706 4.56227L10.8483 5.33389C11.4254 5.9066 11.714 6.19295 12.08 6.3437C12.446 6.49446 12.8525 6.49446 13.6656 6.49446Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Gear": "<path d=\"M15.5 12C15.5 13.933 13.933 15.5 12 15.5C10.067 15.5 8.5 13.933 8.5 12C8.5 10.067 10.067 8.5 12 8.5C13.933 8.5 15.5 10.067 15.5 12Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M21.011 14.0965C21.5329 13.9558 21.7939 13.8854 21.8969 13.7508C22 13.6163 22 13.3998 22 12.9669V11.0332C22 10.6003 22 10.3838 21.8969 10.2493C21.7938 10.1147 21.5329 10.0443 21.011 9.90358C19.0606 9.37759 17.8399 7.33851 18.3433 5.40087C18.4817 4.86799 18.5509 4.60156 18.4848 4.44529C18.4187 4.28902 18.2291 4.18134 17.8497 3.96596L16.125 2.98673C15.7528 2.77539 15.5667 2.66972 15.3997 2.69222C15.2326 2.71472 15.0442 2.90273 14.6672 3.27873C13.208 4.73448 10.7936 4.73442 9.33434 3.27864C8.95743 2.90263 8.76898 2.71463 8.60193 2.69212C8.43489 2.66962 8.24877 2.77529 7.87653 2.98663L6.15184 3.96587C5.77253 4.18123 5.58287 4.28891 5.51678 4.44515C5.45068 4.6014 5.51987 4.86787 5.65825 5.4008C6.16137 7.3385 4.93972 9.37763 2.98902 9.9036C2.46712 10.0443 2.20617 10.1147 2.10308 10.2492C2 10.3838 2 10.6003 2 11.0332V12.9669C2 13.3998 2 13.6163 2.10308 13.7508C2.20615 13.8854 2.46711 13.9558 2.98902 14.0965C4.9394 14.6225 6.16008 16.6616 5.65672 18.5992C5.51829 19.1321 5.44907 19.3985 5.51516 19.5548C5.58126 19.7111 5.77092 19.8188 6.15025 20.0341L7.87495 21.0134C8.24721 21.2247 8.43334 21.3304 8.6004 21.3079C8.76746 21.2854 8.95588 21.0973 9.33271 20.7213C10.7927 19.2644 13.2088 19.2643 14.6689 20.7212C15.0457 21.0973 15.2341 21.2853 15.4012 21.3078C15.5682 21.3303 15.7544 21.2246 16.1266 21.0133L17.8513 20.034C18.2307 19.8187 18.4204 19.711 18.4864 19.5547C18.5525 19.3984 18.4833 19.132 18.3448 18.5991C17.8412 16.6616 19.0609 14.6226 21.011 14.0965Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/>",
  "Lightning": "<path d=\"M8.62814 12.6736H8.16918C6.68545 12.6736 5.94358 12.6736 5.62736 12.1844C5.31114 11.6953 5.61244 11.0138 6.21504 9.65083L8.02668 5.55323C8.57457 4.314 8.84852 3.69438 9.37997 3.34719C9.91142 3 10.5859 3 11.935 3H14.0244C15.6632 3 16.4826 3 16.7916 3.53535C17.1007 4.0707 16.6942 4.78588 15.8811 6.21623L14.8092 8.10188C14.405 8.81295 14.2029 9.16849 14.2057 9.45952C14.2094 9.83775 14.4105 10.1862 14.7354 10.377C14.9854 10.5239 15.3927 10.5239 16.2074 10.5239C17.2373 10.5239 17.7523 10.5239 18.0205 10.7022C18.3689 10.9338 18.5513 11.3482 18.4874 11.7632C18.4382 12.0826 18.0918 12.4656 17.399 13.2317L11.8639 19.3523C10.7767 20.5545 10.2331 21.1556 9.86807 20.9654C9.50303 20.7751 9.67833 19.9822 10.0289 18.3962L10.7157 15.2896C10.9826 14.082 11.1161 13.4782 10.7951 13.0759C10.4741 12.6736 9.85877 12.6736 8.62814 12.6736Z\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "ListChecks": "<path d=\"M10.9961 6L20.9961 6\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M10.9961 12L20.9961 12\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M10.9961 18L20.9961 18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M2.99609 7.39286C2.99609 7.39286 3.99609 8.04466 4.49609 9C4.49609 9 5.99609 5.25 7.99609 4\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M2.99609 18.3929C2.99609 18.3929 3.99609 19.0447 4.49609 20C4.49609 20 5.99609 16.25 7.99609 15\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "ListNumbers": "<path d=\"M11 6L21 6\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M11 12L21 12\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M11 18L21 18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M3 15H4.5C4.77879 15 4.91819 15 5.03411 15.0231C5.51014 15.1177 5.88225 15.4899 5.97694 15.9659C6 16.0818 6 16.2212 6 16.5C6 16.7788 6 16.9182 5.97694 17.0341C5.88225 17.5101 5.51014 17.8823 5.03411 17.9769C4.91819 18 4.77879 18 4.5 18C4.22121 18 4.08181 18 3.96589 18.0231C3.48986 18.1177 3.11775 18.4899 3.02306 18.9659C3 19.0818 3 19.2212 3 19.5V20.4C3 20.6828 3 20.8243 3.08787 20.9121C3.17574 21 3.31716 21 3.6 21H6\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M3 3H4.2C4.36569 3 4.5 3.13431 4.5 3.3V9M4.5 9H3M4.5 9H6\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Location": "<path d=\"M13.6177 21.367C13.1841 21.773 12.6044 22 12.0011 22C11.3978 22 10.8182 21.773 10.3845 21.367C6.41302 17.626 1.09076 13.4469 3.68627 7.37966C5.08963 4.09916 8.45834 2 12.0011 2C15.5439 2 18.9126 4.09916 20.316 7.37966C22.9082 13.4393 17.599 17.6389 13.6177 21.367Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M15.5 11C15.5 12.933 13.933 14.5 12 14.5C10.067 14.5 8.5 12.933 8.5 11C8.5 9.067 10.067 7.5 12 7.5C13.933 7.5 15.5 9.067 15.5 11Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/>",
  "Lock": "<path d=\"M4.26781 18.8447C4.49269 20.515 5.87613 21.8235 7.55966 21.9009C8.97627 21.966 10.4153 22 12 22C13.5847 22 15.0237 21.966 16.4403 21.9009C18.1239 21.8235 19.5073 20.515 19.7322 18.8447C19.879 17.7547 20 16.6376 20 15.5C20 14.3624 19.879 13.2453 19.7322 12.1553C19.5073 10.485 18.1239 9.17649 16.4403 9.09909C15.0237 9.03397 13.5847 9 12 9C10.4153 9 8.97627 9.03397 7.55966 9.09909C5.87613 9.17649 4.49269 10.485 4.26781 12.1553C4.12105 13.2453 4 14.3624 4 15.5C4 16.6376 4.12105 17.7547 4.26781 18.8447Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M7.5 9V6.5C7.5 4.01472 9.51472 2 12 2C14.4853 2 16.5 4.01472 16.5 6.5V9\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12.125 15.5H12M12.25 15.5C12.25 15.6381 12.1381 15.75 12 15.75C11.8619 15.75 11.75 15.6381 11.75 15.5C11.75 15.3619 11.8619 15.25 12 15.25C12.1381 15.25 12.25 15.3619 12.25 15.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M8.125 15.5H8M8.25 15.5C8.25 15.6381 8.13807 15.75 8 15.75C7.86193 15.75 7.75 15.6381 7.75 15.5C7.75 15.3619 7.86193 15.25 8 15.25C8.13807 15.25 8.25 15.3619 8.25 15.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M16.125 15.5H16M16.25 15.5C16.25 15.6381 16.1381 15.75 16 15.75C15.8619 15.75 15.75 15.6381 15.75 15.5C15.75 15.3619 15.8619 15.25 16 15.25C16.1381 15.25 16.25 15.3619 16.25 15.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "MagnifyingGlass": "<path d=\"M17 17L21 21\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19C15.4183 19 19 15.4183 19 11Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Microphone": "<path d=\"M7 6.5C7 4.01472 9.01472 2 11.5 2C13.9853 2 16 4.01472 16 6.5V11.5C16 13.9853 13.9853 16 11.5 16C9.01472 16 7 13.9853 7 11.5V6.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M11.5 19H11.0828C7.57267 19 4.57706 16.4623 4 13M11.5 19H11.9172C15.4273 19 18.4229 16.4623 19 13M11.5 19V22\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "MicrophoneSlash": "<path d=\"M8.1572 4.1572C8.94761 2.86349 10.373 2 12 2C14.4853 2 16.5 4.01472 16.5 6.5V11.5C16.5 11.8111 16.4684 12.1149 16.4083 12.4083M7.5 7.5V11.5C7.5 13.9853 9.51472 16 12 16C13.1154 16 14.136 15.5942 14.9222 14.9222\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M2 2L22 22\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12 19H11.5828C8.07267 19 5.07706 16.4623 4.5 13M12 19H12.4172C14.2325 19 15.9102 18.3213 17.1869 17.1869M12 19V22M19.5 13C19.3878 13.6733 19.1841 14.3116 18.903 14.903\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Note": "<path d=\"M12.8809 7.01656L17.6538 8.28825M11.8578 10.8134L14.2442 11.4492M11.9765 17.9664L12.9311 18.2208C15.631 18.9401 16.981 19.2998 18.0445 18.6893C19.108 18.0787 19.4698 16.7363 20.1932 14.0516L21.2163 10.2548C21.9398 7.57005 22.3015 6.22768 21.6875 5.17016C21.0735 4.11264 19.7235 3.75295 17.0235 3.03358L16.0689 2.77924C13.369 2.05986 12.019 1.70018 10.9555 2.31074C9.89196 2.9213 9.53023 4.26367 8.80678 6.94841L7.78366 10.7452C7.0602 13.4299 6.69848 14.7723 7.3125 15.8298C7.92652 16.8874 9.27651 17.2471 11.9765 17.9664Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M12 20.9462L11.0477 21.2055C8.35403 21.939 7.00722 22.3057 5.94619 21.6832C4.88517 21.0607 4.52429 19.692 3.80253 16.9546L2.78182 13.0833C2.06006 10.3459 1.69918 8.97718 2.31177 7.89892C2.84167 6.96619 4 7.00015 5.5 7.00003\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/>",
  "NotePencil": "<path d=\"M15.5 2V5M6.5 2V5M11 2V5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M19 12V10.5C19 7.20017 19 5.55025 17.9749 4.52512C16.9497 3.5 15.2998 3.5 12 3.5H10C6.70017 3.5 5.05025 3.5 4.02513 4.52513C3 5.55025 3 7.20017 3 10.5V15C3 18.2998 3 19.9497 4.02513 20.9749C5.05025 22 6.70017 22 10 22H11\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M7 15H11M7 11H15\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M15.7367 21.6527L14 22L14.3473 20.2633C14.4179 19.9106 14.5913 19.5866 14.8456 19.3323L18.9111 15.2668C19.2668 14.9111 19.8437 14.9111 20.1995 15.2668L20.7332 15.8005C21.0889 16.1563 21.0889 16.7332 20.7332 17.0889L16.6677 21.1544C16.4134 21.4087 16.0894 21.5821 15.7367 21.6527Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Pause": "<path d=\"M4 7C4 5.58579 4 4.87868 4.43934 4.43934C4.87868 4 5.58579 4 7 4C8.41421 4 9.12132 4 9.56066 4.43934C10 4.87868 10 5.58579 10 7V17C10 18.4142 10 19.1213 9.56066 19.5607C9.12132 20 8.41421 20 7 20C5.58579 20 4.87868 20 4.43934 19.5607C4 19.1213 4 18.4142 4 17V7Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M14 7C14 5.58579 14 4.87868 14.4393 4.43934C14.8787 4 15.5858 4 17 4C18.4142 4 19.1213 4 19.5607 4.43934C20 4.87868 20 5.58579 20 7V17C20 18.4142 20 19.1213 19.5607 19.5607C19.1213 20 18.4142 20 17 20C15.5858 20 14.8787 20 14.4393 19.5607C14 19.1213 14 18.4142 14 17V7Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/>",
  "Pencil": "<path d=\"M6 22V13.6944C6 12.1287 6 11.3459 6.21454 10.6077C6.42908 9.86948 6.84589 9.21812 7.6795 7.91542L10.3359 3.76419C11.0885 2.58806 11.4648 2 12 2C12.5352 2 12.9115 2.58806 13.6641 3.76419L16.3205 7.91542C17.1541 9.21812 17.5709 9.86948 17.7855 10.6077C18 11.3459 18 12.1287 18 13.6944V22\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M7 11C7.63152 11.3231 8.4887 11.9732 9.28009 11.9991C10.2988 12.0324 10.9868 11.1372 12 11.1372C13.0132 11.1372 13.7012 12.0324 14.7199 11.9991C15.5113 11.9732 16.3685 11.3231 17 11\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12 12L12 22\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M10 5H14\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "PictureInPicture": "<path d=\"M9.49286 20H6.99286C6.06355 20 5.59889 20 5.2125 19.9231C3.62574 19.6075 2.38534 18.3671 2.06972 16.7804C1.99286 16.394 1.99286 15.9293 1.99286 15\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12.9929 4H15.4928C17.8274 4 18.9947 4 19.8783 4.47231C20.5761 4.84525 21.1475 5.4167 21.5204 6.11441C21.9928 6.99805 21.9928 8.16537 21.9928 10.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M1.99286 4L8.47716 10.4845\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M8.69686 6C8.80609 7.25534 9.3155 10.0469 8.67762 10.6848C8.03974 11.3226 5.2482 10.8132 3.99286 10.704\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M20.4929 14H15.4929C14.6644 14 13.9929 14.6716 13.9929 15.5V18.5C13.9929 19.3284 14.6644 20 15.4929 20H20.4929C21.3213 20 21.9929 19.3284 21.9929 18.5V15.5C21.9929 14.6716 21.3213 14 20.4929 14Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/>",
  "Play": "<path d=\"M18.8906 12.846C18.5371 14.189 16.8667 15.138 13.5257 17.0361C10.296 18.8709 8.6812 19.7884 7.37983 19.4196C6.8418 19.2671 6.35159 18.9776 5.95624 18.5787C5 17.6139 5 15.7426 5 12C5 8.2574 5 6.3861 5.95624 5.42132C6.35159 5.02245 6.8418 4.73288 7.37983 4.58042C8.6812 4.21165 10.296 5.12907 13.5257 6.96393C16.8667 8.86197 18.5371 9.811 18.8906 11.154C19.0365 11.7084 19.0365 12.2916 18.8906 12.846Z\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Plus": "<path d=\"M11.9922 4.00012V20.0001M19.9922 12.0001H3.99222\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "ShieldCheck": "<path d=\"M20.9922 11.1833V8.28029C20.9922 6.64029 20.9922 5.82028 20.5881 5.28529C20.184 4.75029 19.2703 4.49056 17.4429 3.9711C16.1944 3.6162 15.0938 3.18863 14.2145 2.79829C13.0156 2.2661 12.4161 2 11.9922 2C11.5682 2 10.9688 2.2661 9.7699 2.79829C8.89057 3.18863 7.79002 3.61619 6.54152 3.9711C4.71411 4.49056 3.80041 4.75029 3.3963 5.28529C2.99219 5.82028 2.99219 6.64029 2.99219 8.28029V11.1833C2.99219 16.8085 8.05496 20.1835 10.5861 21.5194C11.1932 21.8398 11.4968 22 11.9922 22C12.4876 22 12.7911 21.8398 13.3982 21.5194C15.9294 20.1835 20.9922 16.8085 20.9922 11.1833Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M8.49219 11.8333C8.49219 11.8333 9.36719 11.8333 10.2422 13.5C10.2422 13.5 13.0216 9.33333 15.4922 8.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Sparkle": "<path d=\"M10.5279 7.13967C11.3077 5.71322 11.6977 5 11.9958 5C12.294 5 12.6839 5.71322 13.4638 7.13967C14.2665 8.60787 15.3392 9.69316 16.8489 10.52C18.2778 11.3026 18.9922 11.6938 18.9922 11.9923C18.9922 12.2908 18.2773 12.6825 16.8475 13.4658C15.3808 14.2693 14.2966 15.3432 13.4706 16.8545C12.6889 18.2848 12.298 19 11.9998 19C11.7017 19 11.3104 18.2844 10.5279 16.853C9.7252 15.3848 8.65247 14.2995 7.14272 13.4727C5.70903 12.6875 4.99219 12.2949 4.99219 11.9964C4.99219 11.6978 5.70903 11.3052 7.14272 10.52C8.65247 9.69316 9.7252 8.60787 10.5279 7.13967Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "SpeakerHigh": "<path d=\"M14 14.8135V9.18646C14 6.04126 14 4.46866 13.0747 4.0773C12.1494 3.68593 11.0603 4.79793 8.88232 7.02192C7.75439 8.17365 7.11085 8.42869 5.50604 8.42869C4.10257 8.42869 3.40084 8.42869 2.89675 8.77262C1.85035 9.48655 2.00852 10.882 2.00852 12C2.00852 13.118 1.85035 14.5134 2.89675 15.2274C3.40084 15.5713 4.10257 15.5713 5.50604 15.5713C7.11085 15.5713 7.75439 15.8264 8.88232 16.9781C11.0603 19.2021 12.1494 20.3141 13.0747 19.9227C14 19.5313 14 17.9587 14 14.8135Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M17 9C17.6254 9.81968 18 10.8634 18 12C18 13.1366 17.6254 14.1803 17 15\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M20 7C21.2508 8.36613 22 10.1057 22 12C22 13.8943 21.2508 15.6339 20 17\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "SpeakerX": "<path d=\"M14 14.8135V9.18646C14 6.04126 14 4.46866 13.0747 4.0773C12.1494 3.68593 11.0603 4.79793 8.88232 7.02192C7.75439 8.17365 7.11085 8.42869 5.50604 8.42869C4.10257 8.42869 3.40084 8.42869 2.89675 8.77262C1.85035 9.48655 2.00852 10.882 2.00852 12C2.00852 13.118 1.85035 14.5134 2.89675 15.2274C3.40084 15.5713 4.10257 15.5713 5.50604 15.5713C7.11085 15.5713 7.75439 15.8264 8.88232 16.9781C11.0603 19.2021 12.1494 20.3141 13.0747 19.9227C14 19.5313 14 17.9587 14 14.8135Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M18 10L22 14M18 14L22 10\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/>",
  "Sun": "<path d=\"M16.9991 12C16.9991 14.7614 14.7605 17 11.9991 17C9.23766 17 6.99908 14.7614 6.99908 12C6.99908 9.23858 9.23766 7 11.9991 7C14.7605 7 16.9991 9.23858 16.9991 12Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12.1247 3.25H11.9997M12.1242 20.75H11.9992M20.75 12.125V12M3.25 12.125V12M18.2752 5.90098L18.1868 5.81259M5.90051 18.275L5.81212 18.1866M18.0987 18.2756L18.187 18.1872M5.72429 5.9012L5.81267 5.81282M12.2497 3.25C12.2497 3.38807 12.1378 3.5 11.9997 3.5C11.8616 3.5 11.7497 3.38807 11.7497 3.25C11.7497 3.11193 11.8616 3 11.9997 3C12.1378 3 12.2497 3.11193 12.2497 3.25ZM12.2492 20.75C12.2492 20.8881 12.1373 21 11.9992 21C11.8611 21 11.7492 20.8881 11.7492 20.75C11.7492 20.6119 11.8611 20.5 11.9992 20.5C12.1373 20.5 12.2492 20.6119 12.2492 20.75ZM20.75 12.25C20.6119 12.25 20.5 12.1381 20.5 12C20.5 11.8619 20.6119 11.75 20.75 11.75C20.8881 11.75 21 11.8619 21 12C21 12.1381 20.8881 12.25 20.75 12.25ZM3.25 12.25C3.11193 12.25 3 12.1381 3 12C3 11.8619 3.11193 11.75 3.25 11.75C3.38807 11.75 3.5 11.8619 3.5 12C3.5 12.1381 3.38807 12.25 3.25 12.25ZM18.3636 5.98937C18.266 6.087 18.1077 6.087 18.01 5.98937C17.9124 5.89174 17.9124 5.73345 18.01 5.63582C18.1077 5.53819 18.266 5.53819 18.3636 5.63582C18.4612 5.73345 18.4612 5.89174 18.3636 5.98937ZM5.9889 18.3634C5.89127 18.461 5.73297 18.461 5.63534 18.3634C5.53771 18.2658 5.53771 18.1075 5.63534 18.0099C5.73297 17.9122 5.89127 17.9122 5.9889 18.0099C6.08653 18.1075 6.08653 18.2658 5.9889 18.3634ZM18.0103 18.364C17.9126 18.2663 17.9126 18.108 18.0103 18.0104C18.1079 17.9128 18.2662 17.9128 18.3638 18.0104C18.4614 18.108 18.4614 18.2663 18.3638 18.364C18.2662 18.4616 18.1079 18.4616 18.0103 18.364ZM5.6359 5.98959C5.53827 5.89196 5.53827 5.73367 5.6359 5.63604C5.73353 5.53841 5.89182 5.53841 5.98945 5.63604C6.08708 5.73367 6.08708 5.89196 5.98945 5.98959C5.89182 6.08722 5.73353 6.08722 5.6359 5.98959Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Trash": "<path d=\"M18.8516 16.3743L19.5 6H4.5L5.14839 16.3743C5.315 19.0401 5.39831 20.373 6.26426 21.1865C7.13021 22 8.46571 22 11.1367 22H12.8633C15.5343 22 16.8698 22 17.7357 21.1865C18.6017 20.373 18.685 19.0401 18.8516 16.3743Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M15.5 6H21M15.5 6L15.3721 4.97683C15.1595 3.2762 13.7139 2 12 2C10.2861 2 8.84047 3.2762 8.6279 4.97683L8.5 6M15.5 6H8.5M3 6H8.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M9.5 11V17M14.5 11V17\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "User": "<path d=\"M20 21.0001C19.713 17.269 16.7289 14.3151 12.995 14.0662L12 13.9999C11.6446 14.0096 11.3134 14.0225 11.0008 14.0378C7.3 14.2192 4.28417 17.3057 4 21.0001\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><circle cx=\"12\" cy=\"6.99988\" r=\"4\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Users": "<path d=\"M16.5 20V16.9852C16.5 16.364 16.2184 15.7658 15.6838 15.4494C14.1574 14.546 12.1714 14 10 14C7.82863 14 5.84261 14.546 4.31618 15.4494C3.78162 15.7658 3.5 16.364 3.5 16.9852V20\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><circle cx=\"10\" cy=\"7.5\" r=\"3.5\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M20.5 20.001V16.9862C20.5 16.365 20.2184 15.7667 19.6838 15.4504C19.171 15.1468 18.6062 14.8837 18 14.668\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M15 4.14453C16.4457 4.57481 17.5 5.91408 17.5 7.49959C17.5 9.0851 16.4457 10.4244 15 10.8547\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/>",
  "VideoCamera": "<path d=\"M2 11C2 7.70017 2 6.05025 3.02513 5.02513C4.05025 4 5.70017 4 9 4H10C13.2998 4 14.9497 4 15.9749 5.02513C17 6.05025 17 7.70017 17 11V13C17 16.2998 17 17.9497 15.9749 18.9749C14.9497 20 13.2998 20 10 20H9C5.70017 20 4.05025 20 3.02513 18.9749C2 17.9497 2 16.2998 2 13V11Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M17 8.90585L17.1259 8.80196C19.2417 7.05623 20.2996 6.18336 21.1498 6.60482C22 7.02628 22 8.42355 22 11.2181V12.7819C22 15.5765 22 16.9737 21.1498 17.3952C20.2996 17.8166 19.2417 16.9438 17.1259 15.198L17 15.0941\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><circle cx=\"11.5\" cy=\"9.5\" r=\"1.5\" stroke=\"currentColor\" stroke-width=\"1.5\"/>",
  "Warning": "<path d=\"M13.9248 21H10.0752C5.44476 21 3.12955 21 2.27636 19.4939C1.42317 17.9879 2.60736 15.9914 4.97574 11.9985L6.90057 8.75333C9.17559 4.91778 10.3131 3 12 3C13.6869 3 14.8244 4.91777 17.0994 8.75332L19.0243 11.9985C21.3926 15.9914 22.5768 17.9879 21.7236 19.4939C20.8704 21 18.5552 21 13.9248 21Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12 9V13\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12.125 16.75H12M12.25 16.75C12.25 16.8881 12.1381 17 12 17C11.8619 17 11.75 16.8881 11.75 16.75C11.75 16.6119 11.8619 16.5 12 16.5C12.1381 16.5 12.25 16.6119 12.25 16.75Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "WarningCircle": "<circle cx=\"12\" cy=\"12\" r=\"10\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12 8V12\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12.125 15.75H12M12.25 15.75C12.25 15.8881 12.1381 16 12 16C11.8619 16 11.75 15.8881 11.75 15.75C11.75 15.6119 11.8619 15.5 12 15.5C12.1381 15.5 12.25 15.6119 12.25 15.75Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Waveform": "<path d=\"M22 14H21.7276C21.348 14 21.1582 14 20.9963 13.9637C20.495 13.8514 20.086 13.4904 19.9124 13.0069C19.8563 12.8507 19.8328 12.6624 19.7857 12.2857L19.6225 10.98C19.5525 10.4201 19.0766 10 18.5124 10C17.9377 10 17.4564 10.4355 17.3993 11.0074L16.5992 19.0081C16.5429 19.5712 16.069 20 15.5031 20C14.9346 20 14.4594 19.5673 14.4064 19.0013L13.0933 4.99563C13.0404 4.43134 12.5668 4 12 4C11.4332 4 10.9596 4.43134 10.9067 4.99564L9.59363 19.0013C9.54056 19.5673 9.06543 20 8.49689 20C7.93097 20 7.45712 19.5712 7.40081 19.0081L6.60074 11.0074C6.54355 10.4355 6.06232 10 5.48758 10C4.92339 10 4.44749 10.4201 4.37751 10.98L4.21429 12.2857C4.1672 12.6624 4.14366 12.8507 4.08759 13.0069C3.91398 13.4904 3.50501 13.8514 3.00369 13.9637C2.84176 14 2.65197 14 2.27237 14H2\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "X": "<path d=\"M18 6L12 12M12 12L6 18M12 12L18 18M12 12L6 6\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>"
};

// Formate un message ICU simple de messages.po : {nom} et
// {n, plural, one {…} other {…}}.
const synFormat = (message, values = {}) =>
  message
    .replace(
      /\{(\w+), plural, ((?:[^{}]|\{[^{}]*\})*)\}/g,
      (_, key, cases) => {
        const n = Number(values[key]);
        const pick = (name) => cases.match(new RegExp(`(?:^|\\s)${name} \\{([^{}]*)\\}`));
        const chosen = (n === 0 && pick("=0")) || (n === 1 && pick("one")) || pick("other");
        return chosen ? chosen[1].replace(/#/g, String(n)) : "";
      },
    )
    .replace(/\{(\w+)\}/g, (all, key) => (key in values ? String(values[key]) : all));

const L = (id) => SYN_LABELS[id] ?? id;
const LP = (id, n, values = {}) => synFormat(L(id), { ...values, 0: n, count: n });
const LF = (id, values) => synFormat(L(id), values);
const I = (name) => name;

// Composants internes : h(SynIcon, { name: I("X") }), h(SynFigure, { … }, <div>…</div>),
// jamais de balise JSX à leur nom. Mintlify découpe le snippet selon les imports de
// la page et ne résout une balise JSX que dans son propre morceau : un
// composant partagé entre deux imports y serait introuvable. Le générateur
// refuse donc toute balise <Syn…>.
const h = (type, props, ...children) => React.createElement(type, props, ...children);

const synVars = (tokens) =>
  Object.entries(tokens)
    .map(([name, value]) => `--syn-${name}:${value};`)
    .join("");

const SYN_CSS = `
.syn-root{${synVars(SYN_LIGHT)}font-family:Geist,system-ui,sans-serif;color:var(--syn-foreground);font-size:14px;line-height:1.55}
html.dark .syn-root{${synVars(SYN_DARK)}}
.syn-root *{box-sizing:border-box}
.syn-root :is(h1,h2,h3,h4,h5,p,ul,ol,dl){font-family:inherit;letter-spacing:normal}
.syn-root :is(button,input,select,textarea,[tabindex]):focus-visible{outline:2px solid var(--syn-ring);outline-offset:2px}
.syn-figure{margin:20px 0;border:1px solid var(--syn-border);border-radius:14px;background:var(--syn-muted);padding:12px}
.syn-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:10px;font-size:13px;color:var(--syn-muted-foreground)}
.syn-badge{display:inline-flex;gap:6px;align-items:center;background:var(--syn-accent);color:var(--syn-accent-foreground);border-radius:999px;padding:3px 10px;font-weight:500}
.syn-bar-actions{margin-left:auto;display:flex;gap:12px;align-items:center}
.syn-link{border:0;background:none;padding:4px 2px;font:inherit;color:var(--syn-primary);cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.syn-check{display:inline-flex;gap:6px;align-items:center;cursor:pointer;color:var(--syn-foreground)}
.syn-check input{accent-color:var(--syn-primary);width:16px;height:16px;margin:0}
.syn-stage{position:relative;width:100%;overflow:hidden}
.syn-window{transform-origin:top left;position:relative;border:1px solid var(--syn-input);border-radius:10px;background:var(--syn-background);overflow:hidden}
.syn-titlebar{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--syn-border);background:var(--syn-muted);font-size:12px;color:var(--syn-muted-foreground)}
.syn-titlebar strong{color:var(--syn-foreground);font-weight:500}
.syn-hs{position:absolute;z-index:5;width:22px;height:22px;border-radius:999px;background:var(--syn-recording);color:var(--syn-background);font:600 12px/22px Geist,system-ui,sans-serif;text-align:center;box-shadow:0 0 0 3px color-mix(in srgb,var(--syn-recording) 25%,transparent);pointer-events:none}
.syn-here{position:relative;border:2px solid var(--syn-primary);border-radius:12px;padding:14px 16px;box-shadow:0 0 0 5px color-mix(in srgb,var(--syn-primary) 14%,transparent)}
.syn-here-tag{position:absolute;top:-11px;right:14px;background:var(--syn-primary);color:var(--syn-primary-foreground);font-size:11px;font-weight:600;border-radius:999px;padding:2px 9px}
.syn-path{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:16px 0;border:1px solid var(--syn-border);border-radius:12px;background:var(--syn-card);padding:12px 14px}
.syn-path ol{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0;padding:0;list-style:none}
.syn-path li{display:flex;gap:6px;align-items:center;margin:0}
.syn-path li span{background:var(--syn-muted);border-radius:6px;padding:2px 8px}
.syn-path li[aria-current] span{background:var(--syn-accent);color:var(--syn-accent-foreground);font-weight:500}
.syn-kbd{display:inline-flex;gap:3px;align-items:center;vertical-align:baseline}
.syn-kbd kbd{display:inline-block;min-width:18px;padding:0 6px;border:1px solid var(--syn-input);border-bottom-width:2px;border-radius:5px;background:var(--syn-card);font:500 12px/18px Geist,system-ui,sans-serif;color:var(--syn-foreground);text-align:center}
.syn-h1{margin:0;font:500 30px/1.15 Newsreader,Georgia,serif;color:var(--syn-foreground)}
.syn-lede{margin:6px 0 0;color:var(--syn-muted-foreground)}
.syn-h2{margin:0 0 12px;font-size:17px;font-weight:600}
.syn-muted{color:var(--syn-muted-foreground)}
.syn-small{font-size:12px}
.syn-ui-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:34px;border:1px solid var(--syn-input);border-radius:8px;background:var(--syn-card);color:var(--syn-foreground);padding:6px 12px;font:500 13px/1.2 Geist,system-ui,sans-serif;cursor:pointer}
.syn-ui-btn:hover{background:var(--syn-muted)}
.syn-ui-btn[data-variant=primary]{background:var(--syn-primary);border-color:var(--syn-primary);color:var(--syn-primary-foreground)}
.syn-ui-btn[data-variant=ghost]{border-color:transparent;background:transparent}
.syn-ui-btn[data-variant=ghost]:hover{background:var(--syn-muted)}
.syn-ui-btn[data-variant=danger]{color:var(--syn-destructive)}
.syn-ui-btn:disabled{opacity:.5;cursor:default}
.syn-icon-btn{display:grid;place-items:center;width:30px;height:30px;border:0;border-radius:7px;background:transparent;color:var(--syn-muted-foreground);cursor:pointer}
.syn-icon-btn:hover,.syn-icon-btn[aria-expanded=true]{background:var(--syn-muted);color:var(--syn-foreground)}
.syn-input,.syn-select{width:100%;min-height:36px;border:1px solid var(--syn-input);border-radius:8px;background:var(--syn-card);color:var(--syn-foreground);padding:6px 10px;font:400 13px/1.3 Geist,system-ui,sans-serif}
.syn-input::placeholder{color:var(--syn-faint)}
.syn-switch{position:relative;flex-shrink:0;width:36px;height:20px;border:0;border-radius:999px;background:var(--syn-input);cursor:pointer;padding:0}
.syn-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:999px;background:var(--syn-card);transition:transform 150ms}
.syn-switch[aria-checked=true]{background:var(--syn-primary)}
.syn-switch[aria-checked=true]::after{transform:translateX(16px)}
.syn-rows{display:flex;flex-direction:column;border-top:1px solid var(--syn-border)}
.syn-row{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 0;border-bottom:1px solid var(--syn-border)}
.syn-row-text{min-width:0;flex:1}
.syn-row-title{margin:0;font-size:15px;font-weight:500}
.syn-row-desc{margin:2px 0 0;font-size:13px;color:var(--syn-muted-foreground)}
.syn-row-control{flex:0 0 240px;min-width:0}
.syn-menu{position:absolute;z-index:20;min-width:220px;margin:0;padding:4px;list-style:none;border:1px solid var(--syn-border);border-radius:10px;background:var(--syn-popover);box-shadow:var(--syn-shadow-capsule)}
.syn-menu [role=menuitem]{display:flex;align-items:center;gap:8px;width:100%;border:0;border-radius:6px;background:transparent;color:var(--syn-foreground);padding:7px 9px;font:400 13px/1.3 Geist,system-ui,sans-serif;text-align:left;cursor:pointer}
.syn-menu [role=menuitem]:hover,.syn-menu [role=menuitem]:focus-visible{background:var(--syn-muted);outline:none}
.syn-menu [role=menuitem][aria-disabled=true]{opacity:.5;cursor:default}
.syn-menu [role=menuitem] .syn-menu-hint{margin-left:auto;font-size:11px;color:var(--syn-muted-foreground)}
.syn-menu [role=separator]{height:1px;margin:4px 6px;background:var(--syn-border)}
.syn-menu-label{padding:6px 9px 2px;font-size:11px;font-weight:600;color:var(--syn-faint);text-transform:uppercase;letter-spacing:.06em}
.syn-chip{display:inline-flex;align-items:center;gap:4px;background:var(--syn-accent);color:var(--syn-accent-foreground);border-radius:6px;padding:1px 8px;font-size:13px}
.syn-pip{display:inline-block;width:7px;height:7px;flex-shrink:0;border-radius:999px;background:var(--syn-primary)}
.syn-pip[data-tone=ko]{background:var(--syn-destructive)}
.syn-pip[data-tone=idle]{background:transparent;border:1px solid var(--syn-faint)}
.syn-dialog{position:absolute;z-index:30;left:50%;top:14%;transform:translateX(-50%);width:min(520px,90%);border:1px solid var(--syn-border);border-radius:16px;background:var(--syn-popover);box-shadow:var(--syn-shadow-capsule)}
.syn-scrim{position:absolute;inset:0;z-index:25;background:color-mix(in srgb,var(--syn-background) 45%,transparent)}
@media (prefers-reduced-motion:reduce){.syn-root *{transition:none!important;animation:none!important}}
`;

const synCssParts = () => [SYN_CSS_NOTE, SYN_CSS_SETTINGS, SYN_CSS_MEETINGS, SYN_CSS_SERVERS, SYN_CSS_PROFILE, SYN_CSS_DICTATION_SETTINGS, SYN_CSS_PRIVACY, SYN_CSS_PALETTE, SYN_CSS_CHAT, SYN_CSS_AUTOMATIONS, SYN_CSS_TROUBLESHOOTING];

const SynStyle = () => <style>{SYN_CSS + synCssParts().join("")}</style>;

const SynIcon = ({ name, size = 16, style }) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    style={Object.assign({ flexShrink: 0 }, style)}
    dangerouslySetInnerHTML={{ __html: SYN_ICONS[name] ?? "" }}
  />
);

/** Repère numéroté posé sur l'écran (pastille rouge), repris dans le texte. */
const SynHotspot = ({ n, style }) => (
  <span className="syn-hs" aria-hidden="true" style={style}>{n}</span>
);

/** Encadré « You are here » : la section que décrit la page. */
const SynHere = ({ active = true, children, style }) =>
  active ? (
    <div className="syn-here" style={style}>
      <span className="syn-here-tag">You are here</span>
      {children}
    </div>
  ) : (
    <div style={style}>{children}</div>
  );

const SynToolbar = ({ markers, setMarkers, onReset }) => (
  <div className="syn-bar">
    <span className="syn-badge">
      {h(SynIcon, { name: I("Play"), size: 14 })}
      Interactive replica · Syntheo {SYN_VERSION}
    </span>
    <span className="syn-bar-actions">
      {setMarkers ? (
        <label className="syn-check">
          <input type="checkbox" checked={markers} onChange={(e) => setMarkers(e.target.checked)} />
          Show markers
        </label>
      ) : null}
      {onReset ? <button type="button" className="syn-link" onClick={onReset}>Start over</button> : null}
    </span>
  </div>
);

// L'écran est mis en page à sa largeur réelle puis réduit pour tenir dans la
// colonne de la doc, comme une capture d'écran vivante.
const SYN_WINDOW_WIDTH = 860;

const useSynScale = (width = SYN_WINDOW_WIDTH) => {
  const stageRef = useRef(null);
  const windowRef = useRef(null);
  const [box, setBox] = useState({ scale: 1, height: undefined });
  useEffect(() => {
    const stage = stageRef.current;
    const win = windowRef.current;
    if (!stage || !win || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const scale = Math.min(1, stage.clientWidth / width);
      setBox({ scale, height: Math.ceil(win.offsetHeight * scale) });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(win);
    measure();
    return () => observer.disconnect();
  }, [width]);
  return [stageRef, windowRef, box.scale, box.height];
};

/**
 * Cadre commun : badge, repères, « Recommencer », puis une fenêtre de l'app
 * mise à l'échelle. `title` absent : pas de barre de titre. `bare` : pas de
 * fenêtre (contenu posé sur le fond, ex. bureau, pastille).
 */
const SynFigure = ({ title, width = SYN_WINDOW_WIDTH, markers, setMarkers, onReset, bare = false, children }) => {
  const [stageRef, windowRef, scale, height] = useSynScale(width);
  return (
    <figure className="syn-root syn-figure not-prose">
      {h(SynStyle)}
      {h(SynToolbar, { markers, setMarkers, onReset })}
      <div className="syn-stage" ref={stageRef} style={{ height }}>
        <div
          className={bare ? undefined : "syn-window"}
          ref={windowRef}
          style={{ width, transform: `scale(${scale})`, transformOrigin: "top left", position: "relative" }}
        >
          {title ? (
            <div className="syn-titlebar">
              <strong>{title}</strong>
              <span>· Syntheo</span>
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </figure>
  );
};

/** Interrupteur accessible (role="switch"), comme @syntheo/ui Switch. */
const SynSwitch = ({ checked, onChange, label, labelledBy, describedBy, disabled }) => (
  <button
    type="button"
    role="switch"
    className="syn-switch"
    aria-checked={checked}
    aria-label={label}
    aria-labelledby={labelledBy}
    aria-describedby={describedBy}
    disabled={disabled}
    onClick={() => onChange && onChange(!checked)}
  />
);

/** Ligne de réglage « libellé à gauche, réglage à droite » (settings/setting-row.tsx). */
const SynRow = ({ title, description, children, wide = false }) => {
  const id = useId();
  return (
    <div className="syn-row">
      <div className="syn-row-text">
        <h3 className="syn-row-title" id={`${id}-t`}>{title}</h3>
        {description ? <p className="syn-row-desc" id={`${id}-d`}>{description}</p> : null}
      </div>
      <div className="syn-row-control" style={wide ? { flexBasis: 300 } : { flexBasis: "auto" }}>
        {children({ "aria-labelledby": `${id}-t`, "aria-describedby": description ? `${id}-d` : undefined })}
      </div>
    </div>
  );
};

/** Ligne avec interrupteur (SettingSwitchRow). */
const SynSwitchRow = ({ title, description, checked, onChange, initial = false }) => {
  const [local, setLocal] = useState(initial);
  const value = checked ?? local;
  return h(SynRow, {
    title,
    description,
    children: (labels) =>
      h(SynSwitch, {
        checked: value,
        onChange: onChange ?? setLocal,
        labelledBy: labels["aria-labelledby"],
        describedBy: labels["aria-describedby"],
      }),
  });
};

/**
 * Menu déroulant au clavier : Entrée/Espace/↓ ouvre, ↑↓ parcourt, Échap
 * ferme et rend le focus au bouton. items : [{ label, icon, hint, onSelect,
 * disabled } | { separator: true } | { heading }].
 */
const SynMenuButton = ({ label, icon = I("DotsThree"), items, align = "right", buttonClassName = "syn-icon-btn", children }) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  useEffect(() => {
    if (open) menuRef.current?.querySelector('[role=menuitem]:not([aria-disabled=true])')?.focus();
  }, [open]);
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const onKeyDown = (e) => {
    const list = [...(menuRef.current?.querySelectorAll('[role=menuitem]:not([aria-disabled=true])') ?? [])];
    const index = list.indexOf(document.activeElement);
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (index + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
      list[next]?.focus();
    }
  };
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        aria-label={children ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children ?? h(SynIcon, { name: icon })}
      </button>
      {open ? (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="syn-menu"
          style={{ top: "calc(100% + 4px)", [align]: 0 }}
          onKeyDown={onKeyDown}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget) && e.relatedTarget !== buttonRef.current) setOpen(false);
          }}
        >
          {items.map((item, index) =>
            item.separator ? (
              <li key={index} role="separator" />
            ) : item.heading ? (
              <li key={index} role="presentation" className="syn-menu-label">{item.heading}</li>
            ) : (
              <li key={index} role="none">
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={item.disabled ? true : undefined}
                  onClick={() => {
                    if (item.disabled) return;
                    close();
                    item.onSelect?.();
                  }}
                >
                  {item.icon ? h(SynIcon, { name: item.icon }) : null}
                  <span>{item.label}</span>
                  {item.hint ? <span className="syn-menu-hint">{item.hint}</span> : null}
                </button>
              </li>
            ),
          )}
        </ul>
      ) : null}
    </span>
  );
};

/** Chemin dans l'app : <SettingsPath steps={["Paramètres", "Mes réunions", "Réunions", "Audio"]} />. */
export const SettingsPath = ({ steps = [] }) => (
  <nav className="syn-root syn-path not-prose" aria-label="Path in the app">
    <style>{SYN_CSS}</style>
    {h(SynIcon, { name: I("Location"), size: 18 })}
    <ol>
      {steps.map((step, index) => (
        <li key={step} aria-current={index === steps.length - 1 ? "location" : undefined}>
          {index > 0 ? <span aria-hidden="true" style={{ background: "none", padding: 0 }}>›</span> : null}
          <span>{step}</span>
        </li>
      ))}
    </ol>
  </nav>
);

/** Raccourci clavier : <Kbd keys="Ctrl+Maj+N" />. */
export const Kbd = ({ keys = "" }) => (
  <span className="syn-root syn-kbd">
    <style>{SYN_CSS}</style>
    {keys.split("+").map((key, index) => (
      <span key={index} style={{ display: "contents" }}>
        {index > 0 ? <span aria-hidden="true">+</span> : null}
        <kbd>{key}</kbd>
      </span>
    ))}
  </span>
);

// Fenêtre de note et capsule (備 Préparer · 聴 Écouter · 結 Synthèse), partagées
// par les écrans qui montrent une note. Reproduit
// apps/desktop/src/session/components/capsule/index.tsx.

const SYN_CSS_NOTE = `
.syn-body{display:flex;min-height:340px}
.syn-doc{flex:1 1 auto;min-width:0;padding:22px 28px 92px}
.syn-title{margin:0 0 14px;font:500 24px/1.2 Newsreader,Georgia,serif;color:var(--syn-foreground)}
.syn-fiche{display:grid;grid-template-columns:110px minmax(0,1fr);gap:7px 12px;margin:0 0 16px;font-size:13.5px}
.syn-fiche dt{color:var(--syn-muted-foreground)}
.syn-fiche dd{margin:0}
.syn-hint{margin:0;color:var(--syn-muted-foreground)}
.syn-notes{margin:0;padding-left:18px;color:var(--syn-user-ink)}
.syn-margin{flex:0 0 230px;border-left:1px solid var(--syn-border);background:var(--syn-card);padding:18px 14px 92px;font-size:13px;color:var(--syn-muted-foreground)}
.syn-margin h4{margin:0 0 8px;font-size:13px;font-weight:600;color:var(--syn-foreground)}
.syn-margin p{margin:0 0 8px}
.syn-margin b{color:var(--syn-foreground);font-weight:600}
.syn-alert{margin-top:8px;border:1px solid var(--syn-alert-border);background:var(--syn-alert);color:var(--syn-alert-foreground);border-radius:8px;padding:8px}
.syn-summary h4{margin:0 0 6px;font:500 17px/1.3 Newsreader,Georgia,serif;color:var(--syn-foreground)}
.syn-summary ul{margin:0 0 12px;padding-left:18px}
.syn-seal{position:absolute;right:26px;bottom:78px;transform:rotate(-8deg);border:2px solid var(--syn-seal);color:var(--syn-seal);border-radius:6px;padding:2px 6px;font:500 20px/1 "Noto Serif JP",serif;opacity:.8}
.syn-capsule-slot{position:absolute;left:50%;bottom:14px;transform:translateX(-50%)}
.syn-title{position:relative}
.syn-sep{display:inline-block}
.syn-capsule{display:flex;align-items:center;gap:6px;padding:6px;border-radius:999px;background:var(--syn-primary);color:var(--syn-primary-foreground);box-shadow:var(--syn-shadow-capsule);white-space:nowrap;font-size:14px}
.syn-steps{display:flex;align-items:center;gap:6px;margin:0;padding:0 10px 0 8px;list-style:none;font-size:13px;opacity:1}
.syn-steps li{display:flex;align-items:center;gap:6px;margin:0;color:color-mix(in srgb,var(--syn-primary-foreground) 70%,transparent)}
.syn-steps li[aria-current]{color:var(--syn-primary-foreground);font-weight:600}
.syn-kanji{font:500 11px/1 "Noto Serif JP",serif;opacity:.6;margin-right:4px}
.syn-sep{width:1px;height:20px;background:color-mix(in srgb,var(--syn-primary-foreground) 30%,transparent)}
.syn-btn{display:inline-flex;align-items:center;border:0;border-radius:999px;padding:7px 14px;font:inherit;color:inherit;background:transparent;cursor:pointer}
.syn-btn:hover{background:color-mix(in srgb,var(--syn-primary-foreground) 10%,transparent)}
.syn-btn[data-tone=primary]{background:var(--syn-primary-foreground);color:var(--syn-primary);font-weight:600}
.syn-btn[data-tone=recording]{background:var(--syn-recording);color:var(--syn-background);font-weight:600}
.syn-btn:focus-visible,.syn-toggle:focus-visible{outline:2px solid var(--syn-primary-foreground);outline-offset:2px}
.syn-btn kbd{margin-left:6px;font:inherit;font-size:11px;font-weight:400;opacity:.6;background:none;border:0;padding:0;box-shadow:none;color:inherit}
.syn-live{display:flex;align-items:center;gap:8px;padding:0 8px}
.syn-dot{width:8px;height:8px;border-radius:999px;background:var(--syn-recording)}
.syn-timer{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums}
.syn-timer[data-paused]{opacity:.7}
.syn-meter{display:flex;align-items:center;gap:2px;height:20px}
.syn-meter i{display:block;width:2px;height:100%;border-radius:999px;background:var(--syn-primary-foreground);transform-origin:center}
.syn-meter[data-animated] i{animation:syn-level 900ms ease-in-out infinite alternate}
.syn-meter[data-animated] i:nth-child(2){animation-delay:-300ms}.syn-meter[data-animated] i:nth-child(3){animation-delay:-600ms}.syn-meter[data-animated] i:nth-child(4){animation-delay:-150ms}.syn-meter[data-animated] i:nth-child(5){animation-delay:-450ms}
.syn-meter:not([data-animated]) i{opacity:.7}
@keyframes syn-level{from{transform:scaleY(.25)}to{transform:scaleY(1)}}
@media (prefers-reduced-motion:reduce){.syn-meter[data-animated] i{animation:none}}
.syn-toggle{display:grid;place-items:center;width:32px;height:32px;flex-shrink:0;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer}
.syn-toggle:hover{background:color-mix(in srgb,var(--syn-primary-foreground) 10%,transparent)}
.syn-toggle[aria-pressed=true]{background:var(--syn-recording);color:var(--syn-background)}
.syn-paused{font-size:13px;font-weight:600}
`;

const synElapsed = (total) => {
  const s = Math.max(0, Math.floor(total));
  const pad = (v) => String(v).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

const SYN_STAGES = [
  ["prepare", "備", L("Prepare")],
  ["listen", "聴", L("Listen")],
  ["synthesis", "結", L("Synthesis")],
];

// Même structure que apps/desktop/src/session/components/capsule/index.tsx.
const SynMarker = ({ n }) => (
  <span className="syn-hs" aria-hidden="true" style={{ left: "50%", top: -30, marginLeft: -11 }}>{n}</span>
);

const SynCapsule = ({ state, act, markers = false }) => {
  const { stage, paused, micMuted, speakerMuted, seconds } = state;
  return (
    <div className="syn-capsule" role="group" aria-label={L("Note capsule")}>
      <ol className="syn-steps" aria-label={L("Note steps")} style={{ position: "relative" }}>
        {markers ? h(SynMarker, { n: 1 }) : null}
        {SYN_STAGES.map(([id, kanji, label], index) => (
          <li key={id} aria-current={id === stage ? "step" : undefined}>
            {index > 0 ? <span aria-hidden="true" style={{ opacity: 0.7, fontWeight: 400 }}>·</span> : null}
            <span>
              <span className="syn-kanji" aria-hidden="true">{kanji}</span>
              {label}
            </span>
          </li>
        ))}
      </ol>
      <span className="syn-sep" aria-hidden="true" style={{ position: "relative" }}>
        {markers ? h(SynMarker, { n: 2 }) : null}
      </span>
      {stage === "prepare" ? (
        <>
          <button type="button" className="syn-btn" onClick={act.reset}>{L("Cancel")}</button>
          <button type="button" className="syn-btn" data-tone="recording" aria-keyshortcuts="Control+Shift+N" onClick={act.start}>
            {L("Begin listening")}
            <kbd aria-hidden="true">Ctrl {L("Shift")} N</kbd>
          </button>
        </>
      ) : null}
      {stage === "listen" ? (
        <>
          <span className="syn-live">
            {paused ? (
              <>
                {h(SynIcon, { name: I("Pause"), size: 14 })}
                <span role="status" className="syn-paused">{L("Paused")}</span>
              </>
            ) : (
              <span className="syn-dot" aria-hidden="true" />
            )}
            <span role="timer" aria-label={L("Listening time")} className="syn-timer" data-paused={paused ? "" : undefined}>
              {synElapsed(seconds)}
            </span>
            {paused ? null : (
              <span className="syn-meter" aria-hidden="true" data-animated={micMuted && speakerMuted ? undefined : ""}>
                {[0.45, 0.75, 1, 0.75, 0.45].map((w, i) => (
                  <i key={i} style={micMuted && speakerMuted ? { transform: `scaleY(${w * 0.5})` } : undefined} />
                ))}
              </span>
            )}
          </span>
          {paused ? null : (
            <>
              <button
                type="button"
                className="syn-toggle"
                aria-label={L("Mute the microphone")}
                aria-pressed={micMuted}
                aria-keyshortcuts="Control+Shift+M"
                title={`${micMuted ? L("Unmute the microphone") : L("Mute the microphone")} (Ctrl+${L("Shift")}+M)`}
                onClick={act.toggleMic}
              >
                {h(SynIcon, { name: micMuted ? I("MicrophoneSlash") : I("Microphone") })}
              </button>
              <button
                type="button"
                className="syn-toggle"
                aria-label={L("Mute system audio")}
                aria-pressed={speakerMuted}
                aria-keyshortcuts="Control+Shift+S"
                title={`${speakerMuted ? L("Unmute system audio") : L("Mute system audio")} (Ctrl+${L("Shift")}+S)`}
                onClick={act.toggleSpeaker}
              >
                {h(SynIcon, { name: speakerMuted ? I("SpeakerX") : I("SpeakerHigh") })}
              </button>
            </>
          )}
          {paused ? (
            <button type="button" className="syn-btn" data-tone="recording" aria-label={L("Resume listening")} onClick={act.resume}>
              {L("Resume listening")}
            </button>
          ) : (
            <button type="button" className="syn-btn" aria-label={L("Pause listening")} onClick={act.pause}>
              {L("Put on pause")}
            </button>
          )}
          <button type="button" className="syn-btn" data-tone="primary" onClick={act.finish}>{L("Finish")}</button>
        </>
      ) : null}
      {stage === "synthesis" ? (
        <>
          <button type="button" className="syn-btn">{L("Copy")}</button>
          <button type="button" className="syn-btn" title={`${L("Export")} (Ctrl+P)`} aria-keyshortcuts="Control+P">{L("Export")}</button>
          <button type="button" className="syn-btn" data-tone="primary" aria-keyshortcuts="Control+J">
            {L("Ask the note")}
            <kbd aria-hidden="true">Ctrl J</kbd>
          </button>
        </>
      ) : null}
    </div>
  );
};


const synInitial = (stage) => ({
  stage: SYN_STAGES.some(([id]) => id === stage) ? stage : "prepare",
  paused: false,
  micMuted: false,
  speakerMuted: false,
  seconds: stage === "listen" ? 768 : 0,
});

const useSynSession = (initialStage) => {
  const [state, setState] = useState(() => synInitial(initialStage));
  const running = state.stage === "listen" && !state.paused;
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setState((s) => ({ ...s, seconds: s.seconds + 1 })), 1000);
    return () => clearInterval(id);
  }, [running]);
  const patch = (p) => setState((s) => ({ ...s, ...p }));
  const act = {
    start: () => patch({ stage: "listen", paused: false, seconds: 0 }),
    pause: () => patch({ paused: true }),
    resume: () => patch({ paused: false }),
    finish: () => patch({ stage: "synthesis", paused: false }),
    toggleMic: () => setState((s) => ({ ...s, micMuted: !s.micMuted })),
    toggleSpeaker: () => setState((s) => ({ ...s, speakerMuted: !s.speakerMuted })),
    reset: () => setState(synInitial(initialStage)),
  };
  return [state, act];
};

// <AppSettings section=… focus=…> : l'écran Paramètres. Menu repris de
// apps/desktop/src/sidebar/settings-nav-groups.ts et sidebar/settings.tsx
// (recherche, groupe « Avancé » replié, pastilles d'état des serveurs) ;
// contenu repris de apps/desktop/src/settings/. Chaque section est un
// composant SynSection… défini dans settings-*.jsx.tpl, qui reçoit `focus`
// (bloc encadré « Vous êtes ici »).

const SYN_CSS_SETTINGS = `
.syn-set{display:flex;min-height:520px}
.syn-set-nav{flex:0 0 228px;display:flex;flex-direction:column;gap:14px;border-right:1px solid var(--syn-border);background:var(--syn-muted);padding:14px 12px 12px}
.syn-set-search{display:flex;align-items:center;gap:8px;height:32px;border:1px solid var(--syn-border);border-radius:8px;background:var(--syn-card);padding:0 10px;color:var(--syn-faint)}
.syn-set-search:focus-within{box-shadow:0 0 0 1px var(--syn-ring)}
.syn-set-search input{flex:1;min-width:0;border:0;background:transparent;color:var(--syn-foreground);font:inherit;font-size:14px;outline:none}
.syn-set-group{display:flex;flex-direction:column;gap:1px}
.syn-set-label{display:flex;align-items:center;gap:4px;margin:0;padding:0 8px 4px;border:0;background:none;font:600 11px/1.4 Geist,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--syn-faint);text-align:left}
button.syn-set-label{cursor:pointer}
.syn-set-item{display:flex;align-items:center;gap:10px;width:100%;border:0;border-radius:7px;background:transparent;padding:6px 8px;font:400 14px/1.3 Geist,system-ui,sans-serif;color:var(--syn-foreground);text-align:left;cursor:pointer}
.syn-set-item:hover{background:color-mix(in srgb,var(--syn-foreground) 6%,transparent)}
.syn-set-item svg{color:var(--syn-muted-foreground)}
.syn-set-item[aria-current=page]{background:var(--syn-accent);color:var(--syn-accent-foreground);font-weight:600}
.syn-set-item[aria-current=page] svg{color:var(--syn-accent-foreground)}
.syn-set-foot{margin-top:auto;display:flex;flex-direction:column;gap:4px;border-top:1px solid var(--syn-border);padding:10px 8px 2px;font-size:12px;color:var(--syn-muted-foreground)}
.syn-set-foot span{display:flex;align-items:center;gap:8px}
.syn-set-main{flex:1;min-width:0;padding:36px 48px 48px;background:var(--syn-background)}
.syn-set-page{display:flex;flex-direction:column;gap:26px;max-width:720px}
.syn-set-title{margin:0;font:500 36px/1.1 Newsreader,Georgia,serif}
.syn-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

// Groupes et entrées du menu, dans l'ordre de settings-nav-groups.ts.
const synSettingsGroups = () => [
  {
    label: L("Me"),
    items: [
      ["app", L("Profile"), I("User")],
      ["appearance", L("Appearance"), I("Sun")],
      ["notifications", L("Notifications"), I("Bell")],
    ],
  },
  {
    label: L("My servers"),
    items: [
      ["transcription", L("Transcription"), I("Waveform"), "stt"],
      ["intelligence", L("Synthesis"), I("Sparkle"), "llm"],
    ],
  },
  {
    label: L("Writing"),
    items: [
      ["dictation", L("Dictation"), I("Microphone")],
      ["dictionary", L("Dictionary"), I("BookOpen")],
    ],
  },
  {
    label: L("My meetings"),
    items: [
      ["templates", L("Templates"), I("FileText"), null, true],
      ["meetings", L("Meetings"), I("VideoCamera")],
      ["folders", L("Folders"), I("FolderSimple"), null, true],
      ["contacts", L("Contacts"), I("Users"), null, true],
    ],
  },
  {
    label: L("Advanced"),
    collapsed: true,
    items: [
      ["privacy", L("Privacy"), I("ShieldCheck")],
      ["permissions", L("Permissions"), I("Lock")],
      ["automations", L("Automations"), I("Lightning"), null, true],
      ["developers", L("Developers"), I("Code")],
    ],
  },
];

// Données d'exemple : les deux serveurs répondent.
const synServerLabel = (kind) => (kind === "stt" ? L("Transcription · connected") : L("Synthesis · connected"));

const SynSettingsTitle = ({ title, lede }) => (
  <div>
    <h2 className="syn-set-title">{title}</h2>
    {lede ? <p className="syn-lede">{lede}</p> : null}
  </div>
);

// Sections reproduites ; les autres affichent leur titre seul.
const synSections = () => ({
  app: SynSectionApp,
  transcription: SynSectionTranscription,
  intelligence: SynSectionIntelligence,
  dictation: SynSectionDictation,
  meetings: SynSectionMeetings,
  privacy: SynSectionPrivacy,
  permissions: SynSectionPermissions,
});

const SynSettingsNavGroup = ({ group, active, onPick }) => {
  const forceOpen = group.items.some(([id]) => id === active);
  const [expanded, setExpanded] = useState(false);
  const open = !group.collapsed || expanded || forceOpen;
  return (
    <div className="syn-set-group">
      {group.collapsed ? (
        <button type="button" className="syn-set-label" aria-expanded={open} onClick={() => setExpanded((v) => !v)}>
          {group.label}
          {h(SynIcon, { name: open ? I("CaretDown") : I("CaretRight"), size: 12 })}
        </button>
      ) : (
        <h5 className="syn-set-label">{group.label}</h5>
      )}
      {open
        ? group.items.map(([id, label, icon, server]) => (
            <button
              key={id}
              type="button"
              className="syn-set-item"
              aria-current={id === active ? "page" : undefined}
              onClick={() => onPick(id)}
            >
              {h(SynIcon, { name: icon })}
              <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
              {server ? (
                <span title={synServerLabel(server)} style={{ display: "flex" }}>
                  <i className="syn-pip" aria-hidden="true" />
                  <span className="syn-sr">{synServerLabel(server)}</span>
                </span>
              ) : null}
            </button>
          ))
        : null}
    </div>
  );
};

/**
 * Paramètres de l'app, ouverts sur `section` (identifiant de l'app : app,
 * transcription, intelligence, dictation, meetings, privacy, permissions…).
 * `focus` encadre un bloc de la section (ex. meetings + audio).
 */
export const AppSettings = ({ section = "meetings", focus }) => {
  const [active, setActive] = useState(section);
  const [query, setQuery] = useState("");
  const groups = synSettingsGroups();
  const all = groups.flatMap((g) => g.items);
  const current = all.find(([id]) => id === active) ?? all[0];
  const Section = synSections()[active];
  const q = query.trim().toLowerCase();
  const visible = q
    ? groups
        .map((g) => ({ ...g, collapsed: false, items: g.items.filter(([, label]) => label.toLowerCase().includes(q)) }))
        .filter((g) => g.items.length)
    : groups;
  const reset = () => {
    setActive(section);
    setQuery("");
  };
  return h(
    SynFigure,
    { title: L("Settings"), width: 960, onReset: reset },
      <div className="syn-set">
        <div className="syn-set-nav">
          <label className="syn-set-search">
            {h(SynIcon, { name: I("MagnifyingGlass"), size: 15 })}
            <input
              type="text"
              value={query}
              placeholder={L("Search settings")}
              aria-label={L("Search settings")}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
            />
          </label>
          <nav aria-label={L("Settings")} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {visible.map((group) => (
              h(SynSettingsNavGroup, { key: group.label, group, active, onPick: setActive })
            ))}
          </nav>
          <div className="syn-set-foot" role="status" aria-label={L("Server status")}>
            <span><i className="syn-pip" aria-hidden="true" />{synServerLabel("stt")}</span>
            <span><i className="syn-pip" aria-hidden="true" />{synServerLabel("llm")}</span>
          </div>
        </div>
        <div className="syn-set-main">
          <div className="syn-set-page">
            {Section ? (
              h(Section, { focus: active === section ? focus : undefined })
            ) : (
              <>
                {h(SynSettingsTitle, { title: current[1] })}
                <p className="syn-muted">
                  {current[4]
                    ? "In the app, this entry opens its own view, described on its own documentation page."
                    : "This section is not replicated here: its documentation page describes it."}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
  );
};

// Paramètres › Réunions : apps/desktop/src/settings/general/index.tsx
// (section « meetings »), meeting-settings.tsx et audio-settings.tsx.
// Plateforme montrée : Linux (lignes de chat de réunion, pas de capture
// d'écran partagé, ligne « Son système » présente).

const SYN_CSS_MEETINGS = `
.syn-level{display:flex;gap:2px;align-items:flex-end;height:14px;margin-top:6px}
.syn-level i{width:4px;border-radius:2px;background:var(--syn-primary)}
.syn-level i[data-off]{background:var(--syn-border)}
`;

const SynLevel = ({ bars }) => (
  <span className="syn-level" aria-hidden="true">
    {[6, 10, 14, 9, 5].map((h, i) => (
      <i key={i} style={{ height: h }} data-off={i >= bars ? "" : undefined} />
    ))}
  </span>
);

// Sorties d'exemple. La sortie choisie auparavant, « Écouteurs Bluetooth »,
// est débranchée : la liste l'affiche en tête tant qu'elle reste choisie.
const SYN_SPEAKER_GONE = "Bluetooth earbuds";
const SYN_SPEAKERS = ["USB headset", "HDMI — External display"];
const SYN_SPEAKER_DEFAULT = "Built-in speakers";

const SynSectionMeetings = ({ focus }) => {
  const [mic, setMic] = useState("");
  const [speaker, setSpeaker] = useState(SYN_SPEAKER_GONE);
  const gone = speaker === SYN_SPEAKER_GONE;
  const captured = speaker && !gone ? speaker : SYN_SPEAKER_DEFAULT;
  return (
    <>
      {h(SynSettingsTitle, { title: L("Meetings") })}
      <div className="syn-rows" style={{ borderTop: 0 }}>
        {h(SynSwitchRow, { title: L("Stop when meeting ends"), description: L("Stop listening when your call ends."), initial: true })}
        {h(SynSwitchRow, { title: L("Post recording disclosure in meeting chat"), description: L("Tell participants when listening starts; this does not confirm consent.") })}
        {h(SynSwitchRow, { title: L("Capture meeting chat in the note"), description: L("Save visible chat from supported meetings using Accessibility.") })}
        {h(SynSwitchRow, { title: L("Remind participants about recording"), description: L("Show a reminder when a recording starts."), initial: true })}
        {h(SynSwitchRow, { title: L("Show floating bar"), description: L("Control listening without reopening Syntheo."), initial: true })}
      </div>
      {h(
        SynHere,
        { active: focus === "audio" },
        <h2 className="syn-h2">{L("Audio")}</h2>,
        <div className="syn-rows">
          {h(SynRow, {
            title: L("Microphone"),
            description: L("Choose the microphone that captures your voice."),
            wide: true,
            children: (labels) => (
              <>
                <select className="syn-select" value={mic} onChange={(e) => setMic(e.target.value)} aria-labelledby={labels["aria-labelledby"]} aria-describedby={labels["aria-describedby"]}>
                  <option value="">{L("Current default")}</option>
                  <option value="USB headset microphone">USB headset microphone</option>
                </select>
                {h(SynLevel, { bars: 3 })}
              </>
            ),
          })}
          {h(SynRow, {
            title: L("System sound"),
            description: L("Choose the output whose sound Syntheo transcribes: the one where you hear the other participants."),
            wide: true,
            children: (labels) => (
              <>
                <select className="syn-select" value={speaker} onChange={(e) => setSpeaker(e.target.value)} aria-labelledby={labels["aria-labelledby"]} aria-describedby={labels["aria-describedby"]}>
                  <option value="">{L("Current default output")}</option>
                  {gone ? (
                    <option value={SYN_SPEAKER_GONE}>
                      {SYN_SPEAKER_GONE} {L("(Unavailable — using the default output)")}
                    </option>
                  ) : null}
                  {SYN_SPEAKERS.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                {h(SynLevel, { bars: 2 })}
                <p className="syn-muted syn-small" role="status" style={{ margin: "6px 0 0" }}>
                  {L("Captured right now:")} <strong style={{ color: "var(--syn-foreground)", fontWeight: 500 }}>{captured}</strong>
                </p>
              </>
            ),
          })}
        </div>,
      )}
    </>
  );
};

// Paramètres › Transcription et › Synthèse : apps/desktop/src/settings/ai/
// stt/index.tsx + stt/server-card.tsx, llm/index.tsx + llm/server-card.tsx,
// shared/server-card.tsx (carte, pastille d'état, bannière d'échec, modèles en
// boutons radio, « Aide »), shared/server-address.tsx (adresse enregistrée au
// fil de la saisie, test automatique, « Avancé » : clé, réinitialisation) et
// shared/server-connection.ts (états). Le serveur est simulé : un port connu
// répond, un autre port ne répond pas.
// focus : "server" (la carte), "protocol", "model" ou "effort" (Synthèse).

const SYN_CSS_SERVERS = `
.syn-srv-card{display:flex;flex-direction:column;gap:14px;border:1px solid var(--syn-border);border-radius:14px;background:var(--syn-card);padding:18px 20px}
.syn-srv-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:14px}
.syn-srv-head h3{margin:0;font-size:14px;font-weight:600}
.syn-srv-chip{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:2px 10px;font-size:13px;font-weight:500;background:var(--syn-muted);color:var(--syn-muted-foreground)}
.syn-srv-chip[data-tone=good]{background:var(--syn-accent);color:var(--syn-accent-foreground)}
.syn-srv-chip[data-tone=bad]{background:var(--syn-alert);color:var(--syn-alert-foreground)}
.syn-srv-chip i{width:7px;height:7px;border-radius:999px;background:currentColor}
@keyframes syn-srv-spin{to{transform:rotate(360deg)}}
.syn-srv-banner{border:1px solid var(--syn-alert-border);border-radius:10px;background:var(--syn-alert);color:var(--syn-alert-foreground);padding:10px 14px;font-size:14px}
.syn-srv-field{display:flex;flex-direction:column;gap:6px}
.syn-srv-label{font-size:13px;font-weight:500;color:var(--syn-muted-foreground)}
.syn-srv-input{width:100%;min-height:36px;border:1px solid var(--syn-input);border-radius:10px;background:var(--syn-card);color:var(--syn-foreground);padding:8px 12px;font:400 14px/1.3 "Geist Mono",ui-monospace,monospace}
.syn-srv-input::placeholder{color:var(--syn-faint)}
.syn-srv-error{margin:0;font-size:13px;color:var(--syn-destructive)}
.syn-srv-root details>summary{cursor:pointer;font-size:14px;color:var(--syn-muted-foreground)}
.syn-srv-root details>summary:hover{color:var(--syn-foreground)}
.syn-srv-more{display:flex;flex-direction:column;gap:12px;margin-top:10px}
.syn-srv-help{display:flex;flex-direction:column;gap:8px;margin-top:10px;font-size:14px;color:var(--syn-muted-foreground)}
.syn-srv-help p{margin:0}
.syn-srv-protos{display:flex;flex-wrap:wrap;gap:6px}
.syn-srv-proto{border:1px solid var(--syn-border);border-radius:6px;background:transparent;color:var(--syn-muted-foreground);padding:2px 10px;font:400 13px/1.5 Geist,system-ui,sans-serif;cursor:pointer}
.syn-srv-proto:hover{background:var(--syn-muted)}
.syn-srv-proto[aria-checked=true]{border-color:var(--syn-primary);background:var(--syn-accent);color:var(--syn-accent-foreground);font-weight:500}
.syn-srv-models{display:flex;flex-direction:column;gap:6px}
.syn-srv-model{display:flex;align-items:center;gap:12px;width:100%;border:1px solid var(--syn-border);border-radius:10px;background:var(--syn-background);color:var(--syn-foreground);padding:9px 12px;text-align:left;font:inherit;cursor:pointer}
.syn-srv-model:hover{background:var(--syn-muted)}
.syn-srv-model[aria-checked=true]{border-color:var(--syn-primary);background:var(--syn-accent)}
.syn-srv-ring{display:grid;place-items:center;flex-shrink:0;width:16px;height:16px;border:1.5px solid var(--syn-input);border-radius:999px}
.syn-srv-model[aria-checked=true] .syn-srv-ring{border-color:var(--syn-primary)}
.syn-srv-model[aria-checked=true] .syn-srv-ring::after{content:"";width:8px;height:8px;border-radius:999px;background:var(--syn-primary)}
.syn-srv-id{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 13.5px/1.3 "Geist Mono",ui-monospace,monospace}
.syn-srv-hint{margin-left:auto;flex-shrink:0;font-size:12px;color:var(--syn-muted-foreground)}
.syn-srv-foot{margin:0;font-size:13px;color:var(--syn-muted-foreground)}
.syn-srv-seg{display:inline-flex;overflow:hidden;border:1px solid var(--syn-input);border-radius:8px}
.syn-srv-seg button{border:0;background:var(--syn-card);color:var(--syn-foreground);padding:6px 12px;font:400 13px/1.3 Geist,system-ui,sans-serif;cursor:pointer}
.syn-srv-seg button+button{border-left:1px solid var(--syn-input)}
.syn-srv-seg button:hover{background:var(--syn-muted)}
.syn-srv-seg button[aria-pressed=true]{background:var(--syn-primary);color:var(--syn-primary-foreground);font-weight:600}
`;

// Le message de refus du HTTP vient de packages/provider-validation (en
// français dans le code, hors messages.po).
const SYN_SRV_HTTPS = "Use HTTPS: HTTP is only accepted on this machine or a private network.";
const SYN_SRV_OPENAI_PH = "http://localhost:8000/v1";
const SYN_SRV_NEMO_PH = "http://localhost:9000";
const SYN_SRV_STT_MODELS = ["mistralai/Voxtral-Mini-4B-Realtime-2602", "Systran/faster-whisper-large-v3"];
// stt/model-selection.ts, NEMO_SPEECH_DEFAULT_MODEL.
const SYN_SRV_NEMO_MODELS = ["nemotron-3.5-asr-streaming-0.6b"];
const SYN_SRV_LLM_MODELS = { 11434: ["qwen3:14b", "mistral-small3.2:24b", "gemma3:12b"], 1234: ["qwen/qwen3-14b", "google/gemma-3-12b"] };

const synSrvParse = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

// Hôtes privés acceptés en HTTP (provider-validation).
const synSrvPrivate = (host) => {
  const h = host.replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "::1" || /\.local$/.test(h) || /\.ts\.net$/.test(h)) return true;
  const m = h.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
};

const synSrvHost = (value) => {
  const url = synSrvParse(value);
  return url ? `${url.host}${url.pathname === "/" ? "" : url.pathname}` : value;
};

// Réponse simulée du serveur : ports usuels de la page ai-setup.
const synSrvProbe = (kind, value) => {
  const url = synSrvParse(value);
  const port = url ? url.port || (url.protocol === "https:" ? "443" : "80") : "";
  if (kind === "stt") {
    if (port === "9000") return { ok: true, protocol: "nvidia", latency: 24, models: [] };
    if (["8000", "443"].includes(port)) return { ok: true, protocol: "openai", latency: 38, models: SYN_SRV_STT_MODELS };
  } else {
    if (SYN_SRV_LLM_MODELS[port]) return { ok: true, latency: 41, models: SYN_SRV_LLM_MODELS[port] };
    if (["8000", "8080", "30000", "443"].includes(port)) return { ok: true, latency: 41, models: ["Qwen/Qwen3-14B-AWQ"] };
  }
  return { ok: false };
};

/**
 * Adresse, clé et connexion d'un serveur. `initial` : { url, result } ; la
 * saisie est enregistrée après une courte pause, puis testée (comme
 * useServerConnection, requête lancée dès qu'une adresse existe).
 */
const useSynServer = (kind, initial, placeholder) => {
  const [draft, setDraft] = useState(initial.url);
  const [saved, setSaved] = useState(initial.url);
  const [key, setKey] = useState("");
  const [urlError, setUrlError] = useState(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(initial.result);
  const timers = useRef({});
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);
  const test = (value = saved) => {
    if (!value) return;
    clearTimeout(timers.current.test);
    setTesting(true);
    timers.current.test = setTimeout(() => {
      setTesting(false);
      setResult(synSrvProbe(kind, value));
    }, 700);
  };
  const save = (value) => {
    const next = value.trim();
    if (next) {
      const url = synSrvParse(next);
      if (!url || !["http:", "https:"].includes(url.protocol) || !url.hostname) {
        setUrlError(LF("Enter a full address, for example {placeholder}.", { placeholder }));
        return;
      }
      if (url.protocol === "http:" && !synSrvPrivate(url.hostname)) {
        setUrlError(SYN_SRV_HTTPS);
        return;
      }
    }
    setUrlError(null);
    if (next === saved) return;
    setSaved(next);
    setResult(null);
    if (next) {
      test(next);
    } else {
      clearTimeout(timers.current.test);
      setTesting(false);
    }
  };
  const onDraft = (value) => {
    setDraft(value);
    clearTimeout(timers.current.save);
    timers.current.save = setTimeout(() => save(value), 500);
  };
  const reset = () => {
    Object.values(timers.current).forEach(clearTimeout);
    setDraft("");
    setSaved("");
    setKey("");
    setUrlError(null);
    setTesting(false);
    setResult(null);
  };
  const state = !saved ? "unconfigured" : testing ? "testing" : !result ? "untested" : result.ok ? "connected" : "failed";
  return { draft, saved, key, setKey, urlError, result, state, onDraft, test: () => test(), reset, setSaved, setDraft, setResult };
};

const SynSrvChip = ({ server, connectedLabel }) => {
  const { state, result } = server;
  const chip = (tone, label, busy) => (
    <span role="status" className="syn-srv-chip" data-tone={tone}>
      {busy ? h(SynIcon, { name: I("CircleNotch"), size: 14, style: { animation: "syn-srv-spin 1s linear infinite" } }) : <i aria-hidden="true" />}
      {label}
    </span>
  );
  if (state === "unconfigured") return chip("wait", L("No server yet"));
  if (state === "untested") return chip("wait", L("Not tested"));
  if (state === "testing") return chip("wait", L("Testing…"), true);
  if (state === "connected") return chip("good", connectedLabel ?? LF("Connected · {0} ms", { 0: result.latency }));
  return chip("bad", L("Unreachable"));
};

const SynSrvAddress = ({ server, label }) => {
  const id = useId();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <div className="syn-srv-field">
        <label className="syn-srv-label" htmlFor={`${id}-url`}>{label}</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id={`${id}-url`}
            className="syn-srv-input"
            value={server.draft}
            placeholder={server.placeholder}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={Boolean(server.urlError)}
            onChange={(e) => server.onDraft(e.target.value)}
          />
          <button type="button" className="syn-ui-btn" style={{ flexShrink: 0 }} disabled={server.state === "testing" || !server.saved} onClick={server.test}>
            {server.state === "testing" ? h(SynIcon, { name: I("CircleNotch"), size: 14, style: { animation: "syn-srv-spin 1s linear infinite" } }) : null}
            {L("Test connection")}
          </button>
        </div>
        {server.urlError ? <p role="alert" className="syn-srv-error">{server.urlError}</p> : null}
      </div>
      <details>
        <summary>{L("Advanced")}</summary>
        <div className="syn-srv-more">
          <div className="syn-srv-field">
            <label className="syn-srv-label" htmlFor={`${id}-key`}>{L("API key (optional)")}</label>
            <input
              id={`${id}-key`}
              type="password"
              className="syn-srv-input"
              value={server.key}
              placeholder={L("Leave empty if the server has no authentication")}
              autoComplete="off"
              onChange={(e) => server.setKey(e.target.value)}
            />
          </div>
          {server.saved || server.key ? (
            confirm ? (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 14 }}>
                <span>{L("Forget this server's address and key?")}</span>
                <button type="button" className="syn-ui-btn" style={{ color: "var(--syn-alert-foreground)" }} onClick={() => { server.reset(); setConfirm(false); }}>{L("Reset")}</button>
                <button type="button" className="syn-ui-btn" data-variant="ghost" onClick={() => setConfirm(false)}>{L("Cancel")}</button>
              </div>
            ) : (
              <button type="button" className="syn-ui-btn" data-variant="ghost" style={{ alignSelf: "flex-start", paddingLeft: 0, color: "var(--syn-alert-foreground)", background: "transparent" }} onClick={() => setConfirm(true)}>
                {L("Reset this server…")}
              </button>
            )
          ) : null}
        </div>
      </details>
    </>
  );
};

// ServerFailureBanner, cas « unreachable » (le seul que simule la doc).
const SynSrvBanner = ({ server }) =>
  server.state === "failed" ? (
    <div role="alert" className="syn-srv-banner">
      {LF("The server did not answer at {host}. Check that it is running and that you are on the right network (VPN, Tailscale), then test again.", { host: synSrvHost(server.saved) })}
    </div>
  ) : null;

/** ModelRadioList : un clic choisit, « Saisir un autre nom » ouvre un champ libre. */
const SynSrvModels = ({ models, value, onChange, footer }) => {
  const labelId = useId();
  const known = models.some((m) => m.id === value);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState(known ? "" : value);
  const showCustom = custom || (Boolean(value) && !known) || models.length === 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span id={labelId} className="syn-srv-label">{L("Model")}</span>
      {models.length ? (
        <div role="radiogroup" aria-labelledby={labelId} className="syn-srv-models">
          {models.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={m.id === value}
              className="syn-srv-model"
              onClick={() => {
                setCustom(false);
                setDraft("");
                onChange(m.id);
              }}
            >
              <span aria-hidden="true" className="syn-srv-ring" />
              <span className="syn-srv-id">{m.id}</span>
              {m.hint ? <span className="syn-srv-hint">{m.hint}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {showCustom ? (
        <input
          aria-label={L("Model name")}
          className="syn-srv-input"
          value={draft}
          placeholder={L("Model name served by your server")}
          onChange={(e) => {
            setCustom(true);
            setDraft(e.target.value);
            onChange(e.target.value.trim());
          }}
        />
      ) : null}
      <p className="syn-srv-foot">
        {footer}
        {!showCustom ? (
          <>
            {footer ? " " : null}
            <button type="button" className="syn-link" style={{ padding: 0 }} onClick={() => setCustom(true)}>{L("Enter another name")}</button>
          </>
        ) : null}
      </p>
    </div>
  );
};

const SynSrvHelp = ({ lines }) => (
  <details>
    <summary>{L("Help")}</summary>
    <div className="syn-srv-help">
      {lines.map((line) => <p key={line}>{line}</p>)}
    </div>
  </details>
);

const SynSrvBlock = ({ on, children }) => h(SynHere, { active: on }, children);

// Données d'exemple : vLLM avec Voxtral Realtime sur le protocole OpenAI ;
// aucune adresse pour NeMo-Speech.cpp (chaque protocole garde la sienne).
const SynSectionTranscription = ({ focus }) => {
  const [protocol, setProtocol] = useState("openai");
  const openai = useSynServer("stt", { url: "http://localhost:8000/v1", result: { ok: true, protocol: "openai", latency: 38, models: SYN_SRV_STT_MODELS } }, SYN_SRV_OPENAI_PH);
  const nvidia = useSynServer("stt", { url: "", result: null }, SYN_SRV_NEMO_PH);
  const [chosen, setChosen] = useState({ openai: SYN_SRV_STT_MODELS[0], nvidia: SYN_SRV_NEMO_MODELS[0] });
  const server = { ...(protocol === "nvidia" ? nvidia : openai), placeholder: protocol === "nvidia" ? SYN_SRV_NEMO_PH : SYN_SRV_OPENAI_PH };
  const protocols = {
    openai: { label: L("OpenAI compatible (realtime and batch)"), hint: L("vLLM, speaches, faster-whisper-server") },
    nvidia: { label: L("NVIDIA NeMo-Speech.cpp"), hint: L("Nemotron") },
  };
  const connected = server.state === "connected";
  const detected = connected ? server.result.protocol : null;
  const models =
    protocol === "nvidia"
      ? SYN_SRV_NEMO_MODELS.map((id) => ({ id }))
      : connected
        ? server.result.models.map((id) => ({ id }))
        : [];
  const model = chosen[protocol] || (protocol === "openai" && connected && detected === "openai" ? server.result.models[0] : "");
  // « Utiliser ce protocole » recopie l'adresse vers le protocole détecté.
  const adopt = () => {
    const target = detected === "nvidia" ? nvidia : openai;
    target.setDraft(server.saved);
    target.setSaved(server.saved);
    target.setResult(server.result);
    setProtocol(detected);
  };
  const labelId = useId();
  return (
    <div className="syn-srv-root" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {h(SynSettingsTitle, { title: L("Transcription"), lede: L("The server that turns speech into text during your meetings. Audio is never written to disk.") })}
      {h(
        SynSrvBlock,
        { on: focus === "server" },
        <section className="syn-srv-card" aria-label={L("My server")}>
          <div className="syn-srv-head">
            <h3>{L("My server")}</h3>
            {h(SynSrvChip, { server })}
          </div>
          {h(SynSrvBanner, { server })}
          {h(SynSrvAddress, { key: protocol, server, label: L("Server address") })}
          {h(
            SynSrvBlock,
            { on: focus === "protocol" },
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span id={labelId} className="syn-srv-label">
                {L("Protocol")}
                {detected === protocol ? <span style={{ color: "var(--syn-accent-foreground)" }}> · {L("detected automatically")}</span> : null}
              </span>
              <div role="radiogroup" aria-labelledby={labelId} className="syn-srv-protos">
                {["openai", "nvidia"].map((id) => (
                  <button key={id} type="button" role="radio" aria-checked={id === protocol} title={protocols[id].hint} className="syn-srv-proto" onClick={() => setProtocol(id)}>
                    {protocols[id].label}
                  </button>
                ))}
              </div>
              {detected && detected !== protocol ? (
                <p className="syn-srv-foot">
                  {LF("This server answers as {detectedLabel}.", { detectedLabel: protocols[detected].label })}{" "}
                  <button type="button" className="syn-link" style={{ padding: 0 }} onClick={adopt}>{L("Use this protocol")}</button>
                </p>
              ) : null}
            </div>,
          )}
          {server.saved
            ? h(
                SynSrvBlock,
                { on: focus === "model" },
                h(SynSrvModels, {
                  key: `${protocol}-${models.length}`,
                  models,
                  value: model,
                  onChange: (next) => setChosen((c) => ({ ...c, [protocol]: next })),
                  footer:
                    protocol === "nvidia"
                      ? L("The server transcribes with the model it loaded, whatever the model chosen here.")
                      : connected
                        ? undefined
                        : L("Test the connection to list the models served."),
                }),
              )
            : null}
          {h(SynSrvHelp, {
            lines: [
              L("OpenAI: a server that speaks the OpenAI speech protocol (vLLM, speaches, faster-whisper-server), for example http://localhost:8000/v1. Live transcription uses /v1/realtime, imported files /v1/audio/transcriptions."),
              L("NVIDIA NeMo-Speech.cpp: your nemo-speech serve server, for example http://localhost:9000. Live transcription and imported files use its realtime WebSocket. NVIDIA's hosted gRPC endpoint is not supported."),
              L("The API key is optional for servers without authentication. It is kept in your system keychain."),
            ],
          })}
        </section>,
      )}
    </div>
  );
};

// Données d'exemple : Ollama sur ce poste.
const SynSectionIntelligence = ({ focus }) => {
  const server = { ...useSynServer("llm", { url: "http://localhost:11434/v1", result: { ok: true, latency: 41, models: SYN_SRV_LLM_MODELS[11434] } }, SYN_SRV_OPENAI_PH), placeholder: SYN_SRV_OPENAI_PH };
  const [chosen, setChosen] = useState(SYN_SRV_LLM_MODELS[11434][0]);
  const [effort, setEffort] = useState("default");
  const connected = server.state === "connected";
  const models = connected ? server.result.models : [];
  const efforts = [["default", L("Auto")], ["low", L("Low")], ["medium", L("Medium")], ["high", L("High")]];
  return (
    <div className="syn-srv-root" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {h(SynSettingsTitle, { title: L("Synthesis"), lede: L("The language model that writes your meeting notes and answers when you ask a note a question.") })}
      {h(
        SynSrvBlock,
        { on: focus === "server" || focus === "model" },
        <section className="syn-srv-card" aria-label={L("My server")}>
          <div className="syn-srv-head">
            <h3>{L("My server")}</h3>
            {h(SynSrvChip, { server, connectedLabel: connected && models.length ? LF("Connected · {0} models available", { 0: models.length }) : undefined })}
          </div>
          {h(SynSrvBanner, { server })}
          {h(SynSrvAddress, { server, label: L("Server address (OpenAI-compatible: vLLM, Ollama, llama.cpp, LM Studio)") })}
          {server.saved
            ? h(SynSrvModels, {
                key: models.join(),
                models: models.map((id) => ({ id })),
                value: models.includes(chosen) || !connected ? chosen : models[0] ?? "",
                onChange: (next) => {
                  setChosen(next);
                  // L'effort dépend du modèle : il revient à « Auto ».
                  setEffort("default");
                },
                footer: connected ? undefined : L("Test the connection to list the models served."),
              })
            : null}
          {h(SynSrvHelp, {
            lines: [L("Only on-premise OpenAI-compatible servers are supported (vLLM, Ollama, llama.cpp server, LM Studio…). The address usually ends with /v1, for example http://localhost:8000/v1.")],
          })}
        </section>,
      )}
      {h(
        SynSrvBlock,
        { on: focus === "effort" },
        <div className="syn-rows" style={{ borderTop: 0 }}>
          {h(SynRow, {
            title: L("Reasoning effort"),
            description: L("More effort gives finer summaries, but slower. Auto leaves it to the server."),
            children: () => (
              <div role="group" aria-label={L("Reasoning effort")} className="syn-srv-seg">
                {efforts.map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={effort === value} onClick={() => setEffort(value)}>{label}</button>
                ))}
              </div>
            ),
          })}
        </div>,
      )}
    </div>
  );
};

// Paramètres › Profil : apps/desktop/src/settings/general/index.tsx
// (section « app »), account-profile.tsx, app-settings.tsx (Linux : pas de
// ligne Dock), main-language.tsx, spoken-languages.tsx,
// single-language-model-hint.tsx, timezone.tsx, searchable-select.tsx et
// storage/. Noms de langues : Intl.DisplayNames, comme language.ts.
// focus : "language" (bloc « Langue et région », affiché en haut de la page).

const SYN_CSS_PROFILE = `
.syn-prof-scroll{max-height:470px;overflow-y:auto;margin-right:-16px;padding-right:16px}
.syn-prof-page{display:flex;flex-direction:column;gap:32px}
.syn-prof-kicker{margin:0;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--syn-faint)}
.syn-prof-field{display:flex;flex-direction:column;gap:8px;font-size:14px}
.syn-prof-avatar{display:grid;place-items:center;width:56px;height:56px;border-radius:999px;background:var(--syn-accent);color:var(--syn-accent-foreground);font-weight:600;font-size:18px}
.syn-prof-combo{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:36px;border:1px solid var(--syn-input);border-radius:8px;background:var(--syn-card);color:var(--syn-foreground);padding:6px 12px;font:400 14px/1.3 Geist,system-ui,sans-serif;text-align:left;cursor:pointer}
.syn-prof-combo span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.syn-prof-pop{position:absolute;z-index:20;top:calc(100% + 4px);left:0;width:100%;min-width:240px;overflow:hidden;border:1px solid var(--syn-border);border-radius:12px;background:var(--syn-popover);box-shadow:var(--syn-shadow-capsule)}
.syn-prof-pop input{width:100%;border:0;border-bottom:1px solid var(--syn-border);background:transparent;color:var(--syn-foreground);padding:9px 12px;font:400 14px/1.3 Geist,system-ui,sans-serif;outline:none}
.syn-prof-list{max-height:200px;overflow-y:auto;padding:4px}
.syn-prof-opt{display:flex;align-items:center;gap:8px;width:100%;border:0;border-radius:6px;background:transparent;color:var(--syn-foreground);padding:7px 9px;font:400 14px/1.3 Geist,system-ui,sans-serif;text-align:left;cursor:pointer}
.syn-prof-opt:hover,.syn-prof-opt[data-active]{background:var(--syn-accent)}
.syn-prof-opt small{margin-left:auto;font:400 10px/1 "Geist Mono",ui-monospace,monospace;color:var(--syn-muted-foreground)}
.syn-prof-empty{padding:8px 10px;font-size:14px;text-align:center;color:var(--syn-muted-foreground)}
.syn-prof-indent{display:flex;flex-direction:column;gap:16px;margin-left:12px;padding:8px 0 0 16px;border-left:2px solid var(--syn-muted)}
.syn-prof-tags{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:38px;border:1px solid var(--syn-border);border-radius:16px;background:var(--syn-card);padding:6px 8px;cursor:text}
.syn-prof-tag{display:inline-flex;align-items:center;gap:4px;border-radius:6px;background:var(--syn-muted);padding:2px 8px;font-size:12px}
.syn-prof-tag button{display:grid;place-items:center;width:14px;height:14px;border:0;background:transparent;color:var(--syn-muted-foreground);padding:0;cursor:pointer}
.syn-prof-tags input{flex:1;min-width:120px;border:0;background:transparent;color:var(--syn-foreground);font:400 14px/1.3 Geist,system-ui,sans-serif;outline:none}
.syn-prof-tags input::placeholder{color:var(--syn-muted-foreground)}
.syn-prof-hint{margin:8px 0 0;font-size:12px;color:var(--syn-muted-foreground)}
.syn-prof-hint button{border:0;background:none;padding:0;font:inherit;color:var(--syn-foreground);text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.syn-prof-demo{display:flex;align-items:center;gap:8px;margin-top:12px;border-top:1px dashed var(--syn-border);padding-top:10px;font-size:12px;color:var(--syn-muted-foreground)}
`;

// language.ts, CORE_TRANSCRIPTION_LANGUAGE_CODES.
const SYN_PROF_LANGS = "ar be bg bn bs ca cs da de el en es et fa fi fr he hi hr hu id it ja kn ko lt lv mk mr ms nl no pl pt ro ru sk sl sr sv ta te th tl tr uk ur vi zh".split(" ");

const synProfLangName = (code) => {
  try {
    return new Intl.DisplayNames([SYN_LOCALE], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
};

// timezone.tsx, extrait de COMMON_TIMEZONES.
const SYN_PROF_ZONES = [
  ["America/New_York", "Eastern Time", "UTC-5"],
  ["America/Sao_Paulo", "Sao Paulo", "UTC-3"],
  ["Europe/London", "London", "UTC+0/+1"],
  ["Europe/Paris", "Paris", "UTC+1/+2"],
  ["Europe/Berlin", "Berlin", "UTC+1/+2"],
  ["Africa/Cairo", "Cairo", "UTC+2"],
  ["Asia/Dubai", "Dubai", "UTC+4"],
  ["Asia/Kolkata", "India", "UTC+5:30"],
  ["Asia/Singapore", "Singapore", "UTC+8"],
  ["Asia/Tokyo", "Tokyo", "UTC+9"],
].map(([value, label, detail]) => ({ value, label, detail }));

/** SearchableSelect : bouton combobox, puis recherche et liste (↑↓, Entrée, Échap). */
const SynProfSelect = ({ value, onChange, options, placeholder, searchPlaceholder, emptyMessage, labelledBy, describedBy }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const buttonRef = useRef(null);
  const listId = useId();
  const q = query.trim().toLocaleLowerCase();
  const shown = options.filter((o) => !q || `${o.label} ${o.detail ?? ""}`.toLocaleLowerCase().includes(q));
  const selected = options.find((o) => o.value === value);
  const close = () => {
    setOpen(false);
    setQuery("");
    buttonRef.current?.focus();
  };
  const pick = (o) => {
    onChange(o.value);
    close();
  };
  const onKeyDown = (e) => {
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      close();
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && shown.length) {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length);
    } else if (e.key === "Enter" && shown[active]) {
      e.preventDefault();
      pick(shown[active]);
    }
  };
  return (
    <div style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        className="syn-prof-combo"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onClick={() => {
          setActive(Math.max(0, options.indexOf(selected)));
          setOpen((v) => !v);
        }}
      >
        <span>{selected ? (selected.detail ? `${selected.label} (${selected.detail})` : selected.label) : placeholder ?? L("Select...")}</span>
        {h(SynIcon, { name: I("CaretDown"), size: 14, style: { opacity: 0.5 } })}
      </button>
      {open ? (
        <div className="syn-prof-pop" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <div className="syn-prof-list" id={listId} role="listbox" aria-labelledby={labelledBy}>
            {shown.length === 0 ? <div className="syn-prof-empty">{emptyMessage ?? L("No results found.")}</div> : null}
            {shown.map((o, i) => (
              <div
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.value === value}
                className="syn-prof-opt"
                data-active={i === active ? "" : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => setActive(i)}
                onClick={() => pick(o)}
              >
                <span style={{ flex: 1 }}>{o.label}</span>
                {o.detail ? <small>{o.detail}</small> : null}
                {o.value === value ? h(SynIcon, { name: I("Check"), size: 14 }) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

/** SpokenLanguagesView : étiquettes, recherche, ↓ et Entrée, Retour arrière retire la dernière. */
const SynProfSpoken = ({ main, value, onChange }) => {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [index, setIndex] = useState(-1);
  const inputRef = useRef(null);
  const listId = useId();
  const q = query.trim().toLocaleLowerCase();
  const found = q ? SYN_PROF_LANGS.filter((c) => c !== main && !value.includes(c) && synProfLangName(c).toLocaleLowerCase().includes(q)) : [];
  const add = (code) => {
    onChange([...value, code]);
    setQuery("");
    setIndex(-1);
  };
  const onKeyDown = (e) => {
    if (e.key === "Backspace" && !query && value.length) {
      e.preventDefault();
      onChange(value.slice(0, -1));
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      return;
    }
    if (!q || !found.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, found.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && index >= 0) {
      e.preventDefault();
      add(found[index]);
    }
  };
  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 500 }}>{L("Additional spoken languages")}</h3>
      <p className="syn-muted" style={{ margin: "0 0 12px", fontSize: 12 }}>{L("Used for transcription and automatic summary language detection.")}</p>
      <div style={{ position: "relative" }}>
        <div className="syn-prof-tags" role="presentation" onClick={() => inputRef.current?.focus()}>
          {value.map((code) => (
            <span key={code} className="syn-prof-tag">
              {synProfLangName(code)}
              <button
                type="button"
                aria-label={`Remove ${synProfLangName(code)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((c) => c !== code));
                }}
              >
                {h(SynIcon, { name: I("X"), size: 10 })}
              </button>
            </span>
          ))}
          {value.length === 0 ? h(SynIcon, { name: I("MagnifyingGlass"), size: 16, style: { color: "var(--syn-muted-foreground)" } }) : null}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={focused && Boolean(q)}
            aria-controls={listId}
            aria-activedescendant={index >= 0 ? `${listId}-${index}` : undefined}
            aria-label={L("Add spoken language")}
            placeholder={value.length === 0 ? L("Add language") : ""}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(-1);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </div>
        {focused && q ? (
          <div className="syn-prof-pop" id={listId} role="listbox" style={{ borderRadius: 16 }}>
            <div className="syn-prof-list">
              {found.length ? (
                found.map((code, i) => (
                  <div
                    key={code}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={index === i}
                    className="syn-prof-opt"
                    data-active={index === i ? "" : undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => add(code)}
                  >
                    <span style={{ fontWeight: 500 }}>{synProfLangName(code)}</span>
                  </div>
                ))
              ) : (
                <div className="syn-prof-empty">{L("No matching languages found")}</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

/** Bloc « Langue et région ». */
const SynProfLanguage = ({ focus }) => {
  const [main, setMain] = useState("en");
  const [summaryMain, setSummaryMain] = useState(false);
  const [spoken, setSpoken] = useState(["en"]);
  const [zone, setZone] = useState("Europe/Paris");
  const [mono, setMono] = useState(false);
  const langOptions = SYN_PROF_LANGS.map((code) => ({ value: code, label: synProfLangName(code) }));
  return h(
    SynHere,
    { active: focus === "language" },
    <h2 className="syn-h2" style={{ fontSize: 18 }}>{L("Language & Region")}</h2>,
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="syn-rows" style={{ borderTop: 0 }}>
          {h(SynRow, {
            title: L("Main language"),
            description: L("Default language for transcription and AI responses."),
            wide: true,
            children: (labels) =>
              h(SynProfSelect, {
                value: main,
                onChange: (code) => {
                  setMain(code);
                  setSpoken((list) => list.filter((c) => c !== code));
                },
                options: langOptions,
                placeholder: L("Select language"),
                searchPlaceholder: L("Search language..."),
                emptyMessage: L("No matching languages found"),
                labelledBy: labels["aria-labelledby"],
                describedBy: labels["aria-describedby"],
              }),
          })}
        </div>
        <div className="syn-prof-indent">
          <div className="syn-rows" style={{ borderTop: 0 }}>
            {h(SynSwitchRow, {
              title: L("Use main language for summaries"),
              description: L("When off, summaries follow the detected meeting language."),
              checked: summaryMain,
              onChange: setSummaryMain,
            })}
          </div>
          <div>
            {h(SynProfSpoken, { main, value: spoken, onChange: setSpoken })}
            {mono && spoken.length ? (
              <p className="syn-prof-hint">
                {L("The live transcription model handles one language at a time. To transcribe several, <0>change models</0>.")
                  .split(/<\/?0>/)
                  .map((part, i) => (i === 1 ? <button key={i} type="button">{part}</button> : part))}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="syn-rows" style={{ borderTop: 0 }}>
        {h(SynRow, {
          title: L("Timezone"),
          description: L("Show the timeline in your preferred timezone."),
          wide: true,
          children: (labels) =>
            h(SynProfSelect, {
              value: zone,
              onChange: setZone,
              options: SYN_PROF_ZONES,
              placeholder: L("Select timezone"),
              searchPlaceholder: L("Search timezone..."),
              labelledBy: labels["aria-labelledby"],
              describedBy: labels["aria-describedby"],
            }),
        })}
      </div>
    </div>,
    focus === "language" ? (
      <label className="syn-check syn-prof-demo">
        <input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} />
        Demo: simulate a transcription model that handles only one language
      </label>
    ) : null,
  );
};

const SynProfIdentity = () => (
  <form className="syn-prof-field" style={{ gap: 16 }} onSubmit={(e) => e.preventDefault()}>
    <h3 className="syn-prof-kicker">{L("Identity")}</h3>
    <span className="syn-prof-avatar" aria-hidden="true">CR</span>
    <label className="syn-prof-field">
      {L("Name")}
      <input className="syn-input" type="text" defaultValue="Camille Rousseau" />
    </label>
    <label className="syn-prof-field">
      {L("Job Title")}
      <input className="syn-input" type="text" defaultValue="Product manager" />
    </label>
    <label className="syn-prof-field">
      {L("Email")}
      <input className="syn-input" type="email" defaultValue="camille.rousseau@example.com" />
      <span className="syn-muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
        {L("Syntheo uses it to recognize you among the participants of your meetings, so you are not counted twice. It stays on this device.")}
      </span>
    </label>
  </form>
);

// Profil : identité, démarrage et mises à jour, langue et région, stockage.
const SynSectionApp = ({ focus }) => {
  const scrollRef = useRef(null);
  const langRef = useRef(null);
  useEffect(() => {
    // Le bloc demandé s'affiche en haut de la zone, sans faire défiler la page de la doc.
    if (focus === "language" && scrollRef.current && langRef.current) {
      scrollRef.current.scrollTop = langRef.current.offsetTop - scrollRef.current.offsetTop - 16;
    }
  }, [focus]);
  return (
    <div className="syn-prof-scroll" ref={scrollRef}>
      <div className="syn-prof-page">
        {h(SynSettingsTitle, {
          title: L("Profile"),
          lede: L("This information stays on your computer. It is used to recognize you in transcripts and to sign your meeting notes."),
        })}
        {h(SynProfIdentity)}
        <div className="syn-rows" style={{ borderTop: 0 }}>
          {h(SynSwitchRow, { title: L("Start Syntheo at login"), description: L("Have Syntheo ready when you sign in."), initial: true })}
          {h(SynSwitchRow, { title: L("Automatically install updates"), description: L("Stay current with updates installed the next time Syntheo opens."), initial: true })}
          <div style={{ padding: "12px 0" }}>
            <button type="button" className="syn-ui-btn">{L("Show release notes")}</button>
          </div>
          {h(SynSwitchRow, { title: L("Show tray icon"), initial: true })}
        </div>
        <div ref={langRef}>{h(SynProfLanguage, { focus })}</div>
        <div>
          <h2 className="syn-h2" style={{ fontSize: 18 }}>{L("Storage")}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" className="syn-ui-btn" style={{ justifyContent: "flex-start", gap: 10, padding: "8px 12px", textAlign: "left" }}>
              {h(SynIcon, { name: I("FolderSimple"), style: { color: "var(--syn-muted-foreground)" } })}
              <span>
                <span style={{ display: "block", fontSize: 14 }}>{L("Export location")}</span>
                <span className="syn-muted" style={{ display: "block", fontSize: 12, fontWeight: 400 }}>~/Downloads</span>
              </span>
            </button>
            <button type="button" className="syn-ui-btn">{L("Choose folder")}</button>
            <p className="syn-muted" style={{ margin: 0, padding: "0 8px", fontSize: 12 }}>{L("Save PDF, text, Markdown, and Org exports to this folder.")}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Paramètres › Dictée : apps/desktop/src/settings/dictation.tsx et
// dictation-shortcut.tsx ; phases de apps/desktop/src/dictation/state.ts.
// Plateforme montrée : Linux (section repliée « Sur Linux (Wayland ou X11) »).
// Valeurs par défaut de settings/schema.ts : dictée désactivée, raccourci
// Ctrl Alt Espace, maintien (pas de mode mains libres), pas d'aperçu en direct.
// Démonstration : dans « Essayer », le raccourci configuré lance une dictée
// simulée (écoute, transcription, insertion d'une phrase d'exemple).

const SYN_CSS_DICTATION_SETTINGS = `
.syn-dset-kbd{display:inline-flex;gap:4px;align-items:center}
.syn-dset-kbd kbd{border:1px solid var(--syn-input);border-bottom-width:2px;border-radius:6px;background:var(--syn-card);padding:1px 6px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--syn-foreground)}
.syn-dset-shortcut[aria-pressed=true]{border-color:var(--syn-primary);box-shadow:0 0 0 3px var(--syn-accent)}
.syn-dset-link{border:0;background:none;padding:0;font:inherit;color:var(--syn-primary);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.syn-dset-box{border:1px solid var(--syn-border);border-radius:10px;padding:16px}
.syn-dset-box p{margin:0;font-size:14px}
.syn-dset-details summary{cursor:pointer;font-size:14px;color:var(--syn-muted-foreground)}
.syn-dset-details summary:hover{color:var(--syn-foreground)}
.syn-dset-details p{margin:10px 0 0;font-size:14px;color:var(--syn-muted-foreground)}
.syn-dset-try{display:flex;flex-direction:column;gap:12px}
.syn-dset-try h3{margin:0;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--syn-faint)}
.syn-dset-field{display:flex;align-items:flex-start;gap:10px;border:1px dashed var(--syn-input);border-radius:10px;padding:14px;color:var(--syn-muted-foreground)}
.syn-dset-field svg{margin-top:4px}
.syn-dset-field textarea{flex:1;min-height:64px;border:0;background:transparent;color:var(--syn-foreground);font:400 14px/1.5 Geist,system-ui,sans-serif;resize:vertical;outline:none;padding:0}
.syn-dset-field textarea::placeholder{color:var(--syn-faint)}
.syn-dset-field:focus-within{border-color:var(--syn-ring)}
.syn-dset-last{display:flex;flex-direction:column;gap:12px;align-items:flex-start}
.syn-dset-last h3{margin:0;font-size:14px;font-weight:500}
.syn-dset-last p{align-self:stretch;margin:0;border:1px solid var(--syn-border);border-radius:10px;padding:16px;font-size:14px;white-space:pre-wrap}
`;

const SYN_DICTATION_SAMPLE = "Hi Camille, I'll send you Thursday's summary before noon.";
const SYN_DICTATION_SHORTCUT = "Control+Alt+Space";

// Libellés des touches de dictation-shortcut.tsx (Windows et Linux).
const synDictationKeyLabel = (key) =>
  ({ Control: "Ctrl", Alt: "Alt", Shift: "Shift", Super: "Super", Meta: "Super", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" })[key] ??
  key.replace(/^(Key|Digit)/, "");

// Combinaison d'un événement clavier, au format du réglage (Control+Alt+Space).
const synDictationCombo = (e) =>
  [e.ctrlKey && "Control", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super", e.code].filter(Boolean).join("+");

const SYN_DICTATION_MODIFIERS = ["Control", "Alt", "Meta", "Shift", "Fn", "OS"];

const SynDictationKeys = ({ shortcut }) => (
  <span className="syn-dset-kbd">
    {shortcut.split("+").map((key) => (
      <kbd key={key}>{synDictationKeyLabel(key)}</kbd>
    ))}
  </span>
);

/** Bouton du raccourci : clic, puis nouvelle combinaison ; Échap annule. */
const SynDictationShortcut = ({ shortcut, onChange }) => {
  const [recording, setRecording] = useState(false);
  return (
    <div className="syn-row">
      <div className="syn-row-text">
        <span className="syn-row-title" id="syn-dset-shortcut" style={{ display: "block" }}>{L("Dictation shortcut")}</span>
        <p className="syn-row-desc">{L("Click the shortcut to record a new key combination. Press Escape to cancel.")}</p>
      </div>
      <button
        type="button"
        className="syn-ui-btn syn-dset-shortcut"
        aria-labelledby="syn-dset-shortcut"
        aria-pressed={recording}
        onClick={() => setRecording((v) => !v)}
        onBlur={() => setRecording(false)}
        onKeyDown={(e) => {
          if (!recording) return;
          e.stopPropagation();
          if (e.key === "Tab") return setRecording(false);
          e.preventDefault();
          if (e.key === "Escape") return setRecording(false);
          if (e.repeat || SYN_DICTATION_MODIFIERS.includes(e.key)) return;
          onChange(synDictationCombo(e));
          setRecording(false);
        }}
      >
        {recording ? L("Press shortcut…") : h(SynDictationKeys, { shortcut })}
      </button>
    </div>
  );
};

const synDictationStatus = (phase) =>
  phase === "recording" ? L("Listening…") : phase === "transcribing" ? L("Transcribing…") : L("Ready to dictate");

const SynSectionDictation = ({ focus }) => {
  const [enabled, setEnabled] = useState(false);
  const [shortcut, setShortcut] = useState(SYN_DICTATION_SHORTCUT);
  const [handsFree, setHandsFree] = useState(false);
  const [live, setLive] = useState(false);
  const [mic, setMic] = useState("");
  const [phase, setPhase] = useState("idle");
  const [text, setText] = useState("");
  const [last, setLast] = useState("");
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const cancel = () => {
    clearTimeout(timer.current);
    setPhase("idle");
  };
  const finish = () => {
    setPhase("transcribing");
    timer.current = setTimeout(() => {
      setPhase("idle");
      setText((t) => (t ? `${t} ${SYN_DICTATION_SAMPLE}` : SYN_DICTATION_SAMPLE));
      setLast(SYN_DICTATION_SAMPLE);
      setCopied(false);
    }, 1100);
  };
  // Raccourci tapé dans « Essayer » : maintien (relâcher termine) ou mains
  // libres (seconde pression). Échap annule, comme sous Windows et X11.
  const onTryKeyDown = (e) => {
    if (!enabled) return;
    if (e.key === "Escape" && phase === "recording") {
      e.preventDefault();
      return cancel();
    }
    if (e.repeat || synDictationCombo(e) !== shortcut) return;
    e.preventDefault();
    if (phase === "idle") setPhase("recording");
    else if (phase === "recording" && handsFree) finish();
  };
  const onTryKeyUp = (e) => {
    if (handsFree || phase !== "recording") return;
    const parts = shortcut.split("+");
    if (parts.includes(e.code) || SYN_DICTATION_MODIFIERS.some((m) => e.key === m && parts.includes(m === "Meta" ? "Super" : m))) finish();
  };

  const switchRow = (title, description, checked, onChange) =>
    h(SynSwitchRow, { title, description, checked, onChange });

  return (
    <>
      {h(SynSettingsTitle, {
        title: L("Dictation"),
        lede: L("Speak into any text field, in any app. The text is inserted when you finish."),
      })}
      <div className="syn-rows" style={{ borderTop: 0 }}>
        {switchRow(L("Enable dictation"), L("Keep Syntheo running to use your shortcut in other apps."), enabled, (v) => {
          if (!v) {
            cancel();
            setLast("");
          }
          setEnabled(v);
        })}
        {h(SynDictationShortcut, { shortcut, onChange: setShortcut })}
        {switchRow(
          L("Hands-free dictation"),
          handsFree
            ? L("Press your shortcut to start, then press it again to finish.")
            : L("Hold your shortcut while speaking, then release it to finish."),
          handsFree,
          setHandsFree,
        )}
        {h(SynRow, {
          title: L("Microphone"),
          description: (
            <>
              {L("The one that captures your voice.")}{" "}
              <button type="button" className="syn-dset-link">{L("System permissions")}</button>
            </>
          ),
          wide: true,
          children: (labels) => (
            <select className="syn-select" value={mic} onChange={(e) => setMic(e.target.value)} aria-labelledby={labels["aria-labelledby"]}>
              <option value="">{L("Current default")}</option>
              <option value="USB headset microphone">USB headset microphone</option>
              <option value="Built-in microphone">Built-in microphone</option>
            </select>
          ),
        })}
        {switchRow(L("Live transcript preview"), L("Words appear in a small bubble while you speak. Text is inserted when you finish."), live, setLive)}
        {h(SynRow, {
          title: L("Language and vocabulary"),
          description: (
            <>
              {L("Words specific to you go in your")}{" "}
              <button type="button" className="syn-dset-link">{L("dictionary")}</button>
            </>
          ),
          children: () => <button type="button" className="syn-ui-btn">{L("Transcription server ›")}</button>,
        })}
      </div>

      <details className="syn-dset-details">
        <summary>{L("On Linux (Wayland or X11)")}</summary>
        <p>{L("On Wayland, approve the shortcuts in your desktop's prompt. Use Control + Alt + Escape to cancel. On X11, press Escape to cancel. The target app must expose an editable accessibility field.")}</p>
      </details>

      {enabled ? (
        <div className="syn-dset-box" role="status">
          <p>{synDictationStatus(phase)}</p>
          {phase !== "idle" ? (
            <button type="button" className="syn-ui-btn" style={{ marginTop: 8 }} onClick={cancel}>{L("Cancel dictation")}</button>
          ) : null}
        </div>
      ) : null}

      {h(
        SynHere,
        { active: focus === "try" },
        <section className="syn-dset-try">
          <h3>{L("Try it")}</h3>
          <label className="syn-dset-field">
            {h(SynIcon, { name: I("Microphone"), size: 18 })}
            <textarea
              aria-label={L("Try dictation")}
              placeholder={L("Click here, then use your dictation shortcut.")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onTryKeyDown}
              onKeyUp={onTryKeyUp}
            />
          </label>
          <p className="syn-muted" style={{ margin: 0, fontSize: 13 }}>
            {L("Dictation uses your microphone, transcription provider, languages, and dictionary. Audio is never written to disk; it only passes through memory. Your last transcript stays in memory until dictation is disabled or Syntheo closes.")}
          </p>
        </section>,
      )}

      {last ? (
        <div className="syn-dset-last">
          <h3>{L("Last dictation")}</h3>
          <p>{last}</p>
          <button type="button" className="syn-ui-btn" onClick={() => setCopied(true)}>
            {copied ? L("Copied") : L("Copy last dictation")}
          </button>
        </div>
      ) : null}
    </>
  );
};

// Paramètres › Confidentialité : apps/desktop/src/settings/privacy/index.tsx
// (un seul réglage, « Verrouiller l'application », grisé quand le système
// n'offre pas d'authentification de l'appareil). focus : "lock".
// Paramètres › Autorisations : apps/desktop/src/settings/general/permissions.tsx,
// branche Linux et Windows (AudioPermissions runtimeCapabilities : la flèche
// relance un vrai test de la source, sans ouvrir les réglages du système).
// focus : "audio". L'« Emplacement d'export » (settings/general/storage/) est
// dans Profil, pas ici.

const SYN_CSS_PRIVACY = `
.syn-priv-demo{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0;border:1px dashed var(--syn-border);border-radius:10px;padding:8px 12px;font-size:12px;color:var(--syn-muted-foreground)}
.syn-priv-demo .syn-select{width:auto;min-height:28px;padding:2px 8px;font-size:12px}
.syn-perm-group h3{margin:0 0 12px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--syn-muted-foreground)}
.syn-perm-list{display:flex;flex-direction:column;gap:16px}
.syn-perm{display:flex;align-items:center;justify-content:space-between;gap:16px}
.syn-perm-title{display:flex;align-items:center;gap:8px;margin:0 0 4px;font-size:14px;font-weight:500}
.syn-perm[data-ok=false] .syn-perm-title{color:var(--syn-destructive)}
.syn-perm-desc{margin:0;font-size:12px;color:var(--syn-muted-foreground)}
.syn-perm-btn{display:grid;place-items:center;width:32px;height:32px;flex-shrink:0;border:0;border-radius:8px;background:var(--syn-primary);color:var(--syn-primary-foreground);cursor:pointer}
.syn-perm-btn[data-ok=true]{background:transparent;color:var(--syn-primary);cursor:default}
.syn-perm-btn:disabled:not([data-ok=true]){opacity:.6;cursor:default}
@keyframes syn-perm-spin{to{transform:rotate(360deg)}}
`;

/** Réglage propre à la doc : le système montré par la reproduction. */
const SynPrivDemo = ({ value, onChange }) => {
  const id = useId();
  return (
    <p className="syn-priv-demo">
      <label htmlFor={id}>Demo · system shown</label>
      <select id={id} className="syn-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="linux">Linux</option>
        <option value="windows">Windows</option>
      </select>
      <span>Linux offers no device authentication: the setting stays grayed out there.</span>
    </p>
  );
};

const SynSectionPrivacy = ({ focus }) => {
  const [os, setOs] = useState("linux");
  const [locked, setLocked] = useState(false);
  const available = os === "windows";
  const description = available
    ? L("Require Windows Hello face, PIN, or password when opening Syntheo.")
    : L("Device authentication is not available on this computer.");
  return (
    <>
      {h(SynSettingsTitle, { title: L("Privacy") })}
      {h(
        SynHere,
        { active: focus === "lock" },
        <div className="syn-rows" style={{ borderTop: 0 }}>
          {h(SynRow, {
            title: L("Lock app"),
            description,
            children: (labels) =>
              h(SynSwitch, {
                checked: locked && available,
                disabled: !available,
                onChange: setLocked,
                labelledBy: labels["aria-labelledby"],
                describedBy: labels["aria-describedby"],
              }),
          })}
        </div>,
      )}
      {h(SynPrivDemo, {
        value: os,
        onChange: (next) => {
          setOs(next);
          setLocked(false);
        },
      })}
    </>
  );
};

/** PermissionRow, variante runtimeCapability (Linux et Windows). */
const SynPermRow = ({ title, description, status, onRetry }) => {
  const ok = status === "authorized";
  const pending = status === "pending";
  const denied = status === "denied";
  return (
    <div className="syn-perm" data-ok={ok}>
      <div style={{ flex: 1 }}>
        <h4 className="syn-perm-title">
          {ok ? null : h(SynIcon, { name: I("WarningCircle") })}
          {title}
        </h4>
        <p className="syn-perm-desc">{description}</p>
      </div>
      <button
        type="button"
        className="syn-perm-btn"
        data-ok={ok}
        disabled={ok || pending}
        aria-label={denied ? `${L("Try again")}: ${title}` : title}
        onClick={onRetry}
      >
        {ok
          ? h(SynIcon, { name: I("Check") })
          : pending
            ? h(SynIcon, { name: I("CircleNotch"), style: { animation: "syn-perm-spin 1s linear infinite" } })
            : h(SynIcon, { name: I("ArrowRight"), size: 20 })}
      </button>
    </div>
  );
};

const SynSectionPermissions = ({ focus }) => {
  // Exemple : le test de l'audio système a échoué ; la flèche le relance.
  const [system, setSystem] = useState("denied");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const retry = () => {
    setSystem("pending");
    timer.current = setTimeout(() => setSystem("authorized"), 900);
  };
  return (
    <>
      {h(SynSettingsTitle, { title: L("Permissions") })}
      {h(
        SynHere,
        { active: focus === "audio" },
        <div className="syn-perm-group">
          <h3>{L("Audio")}</h3>
          <div className="syn-perm-list">
            {h(SynPermRow, { title: L("Microphone"), description: L("Record your voice in meetings and calls."), status: "authorized" })}
            {h(SynPermRow, { title: L("System audio"), description: L("Record other participants in meetings."), status: system, onRetry: retry })}
          </div>
        </div>,
      )}
    </>
  );
};

// <AppPalette> : la palette Ctrl+K, apps/desktop/src/shared/open-note-dialog.tsx
// et palette-search-groups.tsx (recherche dans le titre puis le contenu,
// dossiers en tête, Tab pour chercher dans un dossier, Retour arrière pour en
// sortir, Échap pour fermer). Données d'exemple seulement.

const SYN_CSS_PALETTE = `
.syn-pal-stage{position:relative;min-height:470px;padding:56px 16px 24px;background:color-mix(in srgb,var(--syn-background) 60%,var(--syn-muted))}
.syn-pal{max-width:520px;margin:0 auto;border:1px solid var(--syn-border);border-radius:16px;background:var(--syn-popover);box-shadow:var(--syn-shadow-capsule);overflow:hidden}
.syn-pal-head{display:flex;align-items:center;gap:12px;border-bottom:1px solid color-mix(in srgb,var(--syn-border) 60%,transparent);padding:12px 16px;color:var(--syn-muted-foreground)}
.syn-pal-head input{flex:1;min-width:0;border:0;background:transparent;color:var(--syn-foreground);font:400 14px/1.4 Geist,system-ui,sans-serif;outline:none}
.syn-pal-head input::placeholder{color:var(--syn-muted-foreground)}
.syn-pal-chip{display:flex;align-items:center;gap:4px;max-width:45%;border:0;border-radius:6px;background:var(--syn-accent);color:var(--syn-accent-foreground);padding:2px 6px;font:500 12px/1.3 Geist,system-ui,sans-serif;cursor:pointer}
.syn-pal-close{display:grid;place-items:center;width:20px;height:20px;border:0;border-radius:999px;background:color-mix(in srgb,var(--syn-accent) 80%,transparent);color:var(--syn-muted-foreground);cursor:pointer;padding:0}
.syn-pal-list{max-height:330px;overflow-y:auto;padding:8px}
.syn-pal-heading{padding:6px 8px;font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--syn-muted-foreground)}
.syn-pal-divider{height:1px;margin:6px 8px;background:var(--syn-accent)}
.syn-pal-item{display:flex;align-items:center;gap:8px;border-radius:8px;padding:7px 8px;font-size:14px;color:var(--syn-foreground);cursor:pointer}
.syn-pal-item svg{color:var(--syn-muted-foreground)}
.syn-pal-item[aria-selected=true]{background:var(--syn-accent)}
.syn-pal-item .syn-pal-meta{margin-left:auto;flex-shrink:0;font-size:12px;color:var(--syn-muted-foreground)}
.syn-pal-folder{display:inline-flex;align-items:center;gap:4px;max-width:45%;border-radius:6px;background:var(--syn-muted);padding:0 6px;font-size:12px;color:var(--syn-muted-foreground)}
.syn-pal-snippet{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--syn-muted-foreground)}
.syn-pal-snippet mark{background:color-mix(in srgb,var(--syn-primary) 22%,transparent);color:inherit;border-radius:2px}
.syn-pal-empty{padding:22px 12px;text-align:center;font-size:14px;color:var(--syn-muted-foreground)}
.syn-pal-foot{display:flex;flex-wrap:wrap;gap:16px;border-top:1px solid color-mix(in srgb,var(--syn-border) 60%,transparent);padding:8px 16px;font-size:12px;color:var(--syn-muted-foreground)}
.syn-pal-foot kbd{font:inherit;font-weight:500}
`;

const SYN_PAL_FOLDERS = [
  { path: "Product/Roadmap", count: 12 },
  { path: "Hiring", count: 5 },
  { path: "Legal", count: 3 },
];

const SYN_PAL_NOTES = [
  { id: 1, title: "Weekly product sync", folder: "Product/Roadmap", date: "Nov 9", body: "The beta moves to November 21. Malik checks the transcription server quota." },
  { id: 2, title: "Sprint 42 review", folder: "Product/Roadmap", date: "Nov 5", body: "Floating pill demo. Beta open to twenty testers." },
  { id: 3, title: "Candidate interview", folder: "Hiring", date: "Nov 4", body: "Questions about paid leave and remote work." },
  { id: 4, title: "GDPR committee", folder: "Legal", date: "Nov 2", body: "Record of processing activities, retention period." },
];

const synFolderName = (path) => path.split("/").pop();
const synFolderPath = (path) => path.split("/").filter(Boolean).join(" / ");
const synNorm = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Entrées de premier niveau de « Aller à » (open-note-dialog.tsx, topLevelPageIds).
const synPalPages = () => [
  ["settings", L("Settings"), I("Gear")],
  ["templates", L("Templates"), I("FileText")],
  ["folders", L("Folders"), I("FolderSimple")],
  ["contacts", L("Contacts"), I("Users")],
  ["automations", L("Automations"), I("Lightning")],
];

const synPalSearch = (query, folder) => {
  const q = synNorm(query.trim());
  const notes = SYN_PAL_NOTES.filter((n) => !folder || n.folder === folder);
  const groups = [];
  if (!q && !folder) {
    groups.push({ heading: L("Recent"), items: notes.slice(0, 2).map((n) => ({ kind: "note", note: n })) });
    groups.push({ heading: L("Go to"), items: synPalPages().map(([id, label, icon]) => ({ kind: "page", id, label, icon })) });
    groups.push({ heading: L("All Notes"), items: notes.slice(2).map((n) => ({ kind: "note", note: n })) });
    return groups;
  }
  if (!folder) {
    const folders = SYN_PAL_FOLDERS.filter((f) => synNorm(f.path).includes(q) || SYN_PAL_NOTES.some((n) => n.folder === f.path && synNorm(n.title + " " + n.body).includes(q)));
    if (folders.length) groups.push({ heading: L("Folders"), items: folders.map((f) => ({ kind: "folder", folder: f })) });
    const pages = synPalPages().filter(([, label]) => synNorm(label).includes(q));
    if (pages.length) groups.push({ heading: L("Go to"), items: pages.map(([id, label, icon]) => ({ kind: "page", id, label, icon })) });
  }
  // Titre d'abord, puis contenu avec un extrait.
  const byTitle = notes.filter((n) => !q || synNorm(n.title).includes(q));
  const byBody = q ? notes.filter((n) => !byTitle.includes(n) && synNorm(n.body).includes(q)) : [];
  const items = [
    ...byTitle.map((n) => ({ kind: "note", note: n })),
    ...byBody.map((n) => {
      const i = synNorm(n.body).indexOf(q);
      return { kind: "note", note: n, snippet: [n.body.slice(Math.max(0, i - 28), i), n.body.slice(i, i + q.length), n.body.slice(i + q.length, i + q.length + 32)] };
    }),
  ];
  if (folder) {
    groups.push({ heading: L("In this folder"), items, emptyText: L("No notes in this folder match.") });
    const question = query.trim();
    groups.push({
      heading: L("Actions"),
      items: [
        { kind: "action", id: "ask", label: question ? LF("Ask the folder: “{question}”", { question }) : L("Ask the folder"), icon: I("Sparkle") },
        { kind: "action", id: "new", label: L("New note in this folder"), icon: I("NotePencil") },
      ],
    });
  } else if (items.length) {
    groups.push({ heading: L("Notes"), items });
  }
  return groups;
};

const SynPalItem = ({ item, selected, id, inFolder, onPick, onHover }) => (
  <div id={id} role="option" aria-selected={selected} className="syn-pal-item" onClick={onPick} onMouseMove={onHover}>
    {item.kind === "folder" ? (
      <>
        {h(SynIcon, { name: I("Folder") })}
        <span style={{ fontWeight: 500 }}>{synFolderName(item.folder.path)}</span>
        <span className="syn-muted syn-small">{LP("{count, plural, one {# meeting} other {# meetings}}", item.folder.count)}</span>
        {selected ? <span className="syn-pal-meta">{L("Tab: search inside")}</span> : null}
      </>
    ) : item.kind === "note" ? (
      <>
        {h(SynIcon, { name: I("FileText"), style: { alignSelf: "flex-start", marginTop: 3 } })}
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span>{item.note.title}</span>
            {inFolder ? null : (
              <span className="syn-pal-folder">
                {h(SynIcon, { name: I("Folder"), size: 12 })}
                {synFolderPath(item.note.folder)}
              </span>
            )}
            <span className="syn-pal-meta">{item.note.date}</span>
          </span>
          {item.snippet ? (
            <span className="syn-pal-snippet">
              … {item.snippet[0]}<mark>{item.snippet[1]}</mark>{item.snippet[2]} …
            </span>
          ) : null}
        </span>
      </>
    ) : (
      <>
        {h(SynIcon, { name: item.icon })}
        <span>{item.label}</span>
        {item.kind === "page" && item.id !== "settings" && !["templates", "folders", "contacts", "automations"].includes(item.id) ? (
          <span className="syn-pal-meta">{L("Settings")}</span>
        ) : null}
      </>
    )}
  </div>
);

/**
 * Palette de recherche (Ctrl+K). `demo` : « recherche-contenu » (palette
 * vide : récents, Aller à, toutes les notes) ou « dossier » (« quota » tapé,
 * le dossier proposé en tête : Tab pour chercher dedans).
 */
export const AppPalette = ({ demo = "recherche-contenu" }) => {
  const initialQuery = demo === "dossier" ? "quota" : "";
  const [query, setQuery] = useState(initialQuery);
  const [folder, setFolder] = useState(null);
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);
  const listId = useId();
  const groups = synPalSearch(query, folder);
  const flat = groups.flatMap((g) => g.items);
  const sel = Math.min(index, Math.max(0, flat.length - 1));
  const selected = flat[sel];
  const placeholder = folder ? L("Search in this folder...") : L("Search notes and pages...");
  const reset = () => {
    setQuery(initialQuery);
    setFolder(null);
    setIndex(0);
    setOpen(true);
  };
  const enterFolder = (path) => {
    setFolder(path);
    setQuery("");
    setIndex(0);
    inputRef.current?.focus();
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((sel + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % Math.max(1, flat.length));
    } else if (e.key === "Tab" && !e.shiftKey && selected?.kind === "folder") {
      e.preventDefault();
      enterFolder(selected.folder.path);
    } else if (e.key === "Backspace" && !query && folder) {
      e.preventDefault();
      setFolder(null);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Enter" && selected?.kind === "folder") {
      e.preventDefault();
      enterFolder(selected.folder.path);
    }
  };
  let position = -1;
  return h(
    SynFigure,
    { onReset: reset },
      <div
        className="syn-pal-stage"
        onKeyDown={(e) => {
          if (!open && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {open ? (
          <div className="syn-pal" role="dialog" aria-label={placeholder}>
            <div className="syn-pal-head">
              {h(SynIcon, { name: I("MagnifyingGlass") })}
              {folder ? (
                <button
                  type="button"
                  className="syn-pal-chip"
                  aria-label={LF("Remove the {name} folder filter", { name: synFolderName(folder) })}
                  title={synFolderPath(folder)}
                  onClick={() => setFolder(null)}
                >
                  {h(SynIcon, { name: I("Folder"), size: 12 })}
                  {synFolderName(folder)}
                  {h(SynIcon, { name: I("X"), size: 12 })}
                </button>
              ) : null}
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={selected ? `${listId}-${sel}` : undefined}
                aria-label={placeholder}
                placeholder={placeholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIndex(0);
                }}
                onKeyDown={onKeyDown}
              />
              <button type="button" className="syn-pal-close" aria-label={L("Close")} onClick={() => setOpen(false)}>
                {h(SynIcon, { name: I("X"), size: 12 })}
              </button>
            </div>
            <div className="syn-pal-list" id={listId} role="listbox" aria-label={placeholder}>
              {flat.length === 0 && !folder ? <div className="syn-pal-empty">{L("No results found.")}</div> : null}
              {groups.map((group, g) => (
                <div key={group.heading} role="group" aria-label={group.heading}>
                  {g > 0 ? <div className="syn-pal-divider" /> : null}
                  <div className="syn-pal-heading" aria-hidden="true">{group.heading}</div>
                  {group.items.length === 0 && group.emptyText ? <div className="syn-pal-empty">{group.emptyText}</div> : null}
                  {group.items.map((item) => {
                    position += 1;
                    const i = position;
                    return (
                      h(SynPalItem, { key: `${group.heading}-${i}`, id: `${listId}-${i}`, item, selected: i === sel, inFolder: Boolean(folder), onHover: () => setIndex(i), onPick: () => (item.kind === "folder" ? enterFolder(item.folder.path) : setIndex(i)) })
                    );
                  })}
                </div>
              ))}
            </div>
            {folder ? (
              <div className="syn-pal-foot">
                <span><kbd>↑↓</kbd> {L("Choose")}</span>
                <span><kbd>{L("Enter")}</kbd> {L("Open")}</span>
                <span><kbd>{L("Backspace")}</kbd> {L("Leave the folder")}</span>
                <span><kbd>{L("Esc")}</kbd> {L("Close")}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ display: "grid", placeItems: "center", minHeight: 300 }}>
            <button type="button" className="syn-ui-btn" onClick={() => setOpen(true)}>
              {h(SynIcon, { name: I("MagnifyingGlass") })} Reopen the palette (Ctrl K)
            </button>
          </div>
        )}
      </div>
  );
};

// <AskNote> : « Demander à la note » (Ctrl+J), le chat ouvert à droite d'une
// note à l'étape Synthèse. Reproduit apps/desktop/src/chat/components/
// toolbar-controls.tsx (historique, « Nouveau chat », « Chat flottant »,
// « Fermer la discussion »), body/empty.tsx (suggestions, « Lancer une
// automatisation », sans modèle : « Ouvrir les paramètres de l'IA »),
// folders/project/next-meeting-suggestion.tsx, input/index.tsx (champ, saisie
// vocale, envoi), les mentions @ de editor-bridge/mention-config.ts
// (dossiers, notes, contacts ; 8 au plus), message/normal.tsx (« Activité »),
// message/tool/edit-summary.tsx et session/components/living-document/
// summary-review.tsx (modification proposée du résumé), la capsule en
// Synthèse (session/components/capsule/, automation-menu.tsx) et la
// notification de automations/launch.tsx. Réponses du modèle : exemples.

const SYN_CSS_CHAT = `
.syn-chat-body{display:flex;height:540px}
.syn-chat-doc{position:relative;flex:1 1 auto;min-width:0;overflow:auto;padding:22px 28px 96px}
.syn-chat-meta{margin:-6px 0 16px;font-size:13px;color:var(--syn-muted-foreground)}
.syn-chat-cap .syn-menu{top:auto!important;bottom:calc(100% + 8px);color:var(--syn-foreground)}
.syn-chat-cap .syn-menu [role=menuitem]{align-items:flex-start}
.syn-chat-review{border:1px solid var(--syn-border);border-radius:14px;background:var(--syn-card);margin:0 0 16px}
.syn-chat-review header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid var(--syn-border);padding:9px 14px}
.syn-chat-review header p{margin:0;font-size:12px;color:var(--syn-muted-foreground)}
.syn-chat-review header p:first-child{font-size:13px;font-weight:500;color:var(--syn-foreground)}
.syn-chat-diff{display:flex;flex-direction:column;gap:6px;padding:12px 14px}
.syn-chat-diff del,.syn-chat-diff ins{display:block;border-left:2px solid;border-radius:0 6px 6px 0;padding:2px 10px;text-decoration:none}
.syn-chat-diff del{border-color:var(--syn-destructive);color:var(--syn-muted-foreground);text-decoration:line-through;background:color-mix(in srgb,var(--syn-destructive) 6%,transparent)}
.syn-chat-diff ins{border-color:var(--syn-primary);background:color-mix(in srgb,var(--syn-accent) 70%,transparent)}
.syn-chat-panel{position:relative;flex:0 0 340px;display:flex;flex-direction:column;border-left:1px solid var(--syn-border);background:var(--syn-background)}
.syn-chat-bar{display:flex;align-items:center;gap:2px;height:44px;padding:0 6px 0 10px}
.syn-chat-bar .syn-icon-btn{border-radius:999px}
.syn-chat-hist{display:flex;align-items:center;gap:4px;width:auto;padding:0 8px}
.syn-chat-msgs{flex:1;overflow:auto;display:flex;flex-direction:column;gap:12px;padding:6px 14px 12px}
.syn-chat-sugg{display:grid;grid-template-columns:24px minmax(0,1fr);align-items:center;gap:6px;width:100%;border:0;border-radius:8px;background:transparent;color:var(--syn-muted-foreground);padding:7px 10px 7px 0;font:400 13.5px/1.3 Geist,system-ui,sans-serif;text-align:left;cursor:pointer}
.syn-chat-sugg:hover{background:var(--syn-muted);color:var(--syn-foreground)}
.syn-chat-sugg span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.syn-chat-sugg svg{justify-self:center}
.syn-chat-group-label{margin:8px 0 2px;font-size:12px;font-weight:500;color:var(--syn-muted-foreground)}
.syn-chat-user{align-self:flex-end;max-width:88%;border-radius:14px;background:var(--syn-muted);padding:7px 11px;font-size:13.5px}
.syn-chat-bot{font-size:13.5px}
.syn-chat-bot p{margin:0 0 6px}
.syn-chat-disc{display:inline-flex;align-items:center;gap:5px;margin-bottom:6px;border:0;background:none;padding:2px 0;font:inherit;font-size:12px;color:var(--syn-muted-foreground);cursor:pointer}
.syn-chat-tool{margin-top:6px;border:1px solid var(--syn-border);border-radius:12px;background:var(--syn-card);font-size:12.5px}
.syn-chat-tool>p{display:flex;align-items:center;gap:6px;margin:0;padding:8px 12px;font-weight:500}
.syn-chat-tool>div{display:flex;justify-content:flex-end;gap:6px;border-top:1px solid var(--syn-border);padding:8px 12px}
.syn-chat-input{position:relative;margin:0 10px 10px;border:1px solid var(--syn-input);border-radius:16px;background:var(--syn-card);padding:8px 8px 6px 12px}
.syn-chat-input input{width:100%;border:0;background:transparent;color:var(--syn-foreground);font:400 13.5px/1.4 Geist,system-ui,sans-serif;outline:none}
.syn-chat-input input::placeholder{color:var(--syn-faint)}
.syn-chat-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.syn-chat-row input{flex:1;min-width:120px}
.syn-chat-chip{border-radius:6px;background:var(--syn-accent);color:var(--syn-accent-foreground);padding:0 6px;font-size:12.5px}
.syn-chat-send{display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:999px;background:var(--syn-primary);color:var(--syn-primary-foreground);cursor:pointer}
.syn-chat-send:disabled{background:var(--syn-muted);color:var(--syn-muted-foreground);cursor:default}
.syn-chat-mentions{position:absolute;left:0;right:0;bottom:calc(100% + 6px);z-index:20;margin:0;padding:4px;list-style:none;border:1px solid var(--syn-border);border-radius:10px;background:var(--syn-popover);box-shadow:var(--syn-shadow-capsule)}
.syn-chat-mentions li{display:flex;align-items:center;gap:8px;border-radius:6px;padding:6px 8px;font-size:13px;cursor:pointer}
.syn-chat-mentions li[aria-selected=true]{background:var(--syn-muted)}
.syn-chat-mentions li span:nth-child(2){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.syn-chat-mentions li span:last-child{margin-left:auto;flex-shrink:0;font-size:12px;color:var(--syn-muted-foreground)}
.syn-chat-beta{border:1px solid color-mix(in srgb,var(--syn-primary) 30%,transparent);border-radius:999px;background:var(--syn-accent);color:var(--syn-accent-foreground);padding:1px 6px;font-size:10px;font-weight:500}
.syn-chat-toast{position:absolute;right:16px;bottom:16px;z-index:30;display:flex;align-items:flex-start;gap:10px;max-width:360px;border:1px solid var(--syn-border);border-radius:12px;background:var(--syn-popover);box-shadow:var(--syn-shadow-capsule);padding:10px 12px;font-size:13px}
.syn-chat-toast small{display:block;margin-top:2px;font-size:12px;color:var(--syn-muted-foreground);word-break:break-all}
`;

const SYN_CHAT_SUMMARY = [
  ["Decisions", ["The beta moves to November 21.", "The transcription server quota is checked before Thursday."]],
  ["Action items", ["Camille: notify the testers (Tuesday).", "Malik: check the server quota (Thursday)."]],
];
const SYN_CHAT_SHORTER = [["Decisions and action items", ["Beta moved to November 21: Camille notifies the testers on Tuesday, Malik checks the server quota on Thursday."]]];
const SYN_CHAT_LONGER = [
  ["Decisions", ["The beta moves to November 21, to give the support team a week of testing.", "The transcription server quota is checked before Thursday: the beta will double the number of concurrent sessions."]],
  ["Action items", ["Camille: notify the testers of the new schedule (Tuesday).", "Malik: check the server quota and plan some headroom (Thursday)."]],
];

// Mentions : même recherche et même ordre que la palette Ctrl+K.
const SYN_CHAT_POOL = [
  { type: "folder", label: "Roadmap", count: 12, keys: "product roadmap" },
  { type: "folder", label: "Launch", count: 5, keys: "launch projects" },
  { type: "session", label: "Weekly product sync", folder: "Product/Roadmap", keys: "point hebdo produit" },
  { type: "session", label: "Beta launch review", folder: "Projects/Launch", keys: "beta launch review" },
  { type: "session", label: "Pricing workshop", folder: "Product/Roadmap", keys: "pricing workshop launch" },
  { type: "session", label: "Sprint 44 retro", keys: "sprint retro" },
  { type: "human", label: "Camille Roussel", keys: "camille roussel" },
  { type: "human", label: "Malik Benali", keys: "malik benali" },
];
const SYN_CHAT_MENTION_ICONS = { folder: I("Folder"), session: I("Note"), human: I("User") };

const synChatMentions = (query) => {
  const q = synNorm(query);
  const hits = SYN_CHAT_POOL.filter((p) => !q || synNorm(p.keys + " " + p.label).includes(q));
  const folders = hits.filter((p) => p.type === "folder").slice(0, 8);
  const contacts = hits.filter((p) => p.type === "human").slice(0, Math.max(0, 8 - folders.length));
  const notes = hits.filter((p) => p.type === "session").slice(0, Math.max(0, 8 - folders.length - contacts.length));
  return [...folders, ...notes, ...contacts];
};

// Automatisations prêtes : titre, puis les actions enchaînées (launch.tsx).
const synChatAutomations = () => [
  { title: L("Export as Markdown"), chain: L("Export as Markdown"), detail: "/home/camille/Notes/2026-11-04 Weekly product sync.md" },
  { title: L("Extract tasks"), chain: `${L("Generate with the local model")} → ${L("Write to the vault")}`, detail: "Note created: Tasks – Weekly product sync" },
];

const synChatSuggestions = () => [
  { key: "shorter", icon: I("ArrowsInSimple"), label: L("Make the summary shorter."), prompt: L("Make the current summary noticeably shorter than it is now. Keep every decision, owner, deadline, and open question; cut repetition and secondary detail.") },
  { key: "longer", icon: I("ArrowsOutSimple"), label: L("Make the summary longer."), prompt: L("Make the current summary more detailed than it is now. Add supporting context, rationale, and examples from the transcript without inventing anything.") },
  { key: "actions", icon: I("ListChecks"), label: L("List action items."), prompt: L("What are my action items from this meeting?") },
  { key: "mail", icon: I("Envelope"), label: L("Draft follow-up email."), prompt: L("Draft a follow-up email to the participants") },
  { key: "decisions", icon: I("MagnifyingGlass"), label: L("Find key decisions."), prompt: L("What were the key decisions that have been made?") },
];

const SYN_CHAT_ANSWERS = {
  actions: ["Your action items from “Weekly product sync”:", "1. Notify the testers of the new beta schedule (with Camille, Tuesday).", "2. Review the launch message before November 21."],
  mail: ["Subject: Weekly product sync — decisions", "Hi all, thanks for the meeting. The beta moves to November 21; Malik checks the server quota before Thursday, Camille notifies the testers on Tuesday."],
  decisions: ["Key decisions:", "— The beta moves to November 21.", "— The transcription server quota is checked before Thursday."],
  shorter: ["Here is a shorter summary. It replaces the summary on screen: apply it or reject it."],
  longer: ["Here is a more detailed summary. It replaces the summary on screen: apply it or reject it."],
};

const SynChatSummary = ({ sections }) => (
  <div className="syn-summary">
    {sections.map(([title, items]) => (
      <div key={title}>
        <h4>{title}</h4>
        <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
    ))}
  </div>
);

const SynChatReview = ({ proposal, onReview }) => (
  <section className="syn-chat-review" aria-label={L("Proposed summary edit")}>
    <header>
      <div>
        <p>{L("Proposed edit to the summary")}</p>
        <p>{L("Removed text is struck through, added text is highlighted.")}</p>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="syn-ui-btn" onClick={() => onReview(false)}>{L("Decline")}</button>
        <button type="button" className="syn-ui-btn" onClick={() => onReview(true)}>{L("Apply to summary")}</button>
      </div>
    </header>
    <div className="syn-chat-diff">
      {SYN_CHAT_SUMMARY.flatMap(([, items]) => items).map((text) => (
        <del key={text}><span className="syn-sr">{L("Removed:")}</span>{text}</del>
      ))}
      {proposal.flatMap(([, items]) => items).map((text) => (
        <ins key={text}><span className="syn-sr">{L("Added:")}</span>{text}</ins>
      ))}
    </div>
  </section>
);

const SynChatBot = ({ message, onToggle, onReview }) => (
  <div className="syn-chat-bot">
    <button type="button" className="syn-chat-disc" aria-expanded={message.open} onClick={onToggle}>
      {h(SynIcon, { name: I("Brain"), size: 12 })}
      {L("Activity")}
      {h(SynIcon, { name: message.open ? I("CaretDown") : I("CaretRight"), size: 12 })}
    </button>
    {message.open ? <p className="syn-muted syn-small">Reading the open note, then finding the relevant passages in the summary.</p> : null}
    {message.lines.map((line) => <p key={line}>{line}</p>)}
    {message.edit ? (
      <div className="syn-chat-tool">
        <p>
          {h(SynIcon, { name: I("Pencil"), size: 14 })}
          {message.edit === "pending" ? L("Edit summary — waiting for your review") : message.edit === "applied" ? L("Summary updated") : L("Summary edit declined")}
        </p>
        {message.edit === "pending" ? (
          <div>
            <button type="button" className="syn-ui-btn" onClick={() => onReview(false)}>{L("Decline")}</button>
            <button type="button" className="syn-ui-btn" data-variant="primary" onClick={() => onReview(true)}>{L("Apply to summary")}</button>
          </div>
        ) : null}
      </div>
    ) : null}
  </div>
);

const synChatInitial = (open, noModel) => ({ open, noModel, messages: [], draft: "", chips: [], selected: 0, review: null, summary: SYN_CHAT_SUMMARY, toast: null });

/**
 * « Demander à la note » : note à l'étape Synthèse et chat à droite.
 * Repères : 1 « Demander à la note », 2 suggestions, 3 champ (@), 4 « Lancer
 * une automatisation », 5 « Nouveau chat ».
 */
export const AskNote = ({ open = true, noModel = false, markers = true }) => {
  const [s, setS] = useState(() => synChatInitial(open, noModel));
  const [showMarkers, setShowMarkers] = useState(markers);
  const [stageRef, windowRef, scale, scaledHeight] = useSynScale(1080);
  const patch = (p) => setS((prev) => ({ ...prev, ...p }));
  const at = s.draft.lastIndexOf("@");
  const mentions = at >= 0 ? synChatMentions(s.draft.slice(at + 1)) : [];
  const empty = s.messages.length === 0;
  const hs = (n, style) => (showMarkers ? h(SynHotspot, { n, style }) : null);

  const say = (text, chips, key) => {
    const edit = key === "shorter" || key === "longer";
    const lines = SYN_CHAT_ANSWERS[key] ?? [
      chips.length
        ? `According to ${chips.map((c) => `“${c}”`).join(" and ")}: the launch date came up twice, then was set to November 21.`
        : "In “Weekly product sync”, the beta moves to November 21 and the server quota must be checked before Thursday.",
    ];
    setS((prev) => ({
      ...prev,
      draft: "",
      chips: [],
      review: edit ? (key === "shorter" ? SYN_CHAT_SHORTER : SYN_CHAT_LONGER) : prev.review,
      messages: [...prev.messages, { role: "user", text, chips }, { role: "bot", lines, open: false, edit: edit ? "pending" : null }],
    }));
  };
  const review = (apply) =>
    setS((prev) => ({
      ...prev,
      summary: apply && prev.review ? prev.review : prev.summary,
      review: null,
      messages: prev.messages.map((m) => (m.edit === "pending" ? { ...m, edit: apply ? "applied" : "declined" } : m)),
    }));
  const pickMention = (item) => patch({ chips: [...s.chips, item.label], draft: s.draft.slice(0, at).trimEnd(), selected: 0 });
  const send = () => {
    if (s.draft.trim() || s.chips.length) say(s.draft.trim(), s.chips, null);
  };
  const onKeyDown = (e) => {
    if (mentions.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      patch({ selected: (s.selected + (e.key === "ArrowDown" ? 1 : -1) + mentions.length) % mentions.length });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (mentions.length) pickMention(mentions[Math.min(s.selected, mentions.length - 1)]);
      else send();
    } else if (e.key === "Escape" && at >= 0) {
      e.preventDefault();
      patch({ draft: s.draft.slice(0, at) });
    }
  };
  const runAutomation = (a) => patch({ toast: { title: LF("“{title}” ran on this note", { title: a.title }), detail: a.detail } });
  const reset = () => setS(synChatInitial(open, noModel));
  const onFigureKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
      e.preventDefault();
      patch({ open: !s.open });
    }
  };

  return (
    <figure className="syn-root syn-figure not-prose" onKeyDown={onFigureKey}>
      {h(SynStyle)}
      <div className="syn-bar" style={{ marginBottom: 0 }}>
        <label className="syn-check">
          <input type="checkbox" checked={s.noModel} onChange={(e) => patch({ noModel: e.target.checked, messages: [], review: null })} />
          No model connected
        </label>
      </div>
      {h(SynToolbar, { markers: showMarkers, setMarkers: setShowMarkers, onReset: reset })}
      <div className="syn-stage" ref={stageRef} style={{ height: scaledHeight }}>
        <div className="syn-window" ref={windowRef} style={{ width: 1080, transform: `scale(${scale})` }}>
          <div className="syn-titlebar">
            <strong>Weekly product sync</strong>
            <span>· Syntheo</span>
          </div>
          <div className="syn-chat-body">
            <div className="syn-chat-doc">
              <p className="syn-title">Weekly product sync</p>
              <p className="syn-chat-meta"><span className="syn-chip">Product / Roadmap</span> · Tue, Nov 4 · Camille R., Malik B., you</p>
              {s.review ? h(SynChatReview, { proposal: s.review, onReview: review }) : h(SynChatSummary, { sections: s.summary })}
              <div className="syn-capsule-slot syn-chat-cap" style={{ position: "absolute" }}>
                <div className="syn-capsule" role="group" aria-label={L("Note capsule")}>
                  <ol className="syn-steps" aria-label={L("Note steps")}>
                    {SYN_STAGES.map(([id, kanji, label], index) => (
                      <li key={id} aria-current={id === "synthesis" ? "step" : undefined}>
                        {index > 0 ? <span aria-hidden="true" style={{ opacity: 0.7, fontWeight: 400 }}>·</span> : null}
                        <span><span className="syn-kanji" aria-hidden="true">{kanji}</span>{label}</span>
                      </li>
                    ))}
                  </ol>
                  <span className="syn-sep" aria-hidden="true" />
                  <button type="button" className="syn-btn">{L("Copy")}</button>
                  <button type="button" className="syn-btn" title={`${L("Export")} (Ctrl+P)`}>{L("Export")}</button>
                  {h(SynMenuButton, {
                    label: L("Automations"),
                    buttonClassName: "syn-btn",
                    align: "left",
                    items: [{ heading: L("Run an automation") }, ...synChatAutomations().map((a) => ({ label: a.title, icon: I("Lightning"), onSelect: () => runAutomation(a) }))],
                    children: L("Automations"),
                  })}
                  <span style={{ position: "relative" }}>
                    {hs(1, { left: "50%", top: -30, marginLeft: -11 })}
                    <button type="button" className="syn-btn" data-tone="primary" aria-keyshortcuts="Control+J" onClick={() => patch({ open: !s.open })}>
                      {L("Ask the note")}
                      <kbd aria-hidden="true">Ctrl J</kbd>
                    </button>
                  </span>
                </div>
              </div>
            </div>
            {s.open ? (
              <aside className="syn-chat-panel" aria-label={L("Ask the note")}>
                <div className="syn-chat-bar">
                  <button type="button" className="syn-icon-btn syn-chat-hist" aria-label={L("Chat history")}>
                    {h(SynIcon, { name: I("ClockCounterClockwise") })}
                    {h(SynIcon, { name: I("CaretDown"), size: 14 })}
                  </button>
                  <span style={{ flex: 1 }} />
                  <span style={{ position: "relative" }}>
                    {hs(5, { left: -6, top: -14 })}
                    <button type="button" className="syn-icon-btn" aria-label={L("New chat")} title={L("New chat")} onClick={() => patch({ messages: [], chips: [], draft: "", review: null })}>
                      {h(SynIcon, { name: I("Plus") })}
                    </button>
                  </span>
                  <button type="button" className="syn-icon-btn" aria-label={L("Float chat")} title={L("Float chat")}>{h(SynIcon, { name: I("PictureInPicture") })}</button>
                  <button type="button" className="syn-icon-btn" aria-label={L("Close chat")} title={L("Close chat")} onClick={() => patch({ open: false })}>{h(SynIcon, { name: I("X") })}</button>
                </div>
                <div className="syn-chat-msgs" aria-live="polite">
                  {s.noModel ? (
                    <div>
                      <p style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px", fontWeight: 500 }}>
                        Syntheo AI <span className="syn-chat-beta">{L("Beta")}</span>
                      </p>
                      <p className="syn-muted" style={{ margin: "0 0 8px" }}>{L("Hi, I'm Syntheo AI. Set up a language model and I'll be ready to help.")}</p>
                      <button type="button" className="syn-ui-btn" data-variant="primary" style={{ borderRadius: 999, minHeight: 28, fontSize: 12 }}>
                        {h(SynIcon, { name: I("Sparkle"), size: 12 })}
                        {L("Open AI Settings")}
                      </button>
                    </div>
                  ) : empty ? (
                    <div style={{ position: "relative" }}>
                      {hs(2, { right: 0, top: -4 })}
                      {synChatSuggestions().map((sg) => (
                        <button key={sg.key} type="button" className="syn-chat-sugg" onClick={() => say(sg.prompt, [], sg.key)}>
                          {h(SynIcon, { name: sg.icon })}
                          <span>{sg.label}</span>
                        </button>
                      ))}
                      <button type="button" className="syn-chat-sugg" title={LF("Opens the Next meeting block of the folder {folderPath}.", { folderPath: "Product/Roadmap" })}>
                        {h(SynIcon, { name: I("ListNumbers") })}
                        <span>{L("Prepare the agenda for the next meeting.")}</span>
                      </button>
                      <div role="group" aria-label={L("Run an automation")} style={{ position: "relative" }}>
                        {hs(4, { right: 0, top: 4 })}
                        <p className="syn-chat-group-label">{L("Run an automation")}</p>
                        {synChatAutomations().map((a) => (
                          <button key={a.title} type="button" className="syn-chat-sugg" title={a.chain} onClick={() => runAutomation(a)}>
                            {h(SynIcon, { name: I("Lightning") })}
                            <span>{a.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    s.messages.map((m, i) =>
                      m.role === "user" ? (
                        <div key={i} className="syn-chat-user">
                          {m.chips.map((c) => <span key={c} className="syn-chat-chip" style={{ marginRight: 4 }}>@{c}</span>)}
                          {m.text}
                        </div>
                      ) : (
                        h(SynChatBot, {
                          key: i,
                          message: m,
                          onReview: review,
                          onToggle: () => patch({ messages: s.messages.map((x, j) => (j === i ? { ...x, open: !x.open } : x)) }),
                        })
                      ),
                    )
                  )}
                </div>
                <div className="syn-chat-input">
                  {hs(3, { left: -12, top: -10 })}
                  {mentions.length ? (
                    <ul className="syn-chat-mentions" role="listbox" aria-label="Mention suggestions">
                      {mentions.map((item, i) => (
                        <li key={item.label} role="option" aria-selected={i === Math.min(s.selected, mentions.length - 1)} onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(item)}>
                          {h(SynIcon, { name: SYN_CHAT_MENTION_ICONS[item.type] })}
                          <span>{item.label}</span>
                          <span>{item.type === "folder" ? LP("{count, plural, one {# meeting} other {# meetings}}", item.count) : item.folder ? synFolderPath(item.folder) : ""}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="syn-chat-row">
                    {s.chips.map((c) => <span key={c} className="syn-chat-chip">@{c}</span>)}
                    <input
                      type="text"
                      aria-label={L("Ask anything")}
                      placeholder={s.chips.length ? "" : L("Ask anything")}
                      value={s.draft}
                      disabled={s.noModel}
                      onChange={(e) => patch({ draft: e.target.value, selected: 0 })}
                      onKeyDown={onKeyDown}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 4 }}>
                    <button type="button" className="syn-icon-btn" aria-label={L("Start voice input")}>{h(SynIcon, { name: I("Microphone") })}</button>
                    <button type="button" className="syn-chat-send" aria-label={L("Send message")} disabled={!s.draft.trim() && !s.chips.length} onClick={send}>
                      {h(SynIcon, { name: I("ArrowUp"), size: 15 })}
                    </button>
                  </div>
                </div>
              </aside>
            ) : null}
          </div>
          {s.toast ? (
            <div className="syn-chat-toast" role="status">
              <span style={{ flex: 1 }}>{s.toast.title}<small>{s.toast.detail}</small></span>
              <button type="button" className="syn-icon-btn" style={{ width: 24, height: 24 }} aria-label={L("Close")} onClick={() => patch({ toast: null })}>
                {h(SynIcon, { name: I("X"), size: 14 })}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </figure>
  );
};

// <AutomationEditor> : la vue Automatisations. Reproduit apps/desktop/src/
// sidebar/automations.tsx, settings/automations/index.tsx (vue d'ensemble,
// en-tête), workflow-builder.tsx, add-step-menu.tsx, step-forms.tsx,
// markdown-export-config.tsx, markdown-export-options.tsx, variable-field.tsx,
// workflow-test-panel.tsx et workflow-test-result.tsx ; libellés de
// automations/labels.ts. Non reproduits : le chat de droite, le nom de fichier
// d'export. Un champ à variables : pastilles puis champ texte (Retour arrière
// retire la dernière). Résultats du test : exemples.

const SYN_CSS_AUTOMATIONS = `
.syn-auto{display:flex;height:600px}.syn-auto-side{flex:0 0 230px;display:flex;flex-direction:column;gap:8px;border-right:1px solid var(--syn-border);background:var(--syn-muted);padding:10px}.syn-auto-side .syn-set-search{height:32px}.syn-auto-item{display:flex;align-items:center;gap:8px;width:100%;border:0;border-radius:8px;background:transparent;padding:7px 10px;color:var(--syn-foreground);text-align:left;font:inherit;cursor:pointer}
.syn-auto-item:hover{background:color-mix(in srgb,var(--syn-accent) 50%,transparent)}.syn-auto-item[aria-current=page]{background:var(--syn-accent)}.syn-auto-item b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;font-size:13.5px}.syn-auto-item small{display:block;font-size:12px;color:var(--syn-muted-foreground)}
.syn-auto-main{position:relative;flex:1;min-width:0;display:flex;flex-direction:column}.syn-auto-head{display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--syn-border);padding:10px 20px}.syn-auto-head h3{flex:1;min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 20px/1.2 Newsreader,Georgia,serif}.syn-auto-scroll{flex:1;overflow:auto;padding:14px 20px 28px;display:flex;flex-direction:column;gap:16px;font-size:13px}
.syn-auto-box{border:1px solid var(--syn-border);border-radius:16px;background:var(--syn-background)}.syn-auto-box>header{display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--syn-border);padding:14px 18px}.syn-auto-box h4{margin:0;font-size:14px;font-weight:600}.syn-auto-badge{display:inline-flex;align-items:center;border:1px solid var(--syn-border);border-radius:999px;padding:0 8px;font-size:11.5px;font-weight:500;color:var(--syn-foreground)}
.syn-auto-steps{margin:0;padding:16px 18px;list-style:none}.syn-auto-card{display:flex;align-items:flex-start;gap:12px;border:1px solid var(--syn-border);border-radius:12px;background:var(--syn-card);padding:14px}.syn-auto-num{display:grid;place-items:center;flex-shrink:0;width:28px;height:28px;border-radius:999px;background:color-mix(in srgb,var(--syn-primary) 14%,transparent);color:var(--syn-primary);font-size:12px;font-weight:600}.syn-auto-eyebrow{display:block;font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--syn-muted-foreground)}
.syn-auto-arrow{display:flex;height:24px;align-items:center;padding-left:22px;color:var(--syn-muted-foreground)}.syn-auto-field{display:flex;flex-direction:column;gap:5px;margin-top:10px}.syn-auto-field>span:first-child,.syn-auto-label{font-size:12px;font-weight:500}.syn-auto .syn-select,.syn-auto .syn-input{max-width:320px;min-height:32px;font-size:12.5px}
.syn-auto-var{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-height:32px;border:1px solid var(--syn-input);border-radius:7px;background:var(--syn-background);padding:4px 8px;font-size:12.5px;white-space:pre-wrap}.syn-auto-var[data-mono]{font-family:"Geist Mono",ui-monospace,monospace;font-size:12px}.syn-auto-var input{flex:1;min-width:80px;border:0;background:transparent;color:var(--syn-foreground);font:inherit;outline:none}.syn-auto-pill{border-radius:999px;background:color-mix(in srgb,var(--syn-primary) 13%,transparent);color:var(--syn-primary);padding:0 8px;font:500 11.5px/1.6 Geist,system-ui,sans-serif}
.syn-auto-pill[data-missing]{background:var(--syn-alert);color:var(--syn-destructive)}button.syn-auto-pill{border:0;cursor:pointer}.syn-auto-chips{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:8px;font-size:12px;color:var(--syn-muted-foreground)}.syn-auto-note{margin:8px 0 0;border-radius:8px;padding:7px 10px;font-size:12px;background:var(--syn-muted)}
.syn-auto-add{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:20px;border:1px dashed var(--syn-border);border-radius:12px;background:color-mix(in srgb,var(--syn-muted) 40%,transparent);padding:14px}.syn-auto-add p{margin:0}.syn-auto-foot{border-top:1px solid var(--syn-border);padding:12px 18px;font-size:12px;color:var(--syn-muted-foreground)}.syn-auto-foot p{margin:0}
.syn-auto-test{display:flex;flex-direction:column;gap:12px;border:1px solid var(--syn-border);border-radius:16px;padding:16px 18px}.syn-auto-notes{margin:0;padding:0;list-style:none;border:1px solid var(--syn-border);border-radius:8px;overflow:hidden}.syn-auto-notes li{display:flex;gap:8px;align-items:baseline;border-top:1px solid var(--syn-border);padding:6px 10px;cursor:pointer}.syn-auto-notes li:first-child{border-top:0}
.syn-auto-notes li[aria-selected=true]{background:var(--syn-accent);color:var(--syn-accent-foreground)}.syn-auto-warn{display:flex;gap:8px;border:1px solid var(--syn-alert-border);border-radius:8px;background:var(--syn-alert);color:var(--syn-alert-foreground);padding:8px 10px;font-size:12px}.syn-auto-warn[data-sim]{border-color:var(--syn-border);background:var(--syn-muted);color:var(--syn-muted-foreground)}.syn-auto-warn ul{margin:4px 0 0;padding:0;list-style:none}
.syn-auto-result ol{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}.syn-auto-result li{display:flex;gap:8px}.syn-auto-tpl{display:grid;grid-template-columns:1fr 1fr;gap:10px}.syn-auto-tpl button,.syn-auto-list button{display:flex;flex-direction:column;gap:3px;border:1px solid var(--syn-border);border-radius:12px;background:var(--syn-background);padding:12px 14px;color:var(--syn-foreground);text-align:left;font:inherit;cursor:pointer}
.syn-auto-tpl button:hover,.syn-auto-list button:hover{background:color-mix(in srgb,var(--syn-accent) 50%,transparent)}.syn-auto-list{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}.syn-auto-list button{flex-direction:row;align-items:center;width:100%}
`;

const SYN_AUTO_TYPES = ["markdown_export", "generate_text", "vault_write", "clipboard", "notification", "webhook", "command"];
const SYN_AUTO_ADVANCED = ["webhook", "command"];
const SYN_AUTO_OUTPUT = { markdown_export: "file", generate_text: "text", command: "text" };
const SYN_AUTO_EFFECT = { markdown_export: "file", vault_write: "vault", clipboard: "clipboard", notification: "notification", webhook: "webhook", command: "command" };

const synAutoLabels = () => ({
  trigger: {
    note_enhanced: [L("Meeting summary ready"), L("When the meeting summary is ready")],
    meeting_completed: [L("Meeting ends"), L("When the meeting ends")],
    manual: [L("Launched by hand"), L("When you launch it from a note")],
  },
  step: {
    markdown_export: [L("Export as Markdown"), L("Writes the note to a folder on your computer.")],
    generate_text: [L("Generate with the local model"), L("Applies an instruction (tasks, short summary, follow-up message); the result feeds the next steps.")],
    vault_write: [L("Write to the vault"), L("Creates or completes a note in the vault.")],
    clipboard: [L("Copy to the clipboard"), L("Ready to paste into a message or a document.")],
    notification: [L("System notification"), L("Lets you know when the automation has finished.")],
    webhook: [L("Send to an address (webhook)"), L("JSON to n8n, Home Assistant or a home server. The only step that leaves your computer.")],
    command: [L("Run a command"), L("Local script with the path of the exported file. Asks for confirmation the first time.")],
  },
  effect: { file: L("writes a Markdown file to the chosen folder"), vault: L("creates or completes a note in your vault"), clipboard: L("replaces the content of the clipboard"),
    notification: L("shows a system notification"), webhook: L("sends the JSON to the address, outside your computer"), command: L("runs the program on your computer") },
});

// Variables de la note : msgid avec msgctxt « automation variable » (non pris
// en charge par L), libellés français de messages.po.
const SYN_AUTO_VARS = [["summary", "Summary"], ["notes", "Notes"], ["transcript", "Transcript"], ["title", "Title"], ["date", "Date"]];
const synAutoOutName = (step) => step.outputName?.trim() || (step.type === "command" ? L("Command output") : SYN_AUTO_OUTPUT[step.type] === "file" ? L("Exported file") : L("Generated text"));
const synAutoField = (...segs) => ({ segs, trail: "" });
const synAutoFilled = (f) => f.segs.length > 0 || f.trail.trim().length > 0;
const synAutoUrlOk = (url) => /^https?:\/\/[^\s@?]+$/.test(url.trim());

let synAutoSeq = 100;
const synAutoNew = (type) => {
  const id = `s${(synAutoSeq += 1)}`;
  if (type === "markdown_export") return { id, type, directory: "", include: { memo: true, summary: true, transcript: true, actions: true } };
  if (type === "generate_text") return { id, type, prompt: synAutoField(), outputName: "" };
  if (type === "vault_write") return { id, type, mode: "create", folder: synAutoField(), title: synAutoField(), content: synAutoField() };
  if (type === "clipboard") return { id, type, content: synAutoField() };
  if (type === "notification") return { id, type, title: synAutoField(), message: synAutoField() };
  if (type === "webhook") return { id, type, url: "", body: synAutoField({ t: '{\n  "title": "' }, { v: "title" }, { t: '",\n  "date": "' }, { v: "date" }, { t: '",\n  "summary": "' }, { v: "summary" }, { t: '"\n}' }) };
  return { id, type: "command", program: "", args: [], outputName: "" };
};

const synAutoReady = (step) => {
  if (step.type === "markdown_export") return Boolean(step.directory) && Object.values(step.include).some(Boolean);
  if (step.type === "generate_text") return synAutoFilled(step.prompt);
  if (step.type === "vault_write") return synAutoFilled(step.title) && synAutoFilled(step.content);
  if (step.type === "clipboard") return synAutoFilled(step.content);
  if (step.type === "notification") return synAutoFilled(step.title) || synAutoFilled(step.message);
  if (step.type === "webhook") return synAutoUrlOk(step.url);
  return step.program.trim().length > 0;
};

// Une pastille {v: "step:<id>"} pointe vers une étape placée avant.
const synAutoDangling = (wf) =>
  wf.steps.some((step, index) => {
    const before = wf.steps.slice(0, index).map((s) => `step:${s.id}`);
    return Object.values(step).some((f) => f && f.segs && f.segs.some((g) => g.v?.startsWith("step:") && !before.includes(g.v)));
  });
const synAutoWfReady = (wf) => wf.steps.length > 0 && wf.steps.every(synAutoReady) && !synAutoDangling(wf);

// Modèle « Extraire les tâches » (templates.ts). « Tâches » et « Tâches – » :
// msgctxt « vault folder » et « vault note title ».
const synAutoTasks = () => {
  const gen = { ...synAutoNew("generate_text"), prompt: synAutoField({ t: L("List the action items decided during the meeting, one per line, with the person responsible. Meeting summary:") + " " }, { v: "summary" }) };
  return [gen, { ...synAutoNew("vault_write"), folder: synAutoField({ t: "Tasks" }), title: synAutoField({ t: "Tasks – " }, { v: "title" }), content: synAutoField({ v: `step:${gen.id}` }) }];
};

const synAutoSample = () => [
  { id: "w1", title: L("Export as Markdown"), trigger: "meeting_completed", enabled: true, lastRun: ["20 hours ago", "/home/camille/Notes/2026-11-04 Weekly product sync.md"], steps: [{ id: "s1", type: "markdown_export", directory: "/home/camille/Notes", include: { memo: true, summary: true, transcript: true, actions: true } }] },
  { id: "w2", title: L("Extract tasks"), trigger: "note_enhanced", enabled: false, lastRun: null, steps: synAutoTasks() },
  { id: "w3", title: "Copy the follow-up", trigger: "manual", enabled: false, lastRun: null, steps: [{ id: "s4", type: "generate_text", outputName: "Follow-up message", prompt: synAutoField({ t: "Write a short follow-up message based on: " }, { v: "summary" }) }, { id: "s5", type: "clipboard", content: synAutoField({ v: "step:s4" }) }] },
];

const SYN_AUTO_NOTES = [["n1", "Weekly product sync", "Tue, Nov 4, 10:30 AM"], ["n2", "Beta launch review", "Mon, Nov 3, 2:00 PM"], ["n3", "Pricing workshop", "Fri, Oct 31, 9:15 AM"]];

/** VariableField : texte et pastilles, puis « Insérer » (une pastille par variable). */
const SynAutoVar = ({ label, value, onChange, vars, mono, placeholder }) => {
  const nameOf = (v) => vars.find((x) => x.token === v)?.label;
  return (
    <div className="syn-auto-field">
      <span>{label}</span>
      <div className="syn-auto-var" data-mono={mono ? "" : undefined} role="group" aria-label={label}>
        {value.segs.map((g, i) => (g.v ? <span key={i} className="syn-auto-pill" title={`{{${g.v}}}`} data-missing={nameOf(g.v) ? undefined : ""}>{nameOf(g.v) ?? L("Missing output")}</span> : <span key={i}>{g.t}</span>))}
        <input aria-label={label} value={value.trail} placeholder={value.segs.length ? "" : placeholder} onChange={(e) => onChange({ ...value, trail: e.target.value })}
          onKeyDown={(e) => e.key === "Backspace" && !value.trail && value.segs.length && onChange({ ...value, segs: value.segs.slice(0, -1) })} />
      </div>
      <div className="syn-auto-chips" style={{ marginTop: 2 }}>
        <span>{L("Insert")}</span>
        {vars.map((v) => (
          <button key={v.token} type="button" className="syn-auto-pill" title={`{{${v.token}}}`} onClick={() => onChange({ segs: [...value.segs, ...(value.trail ? [{ t: value.trail }] : []), { v: v.token }, { t: " " }], trail: "" })}>
            + {v.label}
          </button>
        ))}
      </div>
    </div>
  );
};

const SynAutoText = ({ label, value, onChange, placeholder, error }) => {
  const id = useId();
  return (
    <div className="syn-auto-field">
      <label className="syn-auto-label" htmlFor={id}>{label}</label>
      <input id={id} className="syn-input" value={value} placeholder={placeholder} aria-invalid={Boolean(error)} onChange={(e) => onChange(e.target.value)} />
      {error ? <span style={{ color: "var(--syn-destructive)", fontSize: 12 }}>{error}</span> : null}
    </div>
  );
};

const SynAutoTypeOptions = ({ labels }) => (
  <>
    {SYN_AUTO_TYPES.filter((t) => !SYN_AUTO_ADVANCED.includes(t)).map((t) => <option key={t} value={t}>{labels.step[t][0]}</option>)}
    <optgroup label={L("Advanced")}>
      {SYN_AUTO_ADVANCED.map((t) => <option key={t} value={t}>{labels.step[t][0]}</option>)}
    </optgroup>
  </>
);

/** Formulaire d'une étape (step-forms.tsx, markdown-export-*.tsx). */
const SynAutoConfig = ({ step, set, vars }) => {
  const v = (key, label, extra = {}) => h(SynAutoVar, { label, value: step[key], vars, onChange: (val) => set({ [key]: val }), ...extra });
  const outName = h(SynAutoText, { label: L("Result available to the next steps under the name"), value: step.outputName, placeholder: synAutoOutName({ ...step, outputName: "" }), onChange: (val) => set({ outputName: val }) });
  if (step.type === "markdown_export") {
    const items = [["memo", L("Memo")], ["summary", L("Summary")], ["transcript", L("Transcript")], ["actions", L("Collect action items")]];
    return (
      <>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h5 style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>{L("Export folder")}</h5>
            <p className="syn-muted" style={{ margin: "2px 0 0", fontSize: 12 }}>{step.directory || L("No folder selected yet.")}</p>
          </div>
          <button type="button" className="syn-ui-btn" onClick={() => set({ directory: "/home/camille/Notes/Meetings" })}>{h(SynIcon, { name: I("FolderOpen"), size: 14 })}{L("Choose folder")}</button>
        </div>
        <div className="syn-auto-field">
          <span>{L("Include")}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {items.map(([key, label]) => (
              <label key={key} className="syn-check" style={{ fontSize: 12.5 }}>
                <input type="checkbox" checked={step.include[key]} onChange={() => set({ include: { ...step.include, [key]: !step.include[key] } })} />
                {label}
              </label>
            ))}
          </div>
          {Object.values(step.include).some(Boolean) ? null : <span style={{ color: "var(--syn-destructive)", fontSize: 12 }}>{L("Choose at least one section to export.")}</span>}
        </div>
      </>
    );
  }
  if (step.type === "generate_text")
    return <>{v("prompt", L("Instruction"), { placeholder: L("List the decisions and the tasks, one per line…") })}<p className="syn-muted" style={{ margin: "8px 0 0", fontSize: 12 }}>{L("Uses the local model chosen in Settings › Synthesis. Nothing leaves your computer.")}</p>{outName}</>;
  if (step.type === "vault_write")
    return (
      <>
        <select className="syn-select" aria-label={L("What to do in the vault")} value={step.mode} onChange={(e) => set({ mode: e.target.value })}>
          <option value="create">{L("Create a new note")}</option>
          <option value="append">{L("Complete the note with the same title")}</option>
        </select>
        {v("folder", L("Vault folder"), { placeholder: L("At the root of the vault") })}
        {v("title", L("Note title"))}
        {v("content", L("Content"))}
      </>
    );
  if (step.type === "clipboard") return v("content", L("Content"));
  if (step.type === "notification") return <>{v("title", L("Notification title"))}{v("message", L("Text"))}</>;
  if (step.type === "webhook")
    return (
      <>
        <p className="syn-auto-note">{L("The only step that leaves your computer: the JSON is sent to the address below. Use an address you trust, such as n8n, Home Assistant or a home server.")}</p>
        {h(SynAutoText, { label: L("Address (URL)"), value: step.url, placeholder: "http://localhost:5678/webhook/syntheo", error: step.url.trim() && !synAutoUrlOk(step.url) ? L("Use an http:// or https:// address.") : null, onChange: (url) => set({ url }) })}
        {v("body", L("JSON body"), { mono: true })}
        <p className="syn-muted" style={{ margin: "4px 0 0", fontSize: 12 }}>{L("Variables are inserted as JSON text, inside quotes. Redirects are not followed; the request stops after 15 seconds.")}</p>
      </>
    );
  return (
    <>
      <p className="syn-auto-note">{L("Syntheo asks for your confirmation the first time this exact command runs. Each argument is passed as is, without a shell; the run stops after 60 seconds.")}</p>
      {h(SynAutoText, { label: L("Program"), value: step.program, placeholder: "/home/me/scripts/publish.sh", onChange: (program) => set({ program }) })}
      <span className="syn-auto-label" style={{ display: "block", marginTop: 10 }}>{L("Arguments")}</span>
      {step.args.map((arg, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
          <div style={{ flex: 1 }}>{h(SynAutoVar, { label: LF("Argument {position}", { position: i + 1 }), value: arg, vars, onChange: (val) => set({ args: step.args.map((a, j) => (j === i ? val : a)) }) })}</div>
          <button type="button" className="syn-icon-btn" aria-label={LF("Remove argument {position}", { position: i + 1 })} onClick={() => set({ args: step.args.filter((_, j) => j !== i) })}>{h(SynIcon, { name: I("X"), size: 14 })}</button>
        </div>
      ))}
      <button type="button" className="syn-ui-btn" style={{ marginTop: 8 }} onClick={() => set({ args: [...step.args, synAutoField()] })}>{h(SynIcon, { name: I("Plus"), size: 12 })}{L("Add an argument")}</button>
      {outName}
    </>
  );
};

/** « Tester sur une note » et « Résultat du test ». */
const SynAutoTest = ({ wf, labels, onClose }) => {
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("n1");
  const [simulate, setSimulate] = useState(false);
  const [phase, setPhase] = useState("idle");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const notes = SYN_AUTO_NOTES.filter(([, t]) => synNorm(t).includes(synNorm(query.trim())));
  const effects = wf.steps.map((s, i) => [s, i + 2]).filter(([s]) => SYN_AUTO_EFFECT[s.type]);
  const title = SYN_AUTO_NOTES.find(([id]) => id === note)[1];
  const text = (f) => f.segs.map((g) => (g.v === "title" ? title : g.v === "date" ? "2026-11-04" : g.v ? "…" : g.t)).join("") + f.trail;
  const detail = (s) => {
    if (s.type === "markdown_export") return simulate ? s.directory : `${s.directory}/2026-11-04 ${title}.md`;
    if (s.type === "generate_text") return "Generated text (412 characters)";
    if (s.type === "vault_write") return simulate ? `Would create the note “${text(s.title).trim()}”` : `${L("Created:")} ${text(s.title).trim()}`;
    if (s.type === "clipboard") return simulate ? "Would copy the text to the clipboard" : "Copied to the clipboard";
    if (s.type === "notification") return simulate ? "Would show a notification" : "Notification shown";
    if (s.type === "webhook") return simulate ? `Would send the JSON to ${s.url}` : `Sent to ${s.url} (status 200)`;
    return simulate ? `Would run ${s.program}` : `Command finished: ${s.program}`;
  };
  const pick = (id) => {
    setNote(id);
    setPhase("idle");
  };
  const run = () => {
    setPhase("running");
    timer.current = setTimeout(() => setPhase("done"), 900);
  };
  const rows = [[`1 · ${labels.trigger[wf.trigger][1]}`, LF("Note “{noteTitle}”", { noteTitle: title }), false], ...wf.steps.map((s, i) => [`${i + 2} · ${labels.step[s.type][0]}`, detail(s), simulate && SYN_AUTO_EFFECT[s.type]])];
  return (
    <section className="syn-auto-test" aria-labelledby="syn-auto-test-title">
      <div style={{ display: "flex", alignItems: "center" }}>
        <h4 id="syn-auto-test-title" style={{ flex: 1, margin: 0, fontSize: 14 }}>{L("Test on a note")}</h4>
        <button type="button" className="syn-icon-btn" aria-label={L("Close the test")} onClick={onClose}>{h(SynIcon, { name: I("X"), size: 14 })}</button>
      </div>
      <p className="syn-muted" style={{ margin: "-6px 0 0", fontSize: 12 }}>{L("Syntheo runs the automation as it is edited, even unsaved, on the note you choose.")}</p>
      <div className="syn-auto-field" style={{ marginTop: 0 }}>
        <span>{L("Note")}</span>
        <input className="syn-input" aria-label={L("Search by title")} placeholder={L("Search by title")} value={query} onChange={(e) => setQuery(e.target.value)} />
        <ul className="syn-auto-notes" role="listbox" aria-label={L("Note to test on")}>
          {notes.length === 0 ? <li role="presentation" className="syn-muted">{L("No note matches this search.")}</li> : null}
          {notes.map(([id, t, date]) => (
            <li key={id} role="option" tabIndex={0} aria-selected={id === note} onClick={() => pick(id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(id); } }}>
              <span style={{ fontWeight: 500 }}>{t}</span>
              {id === "n1" ? <span className="syn-muted" style={{ fontSize: 11.5 }}>{L("most recent")}</span> : null}
              <span className="syn-muted" style={{ marginLeft: "auto", fontSize: 12 }}>{date}</span>
            </li>
          ))}
        </ul>
      </div>
      {effects.length ? (
        <div role="note" className="syn-auto-warn" data-sim={simulate ? "" : undefined}>
          {h(SynIcon, { name: I("Warning"), size: 14 })}
          <div>
            <strong>{simulate ? L("These steps will be simulated: nothing is written, sent or run.") : L("This is a real test: these steps really act.")}</strong>
            <ul>{effects.map(([s, n]) => <li key={s.id}><strong>{n} · {labels.step[s.type][0]}</strong> — {labels.effect[SYN_AUTO_EFFECT[s.type]]}</li>)}</ul>
          </div>
        </div>
      ) : (
        <p className="syn-muted" style={{ margin: 0, fontSize: 12 }}>{L("No step acts outside Syntheo: the test only shows the results.")}</p>
      )}
      <label className="syn-check" style={{ alignItems: "flex-start", fontSize: 12 }}>
        <input type="checkbox" checked={simulate} onChange={(e) => { setSimulate(e.target.checked); setPhase("idle"); }} />
        <span><strong style={{ display: "block", fontWeight: 500 }}>{L("Simulate the steps with real effects")}</strong><span className="syn-muted">{L("They describe what they would do, without acting. The local model still generates its text.")}</span></span>
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" className="syn-ui-btn" onClick={onClose}>{L("Cancel")}</button>
        <button type="button" className="syn-ui-btn" data-variant="primary" disabled={phase === "running"} onClick={run}>
          {h(SynIcon, { name: phase === "running" ? I("CircleNotch") : I("Play"), size: 14 })}
          {phase === "running" ? L("Test running…") : L("Run the test")}
        </button>
      </div>
      {phase === "done" ? (
        <div className="syn-auto-result" role="region" aria-labelledby="syn-auto-result-title" style={{ borderTop: "1px solid var(--syn-border)", paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", marginBottom: 8 }}>
            <h5 id="syn-auto-result-title" style={{ flex: 1, margin: 0, fontSize: 14 }}>{L("Test result")}</h5>
            <span className="syn-muted" style={{ fontSize: 12 }}>{LF("{seconds} s", { seconds: "1,8" })}</span>
          </div>
          <ol>
            {rows.map(([head, body, sim]) => (
              <li key={head}>
                {h(SynIcon, { name: I("Check"), size: 14, style: { color: "var(--syn-primary)", marginTop: 2 } })}
                <span><strong style={{ fontWeight: 500 }}>{head}</strong> {sim ? <span className="syn-auto-badge">{L("Simulated")}</span> : null}<br /><span className="syn-muted" style={{ fontSize: 12, wordBreak: "break-all" }}>{body}</span></span>
              </li>
            ))}
          </ol>
          <p className="syn-muted" style={{ margin: "8px 0 0", fontSize: 12 }}>{L("The test changes neither the last run nor the list of notes already processed.")}</p>
        </div>
      ) : null}
    </section>
  );
};

const synAutoStatus = (wf) => (wf.trigger === "manual" ? L("Manual") : wf.enabled ? L("Enabled") : L("Draft"));

/** WorkflowBuilder : « Étapes », Quand (1), puis chaque action, « Ajouter une étape ». */
const SynAutoBuilder = ({ wf, labels, update, hs }) => {
  const nameId = useId();
  const setStep = (id, p) => update({ steps: wf.steps.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  const vars = (index) => [
    ...SYN_AUTO_VARS.map(([token, label]) => ({ token, label })),
    ...wf.steps.slice(0, index).filter((s) => SYN_AUTO_OUTPUT[s.type]).map((s) => ({ token: `step:${s.id}`, label: synAutoOutName(s) })),
  ];
  const card = (n, eyebrow, title, body, extra) => (
    <li key={n}>
      {n > 1 ? <div className="syn-auto-arrow" aria-hidden="true">{h(SynIcon, { name: I("ArrowRight"), size: 13, style: { transform: "rotate(90deg)" } })}</div> : null}
      <div className="syn-auto-card">
        <span className="syn-auto-num">{n}</span>
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <span><span className="syn-auto-eyebrow">{eyebrow}</span><span style={{ fontWeight: 500, fontSize: 14 }}>{title}</span></span>
            {extra}
          </div>
          <div style={{ marginTop: 10 }}>{body}</div>
        </div>
      </div>
    </li>
  );
  return (
    <section className="syn-auto-box" aria-labelledby="syn-auto-steps-title">
      <header>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h4 id="syn-auto-steps-title">{L("Steps")}</h4>
          <span className="syn-auto-badge">{synAutoStatus(wf)}</span>
        </div>
        <p className="syn-muted" style={{ margin: 0, fontSize: 12 }}>{L("Syntheo runs the steps in order on your computer: the trigger is step 1, then each action follows.")}</p>
        <label className="syn-auto-label" htmlFor={nameId}>{L("Name")}</label>
        <input id={nameId} className="syn-input" value={wf.title} placeholder={L("Untitled automation")} onChange={(e) => update({ title: e.target.value })} />
      </header>
      <ol className="syn-auto-steps">
        {card(1, L("When"), labels.trigger[wf.trigger][1], (
          <>
            {hs(2, { left: -48, top: -6 })}
            <select className="syn-select" aria-label={L("Trigger")} value={wf.trigger} onChange={(e) => update({ trigger: e.target.value })}>
              {Object.entries(labels.trigger).map(([id, [, long]]) => <option key={id} value={id}>{long}</option>)}
            </select>
            {wf.trigger === "manual" ? <p className="syn-muted" style={{ margin: "8px 0 0", fontSize: 12 }}>{L("Launch it from a note: the ⋯ menu, the capsule in Synthesis, or Ask the note (Ctrl+J).")}</p> : null}
            <div className="syn-auto-chips"><span>{L("Available to the next steps")}</span>{SYN_AUTO_VARS.map(([t, label]) => <span key={t} className="syn-auto-pill" title={`{{${t}}}`}>{label}</span>)}</div>
          </>
        ))}
        {wf.steps.map((step, index) =>
          card(index + 2, L("Then"), labels.step[step.type][0], (
            <>
              <select className="syn-select" aria-label={L("Action")} value={step.type} onChange={(e) => update({ steps: wf.steps.map((s) => (s.id === step.id ? { ...synAutoNew(e.target.value), id: s.id } : s)) })}>
                {h(SynAutoTypeOptions, { labels })}
              </select>
              <div style={{ position: "relative" }}>
                {index === 0 ? hs(4, { left: -40, top: 12 }) : null}
                {h(SynAutoConfig, { step, vars: vars(index), set: (p) => setStep(step.id, p) })}
              </div>
              {SYN_AUTO_OUTPUT[step.type] === "file" ? <div className="syn-auto-chips"><span>{L("Result available to the next steps as")}</span><span className="syn-auto-pill">{synAutoOutName(step)}</span></div> : null}
            </>
          ), (
            <>
              {synAutoReady(step) ? null : <span className="syn-auto-badge">{L("Needs setup")}</span>}
              <button type="button" className="syn-icon-btn" style={{ marginLeft: "auto" }} aria-label={LF("Remove step {stepNumber}", { stepNumber: index + 2 })} onClick={() => update({ steps: wf.steps.filter((s) => s.id !== step.id) })}>{h(SynIcon, { name: I("Trash"), size: 13 })}</button>
            </>
          )),
        )}
        <li className="syn-auto-add" style={{ position: "relative" }}>
          {hs(3, { left: -12, top: -10 })}
          <div>
            <p style={{ fontWeight: 500 }}>{L("Add a step")}</p>
            <p className="syn-muted" style={{ fontSize: 12 }}>{L("Each new step runs after the previous one.")}</p>
          </div>
          <select className="syn-select" style={{ width: 200 }} aria-label={L("Add a step")} value="" onChange={(e) => e.target.value && update({ steps: [...wf.steps, synAutoNew(e.target.value)] })}>
            <option value="">+ {L("Add a step")}</option>
            {h(SynAutoTypeOptions, { labels })}
          </select>
        </li>
      </ol>
      <div className="syn-auto-foot">
        {synAutoWfReady(wf) ? null : <p>{L("Add at least one configured action before enabling.")}</p>}
        {wf.lastRun ? <p>{LF("Last run {relative}: {0}", { relative: wf.lastRun[0], 0: wf.lastRun[1] })}</p> : null}
      </div>
    </section>
  );
};

/** Vue d'ensemble, sans automatisation ouverte : modèles et « Mes automatisations ». */
const SynAutoOverview = ({ wfs, labels, create, open }) => {
  const chain = (trigger, types) => [labels.trigger[trigger][0], ...types.map((t) => labels.step[t][0])].join(" → ");
  const tpl = [["md", "meeting_completed", [L("Export as Markdown"), L("Every finished meeting is saved as a Markdown file in a folder.")], () => [synAutoNew("markdown_export")]], ["tasks", "note_enhanced", [L("Extract tasks"), L("The local model lists the actions to take and adds them to the vault.")], synAutoTasks]];
  return (
    <div className="syn-auto-scroll">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
        <div style={{ flex: 1 }}>{h(SynSettingsTitle, { title: L("Automations"), lede: L("Syntheo chains local steps after your meetings. Nothing leaves your computer, except a webhook step if you add one.") })}</div>
        <button type="button" className="syn-ui-btn" data-variant="primary" onClick={() => create([])}>{h(SynIcon, { name: I("Plus"), size: 14 })}{L("New automation")}</button>
      </div>
      <h4 style={{ margin: 0, fontSize: 14 }}>{L("Start from a template")}</h4>
      <div className="syn-auto-tpl">
        {tpl.map(([id, trigger, [title, desc], steps]) => (
          <button key={id} type="button" onClick={() => create(steps(), title, trigger)}><b style={{ fontWeight: 500 }}>{title}</b><span className="syn-muted" style={{ fontSize: 12 }}>{desc}</span><span className="syn-auto-pill" style={{ alignSelf: "flex-start" }}>{chain(trigger, steps().map((st) => st.type))}</span></button>
        ))}
      </div>
      <h4 style={{ margin: 0, fontSize: 14 }}>{L("My automations")}</h4>
      <ul className="syn-auto-list">
        {wfs.map((wf) => (
          <li key={wf.id}><button type="button" onClick={() => open(wf.id)}><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontWeight: 500 }}>{wf.title || L("Untitled automation")}</b><span className="syn-muted" style={{ fontSize: 12 }}>{wf.lastRun ? LF("{chain} · last run {relative}", { chain: chain(wf.trigger, wf.steps.map((s) => s.type)), relative: wf.lastRun[0] }) : LF("{chain} · never run", { chain: chain(wf.trigger, wf.steps.map((s) => s.type)) })}</span></span><span className="syn-auto-badge">{synAutoStatus(wf)}</span></button></li>
        ))}
      </ul>
    </div>
  );
};

/**
 * La vue Automatisations. `view` : "editor" (défaut, « Extraire les tâches »
 * ouverte) ou "overview" ; `testing` ouvre « Tester sur une note ».
 * Repères : 1 « Mes automatisations » et +, 2 « Quand », 3 « Ajouter une
 * étape », 4 « Insérer », 5 « Tester ».
 */
export const AutomationEditor = ({ view = "editor", testing = false, markers = true }) => {
  const initial = () => ({ wfs: synAutoSample(), sel: view === "overview" ? null : "w2", search: "", testing });
  const [s, setS] = useState(initial);
  const [showMarkers, setShowMarkers] = useState(markers);
  const labels = synAutoLabels();
  const patch = (p) => setS((prev) => ({ ...prev, ...p }));
  const wf = s.wfs.find((w) => w.id === s.sel);
  const ready = wf ? synAutoWfReady(wf) : false;
  const hs = (n, style) => (showMarkers ? h(SynHotspot, { n, style }) : null);
  // Toute modification enregistre ; elle désactive l'automatisation si elle n'est plus prête.
  const update = (p) => setS((prev) => ({ ...prev, wfs: prev.wfs.map((w) => (w.id === prev.sel ? { ...w, ...p, enabled: (p.enabled === undefined ? w.enabled : p.enabled) && synAutoWfReady({ ...w, ...p }) } : w)) }));
  const create = (steps, title = "", trigger = "note_enhanced") => {
    const id = `w${(synAutoSeq += 1)}`;
    setS((prev) => ({ ...prev, sel: id, testing: false, wfs: [{ id, title, trigger, enabled: false, lastRun: null, steps }, ...prev.wfs] }));
  };
  const q = synNorm(s.search.trim());
  const list = s.wfs.filter((w) => !q || synNorm(w.title || L("Untitled automation")).includes(q));
  return h(
    SynFigure,
    { title: L("Automations"), width: 1000, markers: showMarkers, setMarkers: setShowMarkers, onReset: () => setS(initial()) },
    <div className="syn-auto">
      <nav className="syn-auto-side" aria-label={L("Automations")} style={{ position: "relative" }}>
        {hs(1, { right: 40, top: 12 })}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="syn-icon-btn" aria-label={L("New automation")} title={L("New automation")} onClick={() => create([])}>{h(SynIcon, { name: I("Plus") })}</button>
        </div>
        <label className="syn-set-search">
          {h(SynIcon, { name: I("MagnifyingGlass"), size: 15 })}
          <input type="text" value={s.search} placeholder={L("Search automations...")} aria-label={L("Search automations...")} onChange={(e) => patch({ search: e.target.value })} onKeyDown={(e) => e.key === "Escape" && patch({ search: "" })} />
        </label>
        {list.length ? <p className="syn-muted" style={{ margin: "4px 0 0 10px", fontSize: 12, fontWeight: 500 }}>{L("My automations")}</p> : <p className="syn-muted" style={{ textAlign: "center", fontSize: 13 }}>{L("No automations found")}</p>}
        {list.map((w) => (
          <button key={w.id} type="button" className="syn-auto-item" aria-current={w.id === s.sel ? "page" : undefined} onClick={() => patch({ sel: w.id, testing: false })}>
            {h(SynIcon, { name: I("Lightning"), style: { color: "var(--syn-muted-foreground)" } })}
            <span style={{ minWidth: 0 }}><b>{w.title || L("Untitled automation")}</b><small>{synAutoStatus(w)}</small></span>
          </button>
        ))}
      </nav>
      <div className="syn-auto-main">
        {wf ? (
          <>
            <div className="syn-auto-head">
              <h3>{wf.title.trim() || L("Untitled automation")}</h3>
              <span style={{ position: "relative" }}>
                {hs(5, { left: -10, top: -12 })}
                {/* « Tester » : msgid « Test », msgctxt « automation ». */}
                <button type="button" className="syn-ui-btn" disabled={!ready} aria-pressed={s.testing} title={ready ? undefined : L("Configure every step before testing.")} onClick={() => patch({ testing: true })}>{h(SynIcon, { name: I("Play"), size: 14 })}Tester</button>
              </span>
              {wf.trigger === "manual" ? null : wf.enabled ? (
                <button type="button" className="syn-ui-btn" onClick={() => update({ enabled: false })}>{L("Disable")}</button>
              ) : (
                <button type="button" className="syn-ui-btn" data-variant="primary" disabled={!ready} title={ready ? undefined : L("Add and configure at least one action first.")} onClick={() => update({ enabled: true })}>{h(SynIcon, { name: I("Lightning"), size: 14 })}{L("Save & enable")}</button>
              )}
              {h(SynMenuButton, { label: L("Automation actions"), items: [{ label: L("Delete automation"), onSelect: () => setS((prev) => ({ ...prev, sel: null, testing: false, wfs: prev.wfs.filter((w) => w.id !== prev.sel) })) }] })}
            </div>
            <div className="syn-auto-scroll">
              <p className="syn-muted" style={{ margin: 0 }}>{L("Set the trigger and the actions. The chat on the right can help you shape the automation.")}</p>
              {s.testing && ready ? h(SynAutoTest, { key: wf.id, wf, labels, onClose: () => patch({ testing: false }) }) : null}
              {h(SynAutoBuilder, { wf, labels, update, hs })}
            </div>
          </>
        ) : (
          h(SynAutoOverview, { wfs: s.wfs, labels, create, open: (id) => patch({ sel: id }) })
        )}
      </div>
    </div>,
  );
};

// <Troubleshooter> : vérificateur guidé de la page Dépannage. Le guide
// (symptômes, points à vérifier) est une aide de la doc ; il ouvre les vrais
// écrans, reproduits ailleurs : <AppSettings> (Transcription, Synthèse,
// Autorisations, Réunions › Audio), <AppScreen> (capsule en écoute) et une note
// en écoute dont la transcription s'interrompt (apps/desktop/src/stt/
// live-transcript-interrupted.ts : message de pause et de reprise, bandeau
// « Transcription interrompue »).
// <DataFlows> : schéma de la page Données et confidentialité (ce qui sort du
// poste, selon l'activité). Illustration de doc, pas un écran de l'app.

const SYN_CSS_TROUBLESHOOTING = `
.syn-trb{margin:20px 0;display:flex;flex-direction:column;gap:12px}
.syn-trb-guide{border:1px solid var(--syn-border);border-radius:14px;background:var(--syn-card);padding:14px 16px}
.syn-trb-guide>p{margin:0 0 8px;font-weight:600}
.syn-trb-syms{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px;margin-bottom:12px}
.syn-trb-sym,.syn-trb-seg{display:flex;align-items:center;gap:8px;border:1px solid var(--syn-border);border-radius:10px;background:var(--syn-background);color:var(--syn-foreground);padding:8px 10px;font:400 13px/1.3 Geist,system-ui,sans-serif;text-align:left;cursor:pointer}
.syn-trb-sym[aria-checked=true],.syn-trb-seg[aria-selected=true],.syn-trb-seg[aria-pressed=true],.syn-trb-seg[aria-checked=true]{border-color:var(--syn-primary);background:var(--syn-accent);color:var(--syn-accent-foreground);font-weight:500}
.syn-trb-seg{display:inline-flex;border-radius:999px;padding:4px 12px}
.syn-trb-list{margin:0;padding-left:20px;font-size:13.5px}
.syn-trb-list li{margin:3px 0}
.syn-trb-list code{font-size:12px}
.syn-trb .syn-figure,.syn-trb .syn-path{margin:0}
.syn-trb-live{margin:8px 0 0;border-radius:8px;padding:8px 10px;font-size:12.5px;border:1px solid var(--syn-alert-border);background:var(--syn-alert);color:var(--syn-alert-foreground)}
.syn-trb-live[data-ok]{border-color:var(--syn-border);background:var(--syn-accent);color:var(--syn-accent-foreground)}
.syn-flow{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:14px;margin:12px 0}
.syn-flow-box{border:1px solid var(--syn-border);border-radius:12px;background:var(--syn-card);padding:12px 14px;font-size:13px}
.syn-flow-box ul{margin:6px 0;padding-left:18px}
.syn-flow-dest{display:flex;align-items:center;gap:8px;margin-bottom:8px;border:1px solid var(--syn-border);border-radius:10px;background:var(--syn-background);padding:7px 10px;font-size:13px}
.syn-flow-dest[data-on]{border:2px solid var(--syn-primary);background:var(--syn-accent);color:var(--syn-accent-foreground)}
.syn-flow-dest small{display:block;font-size:12px;opacity:.8}
.syn-flow dl{display:grid;grid-template-columns:130px minmax(0,1fr);gap:6px 12px;margin:0}
.syn-flow dt{color:var(--syn-muted-foreground)}
.syn-flow dd{margin:0}
@media (max-width:640px){.syn-flow{grid-template-columns:1fr}}
`;

const SYN_TRB_SYMPTOMS = [
  ["server", I("Waveform"), "The transcription or summary server is unreachable"],
  ["stops", I("Warning"), "Transcription stops during the meeting"],
  ["sound", I("SpeakerHigh"), "Sound is missing: microphone or system audio"],
  ["summary", I("FileText"), "No summary appears"],
];

/**
 * Note en écoute. `failure` : la transcription s'interrompt (cause simulée) ;
 * sinon, seule la capsule compte (son système coupé au départ).
 */
const SynTrbLiveNote = ({ failure }) => {
  const [cause, setCause] = useState("offline");
  const [resumed, setResumed] = useState(false);
  const [state, act] = useSynSession("listen");
  useEffect(() => {
    if (!failure) act.toggleSpeaker();
  }, []);
  const message = resumed
    ? L("Live transcription resumed.")
    : cause === "offline"
      ? LF("Live transcription paused: {cause}. No audio is kept: this passage will be missing from the transcription. Reconnecting…", { cause: L("you are offline") })
      : LF("Live transcription paused: {cause}. No audio is kept: this passage will be missing from the transcription. Check the transcription server settings.", {
          cause: LF("{providerName} rejected your API key", { providerName: "OpenAI" }),
        });
  return (
    <>
      {failure ? (
        <div role="group" aria-label="Simulated cause" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 13 }}>
          <span className="syn-muted">Simulated cause:</span>
          {[["offline", "Offline"], ["key", L("Key refused")]].map(([id, label]) => (
            <button key={id} type="button" className="syn-trb-seg" aria-pressed={cause === id} onClick={() => { setCause(id); setResumed(false); }}>{label}</button>
          ))}
          {cause === "offline" && !resumed ? <button type="button" className="syn-trb-seg" onClick={() => setResumed(true)}>Restore the network</button> : null}
        </div>
      ) : null}
      {h(
        SynFigure,
        { title: "Beta launch review", onReset: () => { setCause("offline"); setResumed(false); act.reset(); } },
        <div className="syn-body">
          <div className="syn-doc">
            <p className="syn-title">Beta launch review</p>
            <ul className="syn-notes"><li>confirm the date of the 21st</li><li>transcription server quota?</li></ul>
          </div>
          <aside className="syn-margin" aria-label={L("Transcription")} style={{ flexBasis: 300 }}>
            {failure ? <p className="syn-alert" role="status" style={{ marginTop: 0 }}>{LF("Transcription interrupted {gaps}", { gaps: "14:32–14:35" })}</p> : null}
            <h4>{L("Transcription")}</h4>
            <p><b>Laura</b> — do we keep the 21st for the beta?</p>
            <p><b>You</b> — yes, if the server quota holds.</p>
            <p><b>Malik</b> — I'll look into it before Thursday.</p>
            {failure ? <p className="syn-trb-live" role="status" data-ok={resumed ? "" : undefined}>{message}</p> : null}
            {state.micMuted && state.speakerMuted ? <p className="syn-alert" role="status">{L("The microphone and system audio are muted: nothing is being transcribed.")}</p> : null}
          </aside>
        </div>,
        <div className="syn-capsule-slot">{h(SynCapsule, { state, act })}</div>,
      )}
    </>
  );
};

/**
 * Vérificateur guidé : choisissez un symptôme, suivez les points à vérifier
 * dans l'écran de l'app ouvert en dessous. `symptom` : server | stops | sound | summary.
 */
export const Troubleshooter = ({ symptom = "server" }) => {
  const [sym, setSym] = useState(symptom);
  const [step, setStep] = useState(0);
  const settings = L("Settings");
  const soundSteps = [
    [L("Permissions"), [settings, L("Advanced"), L("Permissions")], () => h(AppSettings, { key: "perm", section: "permissions", focus: "audio" })],
    [L("Meetings"), [settings, L("My meetings"), L("Meetings"), L("Audio")], () => h(AppSettings, { key: "meet", section: "meetings", focus: "audio" })],
    [L("Note capsule"), ["Meeting note", L("Listen"), L("Note capsule")], () => h(SynTrbLiveNote, { key: "cap", failure: false })],
  ];
  let path = [settings, L("My servers"), L("Transcription")];
  let screen = h(AppSettings, { key: "stt", section: "transcription", focus: "server" });
  let checks = null;
  if (sym === "server") {
    checks = [
      <>Click “{L("Test connection")}” on the server card. The status pill shows “{L("Unreachable")}”, “{L("Key refused")}” or “{L("Invalid address")}”, and the message says what to check. In the replica, change the port in the address to see a failure.</>,
      <>The server is running: <code>curl http://localhost:8000/v1/models</code>.</>,
      <>The base URL usually ends with <code>/v1</code>, with no ID and no <code>?…</code>.</>,
      <>Response 401 or 403: “{L("Key refused")}”. Check the key under “{L("Advanced")}”.</>,
      <>No firewall, VPN or proxy blocks the port.</>,
    ];
  } else if (sym === "stops") {
    path = ["Meeting note", L("Listen"), L("Transcription")];
    screen = h(SynTrbLiveNote, { key: "live", failure: true });
    checks = [
      <>At the bottom of the transcript margin, the message gives the likely cause.</>,
      <>Network outage or failure: Syntheo reconnects on its own, then shows “{L("Live transcription resumed.")}”.</>,
      <>Key or settings refused: no new attempt. Fix the server in the “{L("Transcription")}” settings, then restart listening.</>,
      <>The audio is not kept: the banner at the top of the margin shows the missing periods.</>,
    ];
  } else if (sym === "sound") {
    path = soundSteps[step][1];
    screen = soundSteps[step][2]();
    checks = [
      [<>“{L("Microphone")}” and “{L("System audio")}”: a red row means the real test of that source failed. Fix the cause, then click the arrow to run the test again.</>],
      [<>Under “{L("System sound")}”, choose the output where you hear the other participants. “{L("Captured right now:")}” gives the output actually captured.</>],
      [<>A muted source has its icon crossed out on a red background. Turn it back on with a click, or with Ctrl + {L("Shift")} + M (microphone) and Ctrl + {L("Shift")} + S (system sound).</>],
    ][step];
  } else {
    path = [settings, L("My servers"), L("Synthesis")];
    screen = h(AppSettings, { key: "llm", section: "intelligence", focus: "model" });
    checks = [
      <>A summary needs a summary server: its pill must show “Connected”.</>,
      <>Choose a model under “{L("Model")}”. Yours is not listed? “{L("Enter another name")}”.</>,
      <>Server unreachable: go back to the first symptom.</>,
    ];
  }
  return (
    <div className="syn-root syn-trb not-prose">
      {h(SynStyle)}
      <section className="syn-trb-guide" aria-label="Guided checker">
        <p>What is the symptom?</p>
        <div className="syn-trb-syms" role="radiogroup" aria-label="Symptom">
          {SYN_TRB_SYMPTOMS.map(([id, icon, label]) => (
            <button key={id} type="button" role="radio" className="syn-trb-sym" aria-checked={sym === id} onClick={() => { setSym(id); setStep(0); }}>
              {h(SynIcon, { name: icon })}
              <span>{label}</span>
            </button>
          ))}
        </div>
        {sym === "sound" ? (
          <div role="tablist" aria-label="Steps" style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {soundSteps.map(([label], i) => (
              <button key={label} type="button" role="tab" className="syn-trb-seg" aria-selected={step === i} onClick={() => setStep(i)}>{i + 1}. {label}</button>
            ))}
          </div>
        ) : null}
        <p className="syn-muted syn-small" style={{ margin: "0 0 4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>To check</p>
        <ol className="syn-trb-list" aria-live="polite">{checks.map((c, i) => <li key={`${sym}-${step}-${i}`}>{c}</li>)}</ol>
      </section>
      {h(SettingsPath, { steps: path })}
      {screen}
    </div>
  );
};

const SYN_FLOW_DESTS = [
  ["stt", "Your transcription server"],
  ["llm", "Your summary server"],
  ["hooks", "Your webhook addresses"],
  ["auto", "The webhook step address"],
];
const SYN_FLOW_ACTS = [
  ["listen", "Listening to a meeting", "stt", "The captured audio: microphone and system sound.", "During transcription"],
  ["dictation", "Dictation", "stt", "The dictation audio, produced in memory.", "During transcription"],
  ["import", "Importing an audio file", "stt", "The file's audio, read from its original location, without a copy.", "During transcription"],
  ["summary", "Summary, chat", "llm", "The text the task needs: transcript, notes, summary template instructions, chat question.", "Summary, chat, “Suggest sections”, a folder's running thread and agenda, an automation's “Generate” step"],
  ["webhooks", "Webhooks in Settings", "hooks", "Meeting events (note, summaries, participants, transcript).", "On each event, if you added an endpoint"],
  ["auto", "An automation's webhook step", "auto", "The content you put in it.", "When the automation runs"],
];

/** Schéma « Ce qui sort de votre poste » : choisissez une activité. */
export const DataFlows = ({ activity = "listen" }) => {
  const [act, setAct] = useState(activity);
  const [muted, setMuted] = useState(false);
  const current = SYN_FLOW_ACTS.find(([id]) => id === act) ?? SYN_FLOW_ACTS[0];
  const [, , dest, what, when] = current;
  return (
    <figure className="syn-root syn-figure not-prose">
      {h(SynStyle)}
      <div className="syn-bar">
        <span className="syn-badge">{h(SynIcon, { name: I("ShieldCheck"), size: 14 })}Interactive diagram · Syntheo {SYN_VERSION}</span>
        <span className="syn-bar-actions">Choose an activity.</span>
      </div>
      <div role="radiogroup" aria-label="Activity" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {SYN_FLOW_ACTS.map(([id, label]) => (
          <button key={id} type="button" role="radio" className="syn-trb-seg" aria-checked={act === id} onClick={() => setAct(id)}>{label}</button>
        ))}
      </div>
      <div className="syn-flow">
        <div className="syn-flow-box">
          <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>{h(SynIcon, { name: I("Desktop") })}Your computer</strong>
          <ul>
            <li><code>app.db</code>: transcripts, notes, summaries, contacts, folders, automations, settings</li>
            <li>Search index</li>
            <li>Technical logs (content masked)</li>
            <li>API keys: system keychain</li>
            <li>Exports: folder you choose</li>
          </ul>
          <p style={{ margin: 0 }}><strong>Audio: nowhere.</strong> It lives in memory long enough to be sent, then disappears.</p>
        </div>
        <div>
          {SYN_FLOW_DESTS.map(([id, name]) => (
            <div key={id} className="syn-flow-dest" data-on={id === dest ? "" : undefined}>
              {h(SynIcon, { name: id === dest ? I("ArrowRight") : I("X"), size: 14 })}
              <span><strong style={{ fontWeight: 500 }}>{name}</strong><small>{id === dest ? "Receives data now" : "Nothing sent for this activity"}</small></span>
            </div>
          ))}
          <p className="syn-muted" style={{ margin: 0, fontSize: 13 }}><strong>Syntheo's publisher</strong>: nothing. No account, no usage statistics, no error reports, no update checks.</p>
        </div>
      </div>
      <div className="syn-flow-box syn-flow" aria-live="polite" style={{ display: "block", margin: 0 }}>
        <dl>
          <dt>Destination</dt><dd>{SYN_FLOW_DESTS.find(([id]) => id === dest)[1]}</dd>
          <dt>What is sent</dt><dd>{act === "listen" && muted ? "Silence instead of the microphone: what it picks up does not leave your computer. System sound is still sent." : what}</dd>
          <dt>When</dt><dd>{when}</dd>
        </dl>
        {act === "listen" ? (
          <label className="syn-check" style={{ marginTop: 10, fontSize: 13 }}>
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
            {L("Mute the microphone")} in the capsule (Ctrl + {L("Shift")} + M)
          </label>
        ) : null}
      </div>
    </figure>
  );
};
