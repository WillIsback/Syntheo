// Fichier généré par scripts/sync-docs-ui.mjs depuis scripts/docs-ui/core.jsx.tpl, scripts/docs-ui/note.jsx.tpl, scripts/docs-ui/settings.jsx.tpl, scripts/docs-ui/settings-meetings.jsx.tpl, scripts/docs-ui/settings-servers.jsx.tpl, scripts/docs-ui/settings-profile.jsx.tpl, scripts/docs-ui/settings-dictation.jsx.tpl, scripts/docs-ui/settings-privacy.jsx.tpl, scripts/docs-ui/palette.jsx.tpl, scripts/docs-ui/meeting.jsx.tpl : ne pas modifier.
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
const SYN_LOCALE = "fr-FR";
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
  "(Unavailable — using the default output)": "(indisponible — sortie par défaut utilisée)",
  "API key (optional)": "Clé d'API (facultative)",
  "Actions": "Actions",
  "Add language": "Ajouter une langue",
  "Add spoken language": "Ajouter une langue parlée",
  "Additional spoken languages": "Langues parlées supplémentaires",
  "Advanced": "Avancé",
  "All Notes": "Toutes les notes",
  "Appearance": "Apparence",
  "Ask the folder": "Demander au dossier",
  "Ask the folder: “{question}”": "Demander au dossier : « {question} »",
  "Ask the note": "Demander à la note",
  "Audio": "Audio",
  "Auto": "Auto",
  "Automations": "Automatisations",
  "Backspace": "Retour arrière",
  "Begin listening": "Commencer l'écoute",
  "Cancel": "Annuler",
  "Cancel dictation": "Annuler la dictée",
  "Capture meeting chat in the note": "Capturer le chat de la réunion dans la note",
  "Captured right now:": "Capturé en ce moment :",
  "Choose": "Choisir",
  "Choose folder": "Choisir un dossier",
  "Choose the microphone that captures your voice.": "Choisissez le microphone qui capture votre voix.",
  "Choose the output whose sound Syntheo transcribes: the one where you hear the other participants.": "Choisissez la sortie dont Syntheo transcrit le son : celle où vous entendez les autres participants.",
  "Click here, then use your dictation shortcut.": "Cliquez ici, puis utilisez votre raccourci de dictée.",
  "Click the shortcut to record a new key combination. Press Escape to cancel.": "Cliquez sur le raccourci pour enregistrer une nouvelle combinaison de touches. Appuyez sur Échap pour annuler.",
  "Close": "Fermer",
  "Computer audio": "Son de l'ordinateur",
  "Connected · {0} models available": "Connecté · {0} modèles disponibles",
  "Connected · {0} ms": "Connecté · {0} ms",
  "Contacts": "Contacts",
  "Control listening without reopening Syntheo.": "Contrôler l'écoute sans rouvrir Syntheo.",
  "Copied": "Copié",
  "Copy": "Copier",
  "Copy last dictation": "Copier la dernière dictée",
  "Current default": "Valeur par défaut actuelle",
  "Current default output": "Sortie par défaut actuelle",
  "Default language for transcription and AI responses.": "Langue par défaut pour la transcription et les réponses de l'IA.",
  "Developers": "Développeurs",
  "Device authentication is not available on this computer.": "L'authentification de l'appareil n'est pas disponible sur cet ordinateur.",
  "Dictation": "Dictée",
  "Dictation shortcut": "Raccourci",
  "Dictation uses your microphone, transcription provider, languages, and dictionary. Audio is never written to disk; it only passes through memory. Your last transcript stays in memory until dictation is disabled or Syntheo closes.": "La dictée utilise votre microphone, le fournisseur de transcription, les langues et le dictionnaire. L'audio n'est jamais enregistré sur le disque : il ne transite qu'en mémoire. Votre dernier transcript reste en mémoire jusqu'à ce que la dictée soit désactivée ou que Syntheo se ferme.",
  "Dictionary": "Dictionnaire",
  "Email": "E-mail",
  "Enable dictation": "Activer la dictée",
  "Enter": "Entrée",
  "Enter a full address, for example {placeholder}.": "Saisissez une adresse complète, par exemple {placeholder}.",
  "Enter another name": "Saisir un autre nom",
  "Esc": "Échap",
  "Export": "Exporter",
  "Export location": "Emplacement d'export",
  "Finish": "Terminer",
  "Folder": "Dossier",
  "Folders": "Dossiers",
  "Forget this server's address and key?": "Oublier l'adresse et la clé de ce serveur ?",
  "Go to": "Aller à",
  "Hands-free dictation": "Mode mains libres",
  "Have Syntheo ready when you sign in.": "Ayez Syntheo prêt lorsque vous vous connectez.",
  "Help": "Aide",
  "High": "Élevé",
  "Hold your shortcut while speaking, then release it to finish.": "Maintenez votre raccourci pendant que vous parlez, puis relâchez-le pour terminer.",
  "Identity": "Identité",
  "In this folder": "Dans ce dossier",
  "Job Title": "Intitulé du poste",
  "Keep Syntheo running to use your shortcut in other apps.": "Laissez Syntheo en cours d'exécution pour utiliser votre raccourci dans d'autres applications.",
  "Language & Region": "Langue et région",
  "Language and vocabulary": "Langue et vocabulaire",
  "Last dictation": "Dernière dictée",
  "Leave empty if the server has no authentication": "Laisser vide si le serveur n'a pas d'authentification",
  "Leave the folder": "Sortir du dossier",
  "Listen": "Écouter",
  "Listening": "Écoute",
  "Listening time": "Durée d'écoute",
  "Listening…": "Écoute…",
  "Live transcript preview": "Voir le texte en direct",
  "Lock app": "Verrouiller l'application",
  "Low": "Faible",
  "Main language": "Langue principale",
  "Me": "Moi",
  "Medium": "Moyen",
  "Meetings": "Réunions",
  "Mic": "Micro",
  "Microphone": "Microphone",
  "Model": "Modèle",
  "Model name": "Nom du modèle",
  "Model name served by your server": "Nom du modèle servi par votre serveur",
  "More effort gives finer summaries, but slower. Auto leaves it to the server.": "Plus d'effort donne des synthèses plus fines, mais plus lentes. Auto laisse le serveur décider.",
  "Mute system audio": "Couper le son système",
  "Mute the microphone": "Couper le micro",
  "My meetings": "Mes réunions",
  "My server": "Mon serveur",
  "My servers": "Mes serveurs",
  "NVIDIA NeMo-Speech.cpp": "NVIDIA NeMo-Speech.cpp",
  "NVIDIA NeMo-Speech.cpp: your nemo-speech serve server, for example http://localhost:9000. Live transcription and imported files use its realtime WebSocket. NVIDIA's hosted gRPC endpoint is not supported.": "NVIDIA NeMo-Speech.cpp : votre serveur nemo-speech serve, par exemple http://localhost:9000. La transcription en direct et les fichiers importés passent par son WebSocket temps réel. Le point d'accès gRPC hébergé par NVIDIA n'est pas pris en charge.",
  "Name": "Nom",
  "Nemotron": "Nemotron",
  "New note in this folder": "Nouvelle note dans ce dossier",
  "No matching languages found": "Aucune langue correspondante trouvée",
  "No notes in this folder match.": "Aucune note de ce dossier ne correspond.",
  "No results found.": "Aucun résultat trouvé.",
  "No server yet": "Aucun serveur",
  "No server yet? Install the local transcription service": "Pas encore de serveur ? Installer le service de transcription en local",
  "Not tested": "Non testé",
  "Note capsule": "Capsule de la note",
  "Note steps": "Étapes de la note",
  "Notes": "Notes",
  "Notifications": "Notifications",
  "On Linux (Wayland or X11)": "Sur Linux (Wayland ou X11)",
  "On Wayland, approve the shortcuts in your desktop's prompt. Use Control + Alt + Escape to cancel. On X11, press Escape to cancel. The target app must expose an editable accessibility field.": "Sur Wayland, approuvez les raccourcis dans l'invite de votre environnement de bureau. Utilisez Ctrl + Alt + Échap pour annuler. Sur X11, appuyez sur Échap pour annuler. L'application cible doit exposer un champ d'accessibilité modifiable.",
  "Only on-premise OpenAI-compatible servers are supported (vLLM, Ollama, llama.cpp server, LM Studio…). The address usually ends with /v1, for example http://localhost:8000/v1.": "Seuls les serveurs compatibles OpenAI hébergés chez vous sont pris en charge (vLLM, Ollama, serveur llama.cpp, LM Studio…). L'adresse se termine en général par /v1, par exemple http://localhost:8000/v1.",
  "Open": "Ouvrir",
  "OpenAI compatible (realtime and batch)": "OpenAI compatible (temps réel et par lots)",
  "OpenAI: a server that speaks the OpenAI speech protocol (vLLM, speaches, faster-whisper-server), for example http://localhost:8000/v1. Live transcription uses /v1/realtime, imported files /v1/audio/transcriptions.": "OpenAI : un serveur qui parle le protocole vocal d'OpenAI (vLLM, speaches, faster-whisper-server), par exemple http://localhost:8000/v1. La transcription en direct passe par /v1/realtime, les fichiers importés par /v1/audio/transcriptions.",
  "Participants": "Participants",
  "Pause listening": "Mettre en pause l'écoute",
  "Paused": "En pause",
  "Permissions": "Autorisations",
  "Post recording disclosure in meeting chat": "Publier la mention d'enregistrement dans le chat de la réunion",
  "Prepare": "Préparer",
  "Press shortcut…": "Appuyez sur le raccourci…",
  "Press your shortcut to start, then press it again to finish.": "Appuyez sur votre raccourci pour démarrer, puis appuyez à nouveau dessus pour terminer.",
  "Privacy": "Confidentialité",
  "Profile": "Profil",
  "Protocol": "Protocole",
  "Put on pause": "Mettre en pause",
  "Ready to dictate": "Prêt à dicter",
  "Reasoning effort": "Effort de raisonnement",
  "Recent": "Récent",
  "Record other participants in meetings.": "Enregistrez les autres participants aux réunions.",
  "Record your voice in meetings and calls.": "Enregistrez votre voix lors des réunions et des appels.",
  "Remind participants about recording": "Rappeler aux participants l'enregistrement",
  "Remove the {name} folder filter": "Retirer le filtre du dossier {name}",
  "Require Windows Hello face, PIN, or password when opening Syntheo.": "Exiger la reconnaissance faciale Windows Hello, le code PIN ou le mot de passe à l'ouverture de Syntheo.",
  "Reset": "Réinitialiser",
  "Reset this server…": "Réinitialiser ce serveur…",
  "Resume listening": "Reprendre l'écoute",
  "Save PDF, text, Markdown, and Org exports to this folder.": "Enregistrer les exports PDF, texte, Markdown et Org dans ce dossier.",
  "Save visible chat from supported meetings using Accessibility.": "Enregistrer la discussion visible des réunions prises en charge à l'aide de l'accessibilité.",
  "Search in this folder...": "Rechercher dans ce dossier...",
  "Search language...": "Rechercher une langue...",
  "Search notes and pages...": "Rechercher des notes et des pages...",
  "Search settings": "Rechercher un paramètre",
  "Search timezone...": "Rechercher un fuseau horaire...",
  "Select language": "Sélectionner une langue",
  "Select timezone": "Sélectionnez le fuseau horaire",
  "Select...": "Sélectionnez...",
  "Server address": "Adresse du serveur",
  "Server address (OpenAI-compatible: vLLM, Ollama, llama.cpp, LM Studio)": "Adresse du serveur (compatible OpenAI : vLLM, Ollama, llama.cpp, LM Studio)",
  "Server status": "État des serveurs",
  "Settings": "Paramètres",
  "Shift": "Maj",
  "Show a reminder when a recording starts.": "Affichez un rappel lorsqu'un enregistrement commence.",
  "Show floating bar": "Afficher la barre flottante",
  "Show release notes": "Afficher les notes de version",
  "Show the timeline in your preferred timezone.": "Afficher la chronologie dans votre fuseau horaire préféré.",
  "Show tray icon": "Afficher l'icône de la zone de notification",
  "Speak into any text field, in any app. The text is inserted when you finish.": "Parlez dans n'importe quel champ de texte, dans n'importe quelle application. Le texte s'insère quand vous avez terminé.",
  "Start Syntheo at login": "Démarrer Syntheo à la connexion",
  "Stop listening when your call ends.": "Arrêter l'écoute lorsque votre appel se termine.",
  "Stop when meeting ends": "Arrêter à la fin de la réunion",
  "Storage": "Stockage",
  "Syntheo uses it to recognize you among the participants of your meetings, so you are not counted twice. It stays on this device.": "Syntheo s'en sert pour vous reconnaître parmi les participants de vos réunions, afin de ne pas vous compter deux fois. Elle reste sur cet appareil.",
  "Synthesis": "Synthèse",
  "Synthesis · connected": "Synthèse · connectée",
  "System audio": "Audio système",
  "System permissions": "Autorisations du système",
  "System sound": "Son système",
  "Tab: search inside": "Tab : chercher dedans",
  "Tell participants when listening starts; this does not confirm consent.": "Indiquez aux participants quand l'écoute commence ; cela ne confirme pas le consentement.",
  "Templates": "Modèles",
  "Test connection": "Tester la connexion",
  "Test the connection to list the models served.": "Testez la connexion pour lister les modèles servis.",
  "Testing…": "Test en cours…",
  "The API key is optional for servers without authentication. It is kept in your system keychain.": "La clé d'API est facultative pour un serveur sans authentification. Elle est gardée dans le trousseau de votre système.",
  "The language model that writes your meeting notes and answers when you ask a note a question.": "Le modèle de langage qui rédige vos comptes-rendus et répond quand vous interrogez une note.",
  "The live transcription model handles one language at a time. To transcribe several, <0>change models</0>.": "Le modèle de transcription en direct ne gère qu'une langue à la fois. Pour en transcrire plusieurs, <0>changez de modèle</0>.",
  "The microphone and system audio are muted: nothing is being transcribed.": "Le micro et le son système sont coupés : plus rien n'est transcrit.",
  "The one that captures your voice.": "Celui qui capte votre voix.",
  "The server did not answer at {host}. Check that it is running and that you are on the right network (VPN, Tailscale), then test again.": "Le serveur n'a pas répondu à {host}. Vérifiez qu'il est démarré et que vous êtes sur le bon réseau (VPN, Tailscale), puis relancez le test.",
  "The server that turns speech into text during your meetings. Audio is never written to disk.": "Le serveur qui transforme la voix en texte, pendant la réunion. L'audio n'est jamais écrit sur le disque.",
  "The server transcribes with the model it loaded, whatever the model chosen here.": "Le serveur transcrit avec le modèle qu'il a chargé, quel que soit le modèle choisi ici.",
  "This information stays on your computer. It is used to recognize you in transcripts and to sign your meeting notes.": "Ces informations restent sur votre poste. Elles servent à vous reconnaître dans les transcriptions et à signer vos comptes-rendus.",
  "This server answers as {detectedLabel}.": "Ce serveur répond comme {detectedLabel}.",
  "Timezone": "Fuseau horaire",
  "Transcribing…": "Transcription…",
  "Transcription": "Transcription",
  "Transcription server ›": "Serveur de transcription ›",
  "Transcription · connected": "Transcription · connectée",
  "Try again": "Réessayer",
  "Try dictation": "Essayer la dictée",
  "Try it": "Essayer",
  "Type": "Type",
  "Unmute system audio": "Rétablir le son système",
  "Unmute the microphone": "Rétablir le micro",
  "Unreachable": "Injoignable",
  "Use main language for summaries": "Utiliser la langue principale pour les résumés",
  "Use this protocol": "Utiliser ce protocole",
  "Used for transcription and automatic summary language detection.": "Utilisé pour la transcription et la détection automatique de la langue des résumés.",
  "When off, summaries follow the detected meeting language.": "Lorsque l'option est désactivée, les résumés suivent la langue détectée de la réunion.",
  "Words appear in a small bubble while you speak. Text is inserted when you finish.": "Les mots s'affichent dans une petite bulle pendant que vous parlez. Le texte s'insère quand vous avez terminé.",
  "Words specific to you go in your": "Vos mots à vous vont dans votre",
  "Write freely, Syntheo will complete it.": "Écrivez librement, Syntheo complétera.",
  "Writing": "Écrire",
  "detected automatically": "détecté automatiquement",
  "dictionary": "dictionnaire",
  "vLLM, speaches, faster-whisper-server": "vLLM, speaches, faster-whisper-server",
  "{count, plural, one {# meeting} other {# meetings}}": "{count, plural, one {# réunion} other {# réunions}}"
};
const SYN_ICONS = {
  "ArrowRight": "<path d=\"M18.5 12L4.99997 12\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M13 18C13 18 19 13.5811 19 12C19 10.4188 13 6 13 6\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Bell": "<path d=\"M16 18C16 20.2091 14.2091 22 12 22C9.79086 22 8 20.2091 8 18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M4.43654 18H19.5625C20.2903 18 20.6542 18 20.8648 17.8951C21.274 17.6913 21.4929 17.2359 21.3964 16.789C21.3468 16.559 21.1194 16.2749 20.6648 15.7066L20.4951 15.4944C20.0392 14.9246 19.8113 14.6397 19.6184 14.3409C19.0187 13.4119 18.6477 12.354 18.5356 11.254C18.4995 10.9002 18.4995 10.5353 18.4995 9.8056V8.5C18.4995 8.03572 18.4995 7.80358 18.4867 7.60758C18.2898 4.60304 15.8965 2.20977 12.892 2.01285C12.696 2 12.4638 2 11.9995 2C11.5353 2 11.3031 2 11.1071 2.01285C8.10258 2.20977 5.70931 4.60304 5.51239 7.60758C5.49954 7.80358 5.49954 8.03572 5.49954 8.5V9.8056C5.49954 10.5353 5.49954 10.9002 5.46349 11.254C5.35143 12.354 4.98035 13.4119 4.38067 14.3409C4.18779 14.6397 3.95985 14.9246 3.50401 15.4944L3.33427 15.7066C2.87964 16.2749 2.65233 16.559 2.60268 16.789C2.50621 17.2359 2.72509 17.6913 3.13431 17.8951C3.3449 18 3.70878 18 4.43654 18Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/>",
  "BookOpen": "<path d=\"M7.99978 3.5H6.60021C4.43183 3.5 3.34764 3.5 2.67399 4.17362C2.00034 4.84724 2.00029 5.93144 2.00021 8.09982L2 13.3998C1.99992 15.5684 1.99987 16.6526 2.67353 17.3263C3.34719 18 4.43146 18 6.6 18H8.95042C10.4329 18 11.7092 19.0464 11.9999 20.5V5.5C11.0556 4.24097 9.99989 3.5 7.99978 3.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M16.0001 3.5H17.3997C19.5681 3.5 20.6523 3.5 21.3259 4.17362C21.9996 4.84724 21.9996 5.93144 21.9997 8.09982L21.9999 13.3998C22 15.5684 22 16.6526 21.3264 17.3263C20.6527 18 19.5684 18 17.3999 18H15.0495C13.567 18 12.2907 19.0464 12 20.5V5.5C12.9443 4.24097 14 3.5 16.0001 3.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "CaretDown": "<path d=\"M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "CaretRight": "<path d=\"M9.00005 6C9.00005 6 15 10.4189 15 12C15 13.5812 9 18 9 18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Check": "<path d=\"M5 13.2592L7.58583 15.9568C8.2525 16.6523 8.58583 17 9.00004 17C9.41425 17 9.74759 16.6523 10.4143 15.9568L19 7\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "CircleNotch": "<path d=\"M21.9961 12C21.9961 17.5228 17.5189 22 11.9961 22C6.47325 22 1.99609 17.5228 1.99609 12C1.99609 6.47715 6.47325 2 11.9961 2\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/>",
  "Code": "<path d=\"M16 6.99998L19.0664 9.64296C20.3554 10.7541 21 11.3096 21 12C21 12.6903 20.3555 13.2459 19.0664 14.357L16 17\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M8 6.99998L4.93365 9.64296C3.64455 10.7541 3 11.3096 3 12C3 12.6903 3.64455 13.2459 4.93365 14.357L8 17\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "DotsThree": "<path d=\"M6.00449 12.5V12M18.0045 12.5V12M12.0045 12.5V12M7.00449 12.5C7.00449 11.9477 6.55677 11.5 6.00449 11.5C5.4522 11.5 5.00449 11.9477 5.00449 12.5C5.00449 13.0523 5.4522 13.5 6.00449 13.5C6.55677 13.5 7.00449 13.0523 7.00449 12.5ZM19.0045 12.5C19.0045 11.9477 18.5568 11.5 18.0045 11.5C17.4522 11.5 17.0045 11.9477 17.0045 12.5C17.0045 13.0523 17.4522 13.5 18.0045 13.5C18.5568 13.5 19.0045 13.0523 19.0045 12.5ZM13.0045 12.5C13.0045 11.9477 12.5568 11.5 12.0045 11.5C11.4522 11.5 11.0045 11.9477 11.0045 12.5C11.0045 13.0523 11.4522 13.5 12.0045 13.5C12.5568 13.5 13.0045 13.0523 13.0045 12.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "FileText": "<path d=\"M8 18H16\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M8 14H16\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M8 10H10\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M13 2.5V3C13 5.82843 13 7.24264 13.8787 8.12132C14.7574 9 16.1716 9 19 9H19.5M20 10.6569V14C20 17.7712 20 19.6569 18.8284 20.8284C17.6569 22 15.7712 22 12 22C8.22876 22 6.34315 22 5.17157 20.8284C4 19.6569 4 17.7712 4 14V9.45584C4 6.21082 4 4.58831 4.88607 3.48933C5.06508 3.26731 5.26731 3.06508 5.48933 2.88607C6.58831 2 8.21082 2 11.4558 2C12.1614 2 12.5141 2 12.8372 2.11401C12.9044 2.13772 12.9702 2.165 13.0345 2.19575C13.3436 2.34355 13.593 2.593 14.0919 3.09188L18.8284 7.82843C19.4065 8.40649 19.6955 8.69552 19.8478 9.06306C20 9.4306 20 9.83935 20 10.6569Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Folder": "<path d=\"M13.6656 6.49446H16C18.8284 6.49446 20.2426 6.49446 21.1213 7.37314C22 8.25182 22 9.66603 22 12.4945V14.5C22 17.3284 22 18.7426 21.1213 19.6213C20.2426 20.5 18.8284 20.5 16 20.5H8C5.17157 20.5 3.75736 20.5 2.87868 19.6213C2 18.7426 2 17.3284 2 14.5V8.99183C2 6.65409 2 5.48521 2.61604 4.67881C2.7778 4.46706 2.96706 4.2778 3.17881 4.11604C3.98521 3.5 5.15409 3.5 7.49183 3.5C8.16633 3.5 8.50358 3.5 8.81392 3.60442C8.8976 3.63257 8.97932 3.66623 9.05854 3.70518C9.35239 3.84965 9.59179 4.08719 10.0706 4.56227L10.8483 5.33389C11.4254 5.9066 11.714 6.19295 12.08 6.3437C12.446 6.49446 12.8525 6.49446 13.6656 6.49446Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "FolderSimple": "<path d=\"M13.6656 6.49446H16C18.8284 6.49446 20.2426 6.49446 21.1213 7.37314C22 8.25182 22 9.66603 22 12.4945V14.5C22 17.3284 22 18.7426 21.1213 19.6213C20.2426 20.5 18.8284 20.5 16 20.5H8C5.17157 20.5 3.75736 20.5 2.87868 19.6213C2 18.7426 2 17.3284 2 14.5V8.99183C2 6.65409 2 5.48521 2.61604 4.67881C2.7778 4.46706 2.96706 4.2778 3.17881 4.11604C3.98521 3.5 5.15409 3.5 7.49183 3.5C8.16633 3.5 8.50358 3.5 8.81392 3.60442C8.8976 3.63257 8.97932 3.66623 9.05854 3.70518C9.35239 3.84965 9.59179 4.08719 10.0706 4.56227L10.8483 5.33389C11.4254 5.9066 11.714 6.19295 12.08 6.3437C12.446 6.49446 12.8525 6.49446 13.6656 6.49446Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Gear": "<path d=\"M15.5 12C15.5 13.933 13.933 15.5 12 15.5C10.067 15.5 8.5 13.933 8.5 12C8.5 10.067 10.067 8.5 12 8.5C13.933 8.5 15.5 10.067 15.5 12Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M21.011 14.0965C21.5329 13.9558 21.7939 13.8854 21.8969 13.7508C22 13.6163 22 13.3998 22 12.9669V11.0332C22 10.6003 22 10.3838 21.8969 10.2493C21.7938 10.1147 21.5329 10.0443 21.011 9.90358C19.0606 9.37759 17.8399 7.33851 18.3433 5.40087C18.4817 4.86799 18.5509 4.60156 18.4848 4.44529C18.4187 4.28902 18.2291 4.18134 17.8497 3.96596L16.125 2.98673C15.7528 2.77539 15.5667 2.66972 15.3997 2.69222C15.2326 2.71472 15.0442 2.90273 14.6672 3.27873C13.208 4.73448 10.7936 4.73442 9.33434 3.27864C8.95743 2.90263 8.76898 2.71463 8.60193 2.69212C8.43489 2.66962 8.24877 2.77529 7.87653 2.98663L6.15184 3.96587C5.77253 4.18123 5.58287 4.28891 5.51678 4.44515C5.45068 4.6014 5.51987 4.86787 5.65825 5.4008C6.16137 7.3385 4.93972 9.37763 2.98902 9.9036C2.46712 10.0443 2.20617 10.1147 2.10308 10.2492C2 10.3838 2 10.6003 2 11.0332V12.9669C2 13.3998 2 13.6163 2.10308 13.7508C2.20615 13.8854 2.46711 13.9558 2.98902 14.0965C4.9394 14.6225 6.16008 16.6616 5.65672 18.5992C5.51829 19.1321 5.44907 19.3985 5.51516 19.5548C5.58126 19.7111 5.77092 19.8188 6.15025 20.0341L7.87495 21.0134C8.24721 21.2247 8.43334 21.3304 8.6004 21.3079C8.76746 21.2854 8.95588 21.0973 9.33271 20.7213C10.7927 19.2644 13.2088 19.2643 14.6689 20.7212C15.0457 21.0973 15.2341 21.2853 15.4012 21.3078C15.5682 21.3303 15.7544 21.2246 16.1266 21.0133L17.8513 20.034C18.2307 19.8187 18.4204 19.711 18.4864 19.5547C18.5525 19.3984 18.4833 19.132 18.3448 18.5991C17.8412 16.6616 19.0609 14.6226 21.011 14.0965Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/>",
  "Lightning": "<path d=\"M8.62814 12.6736H8.16918C6.68545 12.6736 5.94358 12.6736 5.62736 12.1844C5.31114 11.6953 5.61244 11.0138 6.21504 9.65083L8.02668 5.55323C8.57457 4.314 8.84852 3.69438 9.37997 3.34719C9.91142 3 10.5859 3 11.935 3H14.0244C15.6632 3 16.4826 3 16.7916 3.53535C17.1007 4.0707 16.6942 4.78588 15.8811 6.21623L14.8092 8.10188C14.405 8.81295 14.2029 9.16849 14.2057 9.45952C14.2094 9.83775 14.4105 10.1862 14.7354 10.377C14.9854 10.5239 15.3927 10.5239 16.2074 10.5239C17.2373 10.5239 17.7523 10.5239 18.0205 10.7022C18.3689 10.9338 18.5513 11.3482 18.4874 11.7632C18.4382 12.0826 18.0918 12.4656 17.399 13.2317L11.8639 19.3523C10.7767 20.5545 10.2331 21.1556 9.86807 20.9654C9.50303 20.7751 9.67833 19.9822 10.0289 18.3962L10.7157 15.2896C10.9826 14.082 11.1161 13.4782 10.7951 13.0759C10.4741 12.6736 9.85877 12.6736 8.62814 12.6736Z\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Location": "<path d=\"M13.6177 21.367C13.1841 21.773 12.6044 22 12.0011 22C11.3978 22 10.8182 21.773 10.3845 21.367C6.41302 17.626 1.09076 13.4469 3.68627 7.37966C5.08963 4.09916 8.45834 2 12.0011 2C15.5439 2 18.9126 4.09916 20.316 7.37966C22.9082 13.4393 17.599 17.6389 13.6177 21.367Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M15.5 11C15.5 12.933 13.933 14.5 12 14.5C10.067 14.5 8.5 12.933 8.5 11C8.5 9.067 10.067 7.5 12 7.5C13.933 7.5 15.5 9.067 15.5 11Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/>",
  "Lock": "<path d=\"M4.26781 18.8447C4.49269 20.515 5.87613 21.8235 7.55966 21.9009C8.97627 21.966 10.4153 22 12 22C13.5847 22 15.0237 21.966 16.4403 21.9009C18.1239 21.8235 19.5073 20.515 19.7322 18.8447C19.879 17.7547 20 16.6376 20 15.5C20 14.3624 19.879 13.2453 19.7322 12.1553C19.5073 10.485 18.1239 9.17649 16.4403 9.09909C15.0237 9.03397 13.5847 9 12 9C10.4153 9 8.97627 9.03397 7.55966 9.09909C5.87613 9.17649 4.49269 10.485 4.26781 12.1553C4.12105 13.2453 4 14.3624 4 15.5C4 16.6376 4.12105 17.7547 4.26781 18.8447Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M7.5 9V6.5C7.5 4.01472 9.51472 2 12 2C14.4853 2 16.5 4.01472 16.5 6.5V9\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12.125 15.5H12M12.25 15.5C12.25 15.6381 12.1381 15.75 12 15.75C11.8619 15.75 11.75 15.6381 11.75 15.5C11.75 15.3619 11.8619 15.25 12 15.25C12.1381 15.25 12.25 15.3619 12.25 15.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M8.125 15.5H8M8.25 15.5C8.25 15.6381 8.13807 15.75 8 15.75C7.86193 15.75 7.75 15.6381 7.75 15.5C7.75 15.3619 7.86193 15.25 8 15.25C8.13807 15.25 8.25 15.3619 8.25 15.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M16.125 15.5H16M16.25 15.5C16.25 15.6381 16.1381 15.75 16 15.75C15.8619 15.75 15.75 15.6381 15.75 15.5C15.75 15.3619 15.8619 15.25 16 15.25C16.1381 15.25 16.25 15.3619 16.25 15.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "MagnifyingGlass": "<path d=\"M17 17L21 21\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19C15.4183 19 19 15.4183 19 11Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Microphone": "<path d=\"M7 6.5C7 4.01472 9.01472 2 11.5 2C13.9853 2 16 4.01472 16 6.5V11.5C16 13.9853 13.9853 16 11.5 16C9.01472 16 7 13.9853 7 11.5V6.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M11.5 19H11.0828C7.57267 19 4.57706 16.4623 4 13M11.5 19H11.9172C15.4273 19 18.4229 16.4623 19 13M11.5 19V22\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "MicrophoneSlash": "<path d=\"M8.1572 4.1572C8.94761 2.86349 10.373 2 12 2C14.4853 2 16.5 4.01472 16.5 6.5V11.5C16.5 11.8111 16.4684 12.1149 16.4083 12.4083M7.5 7.5V11.5C7.5 13.9853 9.51472 16 12 16C13.1154 16 14.136 15.5942 14.9222 14.9222\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M2 2L22 22\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12 19H11.5828C8.07267 19 5.07706 16.4623 4.5 13M12 19H12.4172C14.2325 19 15.9102 18.3213 17.1869 17.1869M12 19V22M19.5 13C19.3878 13.6733 19.1841 14.3116 18.903 14.903\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "NotePencil": "<path d=\"M15.5 2V5M6.5 2V5M11 2V5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M19 12V10.5C19 7.20017 19 5.55025 17.9749 4.52512C16.9497 3.5 15.2998 3.5 12 3.5H10C6.70017 3.5 5.05025 3.5 4.02513 4.52513C3 5.55025 3 7.20017 3 10.5V15C3 18.2998 3 19.9497 4.02513 20.9749C5.05025 22 6.70017 22 10 22H11\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M7 15H11M7 11H15\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M15.7367 21.6527L14 22L14.3473 20.2633C14.4179 19.9106 14.5913 19.5866 14.8456 19.3323L18.9111 15.2668C19.2668 14.9111 19.8437 14.9111 20.1995 15.2668L20.7332 15.8005C21.0889 16.1563 21.0889 16.7332 20.7332 17.0889L16.6677 21.1544C16.4134 21.4087 16.0894 21.5821 15.7367 21.6527Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Pause": "<path d=\"M4 7C4 5.58579 4 4.87868 4.43934 4.43934C4.87868 4 5.58579 4 7 4C8.41421 4 9.12132 4 9.56066 4.43934C10 4.87868 10 5.58579 10 7V17C10 18.4142 10 19.1213 9.56066 19.5607C9.12132 20 8.41421 20 7 20C5.58579 20 4.87868 20 4.43934 19.5607C4 19.1213 4 18.4142 4 17V7Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M14 7C14 5.58579 14 4.87868 14.4393 4.43934C14.8787 4 15.5858 4 17 4C18.4142 4 19.1213 4 19.5607 4.43934C20 4.87868 20 5.58579 20 7V17C20 18.4142 20 19.1213 19.5607 19.5607C19.1213 20 18.4142 20 17 20C15.5858 20 14.8787 20 14.4393 19.5607C14 19.1213 14 18.4142 14 17V7Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/>",
  "Play": "<path d=\"M18.8906 12.846C18.5371 14.189 16.8667 15.138 13.5257 17.0361C10.296 18.8709 8.6812 19.7884 7.37983 19.4196C6.8418 19.2671 6.35159 18.9776 5.95624 18.5787C5 17.6139 5 15.7426 5 12C5 8.2574 5 6.3861 5.95624 5.42132C6.35159 5.02245 6.8418 4.73288 7.37983 4.58042C8.6812 4.21165 10.296 5.12907 13.5257 6.96393C16.8667 8.86197 18.5371 9.811 18.8906 11.154C19.0365 11.7084 19.0365 12.2916 18.8906 12.846Z\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "ShieldCheck": "<path d=\"M20.9922 11.1833V8.28029C20.9922 6.64029 20.9922 5.82028 20.5881 5.28529C20.184 4.75029 19.2703 4.49056 17.4429 3.9711C16.1944 3.6162 15.0938 3.18863 14.2145 2.79829C13.0156 2.2661 12.4161 2 11.9922 2C11.5682 2 10.9688 2.2661 9.7699 2.79829C8.89057 3.18863 7.79002 3.61619 6.54152 3.9711C4.71411 4.49056 3.80041 4.75029 3.3963 5.28529C2.99219 5.82028 2.99219 6.64029 2.99219 8.28029V11.1833C2.99219 16.8085 8.05496 20.1835 10.5861 21.5194C11.1932 21.8398 11.4968 22 11.9922 22C12.4876 22 12.7911 21.8398 13.3982 21.5194C15.9294 20.1835 20.9922 16.8085 20.9922 11.1833Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M8.49219 11.8333C8.49219 11.8333 9.36719 11.8333 10.2422 13.5C10.2422 13.5 13.0216 9.33333 15.4922 8.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Sparkle": "<path d=\"M10.5279 7.13967C11.3077 5.71322 11.6977 5 11.9958 5C12.294 5 12.6839 5.71322 13.4638 7.13967C14.2665 8.60787 15.3392 9.69316 16.8489 10.52C18.2778 11.3026 18.9922 11.6938 18.9922 11.9923C18.9922 12.2908 18.2773 12.6825 16.8475 13.4658C15.3808 14.2693 14.2966 15.3432 13.4706 16.8545C12.6889 18.2848 12.298 19 11.9998 19C11.7017 19 11.3104 18.2844 10.5279 16.853C9.7252 15.3848 8.65247 14.2995 7.14272 13.4727C5.70903 12.6875 4.99219 12.2949 4.99219 11.9964C4.99219 11.6978 5.70903 11.3052 7.14272 10.52C8.65247 9.69316 9.7252 8.60787 10.5279 7.13967Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "SpeakerHigh": "<path d=\"M14 14.8135V9.18646C14 6.04126 14 4.46866 13.0747 4.0773C12.1494 3.68593 11.0603 4.79793 8.88232 7.02192C7.75439 8.17365 7.11085 8.42869 5.50604 8.42869C4.10257 8.42869 3.40084 8.42869 2.89675 8.77262C1.85035 9.48655 2.00852 10.882 2.00852 12C2.00852 13.118 1.85035 14.5134 2.89675 15.2274C3.40084 15.5713 4.10257 15.5713 5.50604 15.5713C7.11085 15.5713 7.75439 15.8264 8.88232 16.9781C11.0603 19.2021 12.1494 20.3141 13.0747 19.9227C14 19.5313 14 17.9587 14 14.8135Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M17 9C17.6254 9.81968 18 10.8634 18 12C18 13.1366 17.6254 14.1803 17 15\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M20 7C21.2508 8.36613 22 10.1057 22 12C22 13.8943 21.2508 15.6339 20 17\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "SpeakerX": "<path d=\"M14 14.8135V9.18646C14 6.04126 14 4.46866 13.0747 4.0773C12.1494 3.68593 11.0603 4.79793 8.88232 7.02192C7.75439 8.17365 7.11085 8.42869 5.50604 8.42869C4.10257 8.42869 3.40084 8.42869 2.89675 8.77262C1.85035 9.48655 2.00852 10.882 2.00852 12C2.00852 13.118 1.85035 14.5134 2.89675 15.2274C3.40084 15.5713 4.10257 15.5713 5.50604 15.5713C7.11085 15.5713 7.75439 15.8264 8.88232 16.9781C11.0603 19.2021 12.1494 20.3141 13.0747 19.9227C14 19.5313 14 17.9587 14 14.8135Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M18 10L22 14M18 14L22 10\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/>",
  "Sun": "<path d=\"M16.9991 12C16.9991 14.7614 14.7605 17 11.9991 17C9.23766 17 6.99908 14.7614 6.99908 12C6.99908 9.23858 9.23766 7 11.9991 7C14.7605 7 16.9991 9.23858 16.9991 12Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12.1247 3.25H11.9997M12.1242 20.75H11.9992M20.75 12.125V12M3.25 12.125V12M18.2752 5.90098L18.1868 5.81259M5.90051 18.275L5.81212 18.1866M18.0987 18.2756L18.187 18.1872M5.72429 5.9012L5.81267 5.81282M12.2497 3.25C12.2497 3.38807 12.1378 3.5 11.9997 3.5C11.8616 3.5 11.7497 3.38807 11.7497 3.25C11.7497 3.11193 11.8616 3 11.9997 3C12.1378 3 12.2497 3.11193 12.2497 3.25ZM12.2492 20.75C12.2492 20.8881 12.1373 21 11.9992 21C11.8611 21 11.7492 20.8881 11.7492 20.75C11.7492 20.6119 11.8611 20.5 11.9992 20.5C12.1373 20.5 12.2492 20.6119 12.2492 20.75ZM20.75 12.25C20.6119 12.25 20.5 12.1381 20.5 12C20.5 11.8619 20.6119 11.75 20.75 11.75C20.8881 11.75 21 11.8619 21 12C21 12.1381 20.8881 12.25 20.75 12.25ZM3.25 12.25C3.11193 12.25 3 12.1381 3 12C3 11.8619 3.11193 11.75 3.25 11.75C3.38807 11.75 3.5 11.8619 3.5 12C3.5 12.1381 3.38807 12.25 3.25 12.25ZM18.3636 5.98937C18.266 6.087 18.1077 6.087 18.01 5.98937C17.9124 5.89174 17.9124 5.73345 18.01 5.63582C18.1077 5.53819 18.266 5.53819 18.3636 5.63582C18.4612 5.73345 18.4612 5.89174 18.3636 5.98937ZM5.9889 18.3634C5.89127 18.461 5.73297 18.461 5.63534 18.3634C5.53771 18.2658 5.53771 18.1075 5.63534 18.0099C5.73297 17.9122 5.89127 17.9122 5.9889 18.0099C6.08653 18.1075 6.08653 18.2658 5.9889 18.3634ZM18.0103 18.364C17.9126 18.2663 17.9126 18.108 18.0103 18.0104C18.1079 17.9128 18.2662 17.9128 18.3638 18.0104C18.4614 18.108 18.4614 18.2663 18.3638 18.364C18.2662 18.4616 18.1079 18.4616 18.0103 18.364ZM5.6359 5.98959C5.53827 5.89196 5.53827 5.73367 5.6359 5.63604C5.73353 5.53841 5.89182 5.53841 5.98945 5.63604C6.08708 5.73367 6.08708 5.89196 5.98945 5.98959C5.89182 6.08722 5.73353 6.08722 5.6359 5.98959Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "User": "<path d=\"M20 21.0001C19.713 17.269 16.7289 14.3151 12.995 14.0662L12 13.9999C11.6446 14.0096 11.3134 14.0225 11.0008 14.0378C7.3 14.2192 4.28417 17.3057 4 21.0001\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><circle cx=\"12\" cy=\"6.99988\" r=\"4\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Users": "<path d=\"M16.5 20V16.9852C16.5 16.364 16.2184 15.7658 15.6838 15.4494C14.1574 14.546 12.1714 14 10 14C7.82863 14 5.84261 14.546 4.31618 15.4494C3.78162 15.7658 3.5 16.364 3.5 16.9852V20\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><circle cx=\"10\" cy=\"7.5\" r=\"3.5\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M20.5 20.001V16.9862C20.5 16.365 20.2184 15.7667 19.6838 15.4504C19.171 15.1468 18.6062 14.8837 18 14.668\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M15 4.14453C16.4457 4.57481 17.5 5.91408 17.5 7.49959C17.5 9.0851 16.4457 10.4244 15 10.8547\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/>",
  "VideoCamera": "<path d=\"M2 11C2 7.70017 2 6.05025 3.02513 5.02513C4.05025 4 5.70017 4 9 4H10C13.2998 4 14.9497 4 15.9749 5.02513C17 6.05025 17 7.70017 17 11V13C17 16.2998 17 17.9497 15.9749 18.9749C14.9497 20 13.2998 20 10 20H9C5.70017 20 4.05025 20 3.02513 18.9749C2 17.9497 2 16.2998 2 13V11Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M17 8.90585L17.1259 8.80196C19.2417 7.05623 20.2996 6.18336 21.1498 6.60482C22 7.02628 22 8.42355 22 11.2181V12.7819C22 15.5765 22 16.9737 21.1498 17.3952C20.2996 17.8166 19.2417 16.9438 17.1259 15.198L17 15.0941\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><circle cx=\"11.5\" cy=\"9.5\" r=\"1.5\" stroke=\"currentColor\" stroke-width=\"1.5\"/>",
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

const synCssParts = () => [SYN_CSS_NOTE, SYN_CSS_SETTINGS, SYN_CSS_MEETINGS, SYN_CSS_SERVERS, SYN_CSS_PROFILE, SYN_CSS_DICTATION_SETTINGS, SYN_CSS_PRIVACY, SYN_CSS_PALETTE];

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

/** Encadré « Vous êtes ici » : la section que décrit la page. */
const SynHere = ({ active = true, children, style }) =>
  active ? (
    <div className="syn-here" style={style}>
      <span className="syn-here-tag">Vous êtes ici</span>
      {children}
    </div>
  ) : (
    <div style={style}>{children}</div>
  );

const SynToolbar = ({ markers, setMarkers, onReset }) => (
  <div className="syn-bar">
    <span className="syn-badge">
      {h(SynIcon, { name: I("Play"), size: 14 })}
      Reproduction interactive · Syntheo {SYN_VERSION}
    </span>
    <span className="syn-bar-actions">
      {setMarkers ? (
        <label className="syn-check">
          <input type="checkbox" checked={markers} onChange={(e) => setMarkers(e.target.checked)} />
          Afficher les repères
        </label>
      ) : null}
      {onReset ? <button type="button" className="syn-link" onClick={onReset}>Recommencer</button> : null}
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
  <nav className="syn-root syn-path not-prose" aria-label="Chemin dans l'application">
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
                    ? "Dans l'app, cette entrée ouvre sa propre vue, décrite dans la page de la documentation qui lui est consacrée."
                    : "Cette section n'est pas reproduite ici : la page de la documentation qui la concerne la décrit."}
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
const SYN_SPEAKER_GONE = "Écouteurs Bluetooth";
const SYN_SPEAKERS = ["Casque USB", "HDMI — Écran externe"];
const SYN_SPEAKER_DEFAULT = "Haut-parleurs intégrés";

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
                  <option value="Micro du casque USB">Micro du casque USB</option>
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
const SYN_SRV_HTTPS = "Utilisez HTTPS : le HTTP n'est accepté que sur cette machine ou un réseau privé.";
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
              L("No server yet? Install the local transcription service"),
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
                aria-label={`Retirer ${synProfLangName(code)}`}
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
  const [main, setMain] = useState("fr");
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
        Démonstration : simuler un modèle de transcription qui ne gère qu'une langue
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
      <input className="syn-input" type="text" defaultValue="Cheffe de produit" />
    </label>
    <label className="syn-prof-field">
      {L("Email")}
      <input className="syn-input" type="email" defaultValue="camille.rousseau@exemple.fr" />
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
                <span className="syn-muted" style={{ display: "block", fontSize: 12, fontWeight: 400 }}>~/Téléchargements</span>
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

const SYN_DICTATION_SAMPLE = "Bonjour Camille, je vous envoie le compte rendu de jeudi avant midi.";
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
              <option value="Micro du casque USB">Micro du casque USB</option>
              <option value="Micro interne">Micro interne</option>
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
      <label htmlFor={id}>Démo · système montré</label>
      <select id={id} className="syn-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="linux">Linux</option>
        <option value="windows">Windows</option>
      </select>
      <span>Linux n'offre pas d'authentification de l'appareil : le réglage y reste grisé.</span>
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
  { path: "Produit/Roadmap", count: 12 },
  { path: "Recrutement", count: 5 },
  { path: "Juridique", count: 3 },
];

const SYN_PAL_NOTES = [
  { id: 1, title: "Point hebdo produit", folder: "Produit/Roadmap", date: "9 nov.", body: "La bêta est décalée au 21 novembre. Malik vérifie le quota du serveur de transcription." },
  { id: 2, title: "Revue sprint 42", folder: "Produit/Roadmap", date: "5 nov.", body: "Démo de la pastille flottante. Bêta ouverte à vingt testeurs." },
  { id: 3, title: "Entretien candidat", folder: "Recrutement", date: "4 nov.", body: "Questions sur le quota de congés et le télétravail." },
  { id: 4, title: "Comité RGPD", folder: "Juridique", date: "2 nov.", body: "Registre des traitements, durée de conservation." },
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
              {h(SynIcon, { name: I("MagnifyingGlass") })} Rouvrir la palette (Ctrl K)
            </button>
          </div>
        )}
      </div>
  );
};

// Lot 1 (issue 512) : meetings.mdx.

/**
 * Fenêtre d'une note avec sa capsule. `stage` : prepare | listen | synthesis.
 * Repères : 1 étapes, 2 actions de la capsule, 3 contenu de la note.
 */
export const AppScreen = ({ stage = "prepare", title = "Point hebdo produit", markers = true }) => {
  const [state, act] = useSynSession(stage);
  const [showMarkers, setShowMarkers] = useState(markers);
  const bothMuted = state.micMuted && state.speakerMuted;
  const [stageRef, windowRef, scale, scaledHeight] = useSynScale();
  return (
    <figure className="syn-root syn-figure not-prose">
      {h(SynStyle)}
      {h(SynToolbar, { markers: showMarkers, setMarkers: setShowMarkers, onReset: act.reset })}
      <div className="syn-stage" ref={stageRef} style={{ height: scaledHeight }}>
      <div className="syn-window" ref={windowRef} style={{ width: SYN_WINDOW_WIDTH, transform: `scale(${scale})` }}>
        <div className="syn-titlebar">
          <strong>{title}</strong>
          <span>· Syntheo</span>
        </div>
        <div className="syn-body">
          <div className="syn-doc">
            <p className="syn-title">
              {showMarkers ? <span className="syn-hs" aria-hidden="true" style={{ left: -26, top: 2 }}>3</span> : null}
              {title}
            </p>
            {state.stage === "prepare" ? (
              <>
                <dl className="syn-fiche">
                  <dt>{L("Folder")}</dt>
                  <dd><span className="syn-chip">Produit · Roadmap</span></dd>
                  <dt>{L("Type")}</dt>
                  <dd>Point projet / Sprint</dd>
                  <dt>{L("Participants")}</dt>
                  <dd>Camille R., Malik B.</dd>
                  <dt>{L("Listening")}</dt>
                  <dd>{L("Mic")} · {L("Computer audio")}</dd>
                </dl>
                <p className="syn-hint">{L("Write freely, Syntheo will complete it.")}</p>
              </>
            ) : null}
            {state.stage === "listen" ? (
              <ul className="syn-notes">
                <li>bêta : décaler au 21 ?</li>
                <li>vérifier le quota du serveur de transcription</li>
              </ul>
            ) : null}
            {state.stage === "synthesis" ? (
              <div className="syn-summary">
                <h4>Décisions</h4>
                <ul>
                  <li>La bêta est décalée au 21 novembre.</li>
                  <li>Malik vérifie le quota du serveur de transcription avant jeudi.</li>
                </ul>
                <h4>Actions</h4>
                <ul>
                  <li>Camille prévient les testeurs mardi.</li>
                </ul>
                <span className="syn-seal" aria-hidden="true">記</span>
              </div>
            ) : null}
          </div>
          {state.stage === "listen" ? (
            <aside className="syn-margin" aria-label={L("Transcription")}>
              <h4>{L("Transcription")}</h4>
              <p><b>Vous</b> — on peut décaler la bêta d'une semaine ?</p>
              <p><b>Camille</b> — oui, le 21 ça me va.</p>
              {bothMuted ? (
                <p className="syn-alert" role="status">{L("The microphone and system audio are muted: nothing is being transcribed.")}</p>
              ) : null}
            </aside>
          ) : null}
        </div>
        <div className="syn-capsule-slot">
          {h(SynCapsule, { state, act, markers: showMarkers })}
        </div>
      </div>
      </div>
    </figure>
  );
};

/** La capsule seule, sur fond neutre. */
export const Capsule = ({ stage = "prepare" }) => {
  const [state, act] = useSynSession(stage);
  return (
    <figure className="syn-root syn-figure not-prose">
      {h(SynStyle)}
      {h(SynToolbar, { onReset: act.reset })}
      <div style={{ display: "flex", justifyContent: "center", padding: "18px 0", overflowX: "auto" }}>
        {h(SynCapsule, { state, act })}
      </div>
    </figure>
  );
};
