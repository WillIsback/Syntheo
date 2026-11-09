// Fichier généré par scripts/sync-docs-ui.mjs depuis scripts/docs-ui/core.jsx.tpl, scripts/docs-ui/note.jsx.tpl, scripts/docs-ui/settings.jsx.tpl, scripts/docs-ui/settings-meetings.jsx.tpl, scripts/docs-ui/settings-servers.jsx.tpl, scripts/docs-ui/settings-profile.jsx.tpl, scripts/docs-ui/settings-dictation.jsx.tpl, scripts/docs-ui/settings-privacy.jsx.tpl, scripts/docs-ui/palette.jsx.tpl, scripts/docs-ui/meeting.jsx.tpl : ne pas modifier.
// Reproductions interactives de Syntheo pour la documentation Mintlify.
// Modèles de docs/snippets/*.gen.jsx : les blocs @TOKENS, @LABELS, @ICONS,
// @CSS_PARTS et @VERSION sont remplis par scripts/sync-docs-ui.mjs depuis les
// sources de l'app (tokens.css, messages.po, Hugeicons de packages/ui).
// Libellés : L(msgid anglais de messages.po, entre guillemets), LP(msgid, n) pour un pluriel,
// LF(msgid, { nom: valeur }) pour une variable. Icônes : I("Folder"), le nom
// de packages/ui/src/components/icons-*.tsx.
// Mintlify fournit React et ses hooks sans import ; un snippet ne peut
// importer ni un autre snippet ni du JSON, d'où des fichiers autonomes.
// Feuilles de style propres à un modèle : const SYN_CSS_NOM = `…` (préfixe
// .syn-), ajoutées automatiquement à {h(SynStyle)}.

const SYN_VERSION = "0.7.0";
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
  "Actions": "Actions",
  "Advanced": "Avancé",
  "All Notes": "Toutes les notes",
  "Appearance": "Apparence",
  "Ask the folder": "Demander au dossier",
  "Ask the folder: “{question}”": "Demander au dossier : « {question} »",
  "Ask the note": "Demander à la note",
  "Audio": "Audio",
  "Automations": "Automatisations",
  "Backspace": "Retour arrière",
  "Begin listening": "Commencer l'écoute",
  "Cancel": "Annuler",
  "Capture meeting chat in the note": "Capturer le chat de la réunion dans la note",
  "Captured right now:": "Capturé en ce moment :",
  "Choose": "Choisir",
  "Choose the microphone that captures your voice.": "Choisissez le microphone qui capture votre voix.",
  "Choose the output whose sound Syntheo transcribes: the one where you hear the other participants.": "Choisissez la sortie dont Syntheo transcrit le son : celle où vous entendez les autres participants.",
  "Close": "Fermer",
  "Computer audio": "Son de l'ordinateur",
  "Contacts": "Contacts",
  "Control listening without reopening Syntheo.": "Contrôler l'écoute sans rouvrir Syntheo.",
  "Copy": "Copier",
  "Current default": "Valeur par défaut actuelle",
  "Current default output": "Sortie par défaut actuelle",
  "Developers": "Développeurs",
  "Dictation": "Dictée",
  "Dictionary": "Dictionnaire",
  "Enter": "Entrée",
  "Esc": "Échap",
  "Export": "Exporter",
  "Finish": "Terminer",
  "Folder": "Dossier",
  "Folders": "Dossiers",
  "Go to": "Aller à",
  "In this folder": "Dans ce dossier",
  "Leave the folder": "Sortir du dossier",
  "Listen": "Écouter",
  "Listening": "Écoute",
  "Listening time": "Durée d'écoute",
  "Me": "Moi",
  "Meetings": "Réunions",
  "Mic": "Micro",
  "Microphone": "Microphone",
  "Mute system audio": "Couper le son système",
  "Mute the microphone": "Couper le micro",
  "My meetings": "Mes réunions",
  "My servers": "Mes serveurs",
  "New note in this folder": "Nouvelle note dans ce dossier",
  "No notes in this folder match.": "Aucune note de ce dossier ne correspond.",
  "No results found.": "Aucun résultat trouvé.",
  "Note capsule": "Capsule de la note",
  "Note steps": "Étapes de la note",
  "Notes": "Notes",
  "Notifications": "Notifications",
  "Open": "Ouvrir",
  "Participants": "Participants",
  "Pause listening": "Mettre en pause l'écoute",
  "Paused": "En pause",
  "Permissions": "Autorisations",
  "Post recording disclosure in meeting chat": "Publier la mention d'enregistrement dans le chat de la réunion",
  "Prepare": "Préparer",
  "Privacy": "Confidentialité",
  "Profile": "Profil",
  "Put on pause": "Mettre en pause",
  "Recent": "Récent",
  "Remind participants about recording": "Rappeler aux participants l'enregistrement",
  "Remove the {name} folder filter": "Retirer le filtre du dossier {name}",
  "Resume listening": "Reprendre l'écoute",
  "Save visible chat from supported meetings using Accessibility.": "Enregistrer la discussion visible des réunions prises en charge à l'aide de l'accessibilité.",
  "Search in this folder...": "Rechercher dans ce dossier...",
  "Search notes and pages...": "Rechercher des notes et des pages...",
  "Search settings": "Rechercher un paramètre",
  "Server status": "État des serveurs",
  "Settings": "Paramètres",
  "Shift": "Maj",
  "Show a reminder when a recording starts.": "Affichez un rappel lorsqu'un enregistrement commence.",
  "Show floating bar": "Afficher la barre flottante",
  "Stop listening when your call ends.": "Arrêter l'écoute lorsque votre appel se termine.",
  "Stop when meeting ends": "Arrêter à la fin de la réunion",
  "Synthesis": "Synthèse",
  "Synthesis · connected": "Synthèse · connectée",
  "System sound": "Son système",
  "Tab: search inside": "Tab : chercher dedans",
  "Tell participants when listening starts; this does not confirm consent.": "Indiquez aux participants quand l'écoute commence ; cela ne confirme pas le consentement.",
  "Templates": "Modèles",
  "The microphone and system audio are muted: nothing is being transcribed.": "Le micro et le son système sont coupés : plus rien n'est transcrit.",
  "Transcription": "Transcription",
  "Transcription · connected": "Transcription · connectée",
  "Type": "Type",
  "Unmute system audio": "Rétablir le son système",
  "Unmute the microphone": "Rétablir le micro",
  "Write freely, Syntheo will complete it.": "Écrivez librement, Syntheo complétera.",
  "Writing": "Écrire",
  "{count, plural, one {# meeting} other {# meetings}}": "{count, plural, one {# réunion} other {# réunions}}"
};
const SYN_ICONS = {
  "Bell": "<path d=\"M16 18C16 20.2091 14.2091 22 12 22C9.79086 22 8 20.2091 8 18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M4.43654 18H19.5625C20.2903 18 20.6542 18 20.8648 17.8951C21.274 17.6913 21.4929 17.2359 21.3964 16.789C21.3468 16.559 21.1194 16.2749 20.6648 15.7066L20.4951 15.4944C20.0392 14.9246 19.8113 14.6397 19.6184 14.3409C19.0187 13.4119 18.6477 12.354 18.5356 11.254C18.4995 10.9002 18.4995 10.5353 18.4995 9.8056V8.5C18.4995 8.03572 18.4995 7.80358 18.4867 7.60758C18.2898 4.60304 15.8965 2.20977 12.892 2.01285C12.696 2 12.4638 2 11.9995 2C11.5353 2 11.3031 2 11.1071 2.01285C8.10258 2.20977 5.70931 4.60304 5.51239 7.60758C5.49954 7.80358 5.49954 8.03572 5.49954 8.5V9.8056C5.49954 10.5353 5.49954 10.9002 5.46349 11.254C5.35143 12.354 4.98035 13.4119 4.38067 14.3409C4.18779 14.6397 3.95985 14.9246 3.50401 15.4944L3.33427 15.7066C2.87964 16.2749 2.65233 16.559 2.60268 16.789C2.50621 17.2359 2.72509 17.6913 3.13431 17.8951C3.3449 18 3.70878 18 4.43654 18Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/>",
  "BookOpen": "<path d=\"M7.99978 3.5H6.60021C4.43183 3.5 3.34764 3.5 2.67399 4.17362C2.00034 4.84724 2.00029 5.93144 2.00021 8.09982L2 13.3998C1.99992 15.5684 1.99987 16.6526 2.67353 17.3263C3.34719 18 4.43146 18 6.6 18H8.95042C10.4329 18 11.7092 19.0464 11.9999 20.5V5.5C11.0556 4.24097 9.99989 3.5 7.99978 3.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M16.0001 3.5H17.3997C19.5681 3.5 20.6523 3.5 21.3259 4.17362C21.9996 4.84724 21.9996 5.93144 21.9997 8.09982L21.9999 13.3998C22 15.5684 22 16.6526 21.3264 17.3263C20.6527 18 19.5684 18 17.3999 18H15.0495C13.567 18 12.2907 19.0464 12 20.5V5.5C12.9443 4.24097 14 3.5 16.0001 3.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "CaretDown": "<path d=\"M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "CaretRight": "<path d=\"M9.00005 6C9.00005 6 15 10.4189 15 12C15 13.5812 9 18 9 18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
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

const synCssParts = () => [SYN_CSS_NOTE, SYN_CSS_SETTINGS, SYN_CSS_MEETINGS, SYN_CSS_PALETTE];

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

// Paramètres › Transcription et Synthèse (À COMPLÉTER) : apps/desktop/src/settings/ai/.

const SynSectionTranscription = () => h(SynSettingsTitle, { title: L("Transcription") });

const SynSectionIntelligence = () => h(SynSettingsTitle, { title: L("Synthesis") });

// Paramètres › Profil (À COMPLÉTER) : apps/desktop/src/settings/general/.

const SynSectionApp = () => h(SynSettingsTitle, { title: L("Profile") });

// Paramètres › Dictée (À COMPLÉTER) : apps/desktop/src/settings/dictation.tsx.

const SynSectionDictation = () => h(SynSettingsTitle, { title: L("Dictation") });

// Paramètres › Confidentialité et Autorisations (À COMPLÉTER) : apps/desktop/src/settings/privacy/, settings/general/permissions.tsx.

const SynSectionPrivacy = () => h(SynSettingsTitle, { title: L("Privacy") });

const SynSectionPermissions = () => h(SynSettingsTitle, { title: L("Permissions") });

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
