# Étude UX : navigation pour un utilisateur Windows non technique

Étude de l'epic 316 (issue 371), à lire avant de coder les issues 372 (raccourcis), 373 (recherche de paramètres), 374 (`Ctrl+P`) et 376 (`tauri-plugin-prevent-default`). Elle s'appuie sur le code de `feat/0.6.0` ; chaque constat cite son fichier. Les recommandations sont tranchées ; les points à arbitrer sont regroupés à la fin.

Chemins relatifs à `apps/desktop/src/` sauf mention contraire.

## 1. Persona et tâches clés

**Mme Martin, 48 ans, chargée de mission dans une administration.** PC Windows 11 fourni par la DSI, clavier AZERTY, écran portable de 14 pouces souvent relié à un second écran. Elle vit dans Outlook, Word et Teams. Elle règle son PC dans les Paramètres Windows, en tapant dans « Rechercher un paramètre ». Elle ne connaît pas les palettes de commandes ni le mot « raccourci global ».

Ce qu'elle attend :

- **Des boutons visibles** avec un libellé qui dit ce qui se passe. Pas de geste caché, pas d'icône seule.
- **Les raccourcis de Word** : `Ctrl+N`, `Ctrl+P`, `Ctrl+F`, `Ctrl+H`, `Ctrl+S`, `F1`, `Échap`. Si elle tape `Ctrl+S` par réflexe, elle veut être rassurée, pas ignorée.
- **Le clavier seul quand elle prend des notes en réunion** : `Tab`, `Maj+Tab`, `Entrée`, `Échap`, flèches.
- **Un vocabulaire du quotidien** : elle cherche « micro », « langue », « thème sombre », pas « STT » ni « Permissions ».
- **Rien qui parte sur Internet** sans qu'elle le sache.

| Tâche        | Ce qu'elle fait                                              | Moment critique                                                    |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| **Préparer** | Ouvre la réunion de l'agenda, vérifie titre et participants  | 2 minutes avant la réunion : il faut que ce soit immédiat          |
| **Écouter**  | Lance l'écoute, prend quelques notes, termine                | Pendant la réunion : aucune fausse manœuvre (arrêt, fermeture)     |
| **Relire**   | Parcourt la synthèse, cherche un nom, corrige un mot         | Après la réunion : naviguer entre notes, synthèse et transcription |
| **Exporter** | Envoie le compte-rendu en PDF ou l'imprime pour un parapheur | Réflexe `Ctrl+P` de Word                                           |
| **Régler**   | Change le micro, la langue, le thème, le dossier d'export    | Rare : elle ne se souvient pas où est le réglage, elle le cherche  |

## 2. Inventaire des chemins de navigation actuels

### 2.1 Structure

- **Fenêtres (routes TanStack)** : `routes/app/main/` (fenêtre principale), `routes/app/note.$sessionId.tsx` (note dans une fenêtre autonome, sans les raccourcis globaux), `onboarding.tsx`, `floating-bar.tsx`, `live-caption.tsx`, `composer.tsx`, `instruction.tsx`.
- **Écrans de la fenêtre principale** : un seul onglet visible à la fois (`store/zustand/tabs/schema.ts`) : accueil (`empty`), note (`sessions`), paramètres (`settings`, 13 pages `SettingsTab`), modèles, calendrier, contacts, dossiers, automatisations, journal des changements. Plus de barre latérale permanente (`main/body.tsx`) ; les vues à sous-pages portent leur propre navigation (`main/view-navigation.tsx`).

### 2.2 Points d'entrée visibles

| Où                                                                                   | Ce qu'on y trouve                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Barre de titre Windows** (`main/windows-title-bar.tsx`)                            | Bouton « Accueil » (infobulle « Accueil · Échap »), menus **Fichier** (Nouvelle note `Ctrl+N`, Rechercher une note… `Ctrl+K`, Paramètres `Ctrl+,`, Fermer `Alt+F4`), **Modifier** (annuler, rétablir, couper, copier, coller, tout sélectionner), **Afficher** (Plein écran `F11`), **Aide** (Documentation, Signaler un bug, Suggérer une fonctionnalité) |
| **Accueil** (`home/home-view.tsx`, `home/start-button.tsx`, `home/home-capsule.tsx`) | « Démarrer une réunion » (`Ctrl N` affiché), liste « Reprendre », capsule « Rechercher une note » (`Ctrl K` affiché)                                                                                                                                                                                                                                       |
| **Capsule de note** (`session/components/capsule/index.tsx`)                         | Préparer : « Annuler », « Commencer l'écoute » (`Ctrl ⇧ N`). Écouter : durée, niveau, « Terminer ». Synthèse : « Copier », « Exporter », « Demander à la note » (`Ctrl J`)                                                                                                                                                                                 |
| **Menu ⋯ de la note** (`session/components/outer-header/overflow/index.tsx`)         | Infos de la réunion, Historique des versions, Importer un audio ou une transcription, **Exporter**, Ouvrir dans une nouvelle fenêtre, Panneau flottant                                                                                                                                                                                                     |
| **Palette `Ctrl+K`** (`shared/open-note-dialog.tsx`)                                 | Nouvelle note, « Aller à » (les **pages** de paramètres et les vues), dossiers, notes récentes, autres notes                                                                                                                                                                                                                                               |
| **Paramètres** (`sidebar/settings.tsx`, `sidebar/settings-nav-groups.ts`)            | Champ « Rechercher des paramètres... », groupes Moi, Mes serveurs, Écrire, Mes réunions, Avancé (replié)                                                                                                                                                                                                                                                   |
| **Fenêtre d'export** (`session/components/outer-header/overflow/export-modal.tsx`)   | Formats PDF, TXT, MD, ORG ; cases Mémo, Synthèse, Transcription ; enregistre dans le dossier d'export (Téléchargements par défaut) puis ouvre l'Explorateur sur le fichier. Pas d'impression                                                                                                                                                               |
| **Zone de notification** (`plugins/tray/src/menu_items/`)                            | Démarrer une réunion, Paramètres, Masquer, Quitter… Libellés **en anglais** (« Start a new meeting », « Settings », « Quit ») : hors périmètre, à corriger à part                                                                                                                                                                                          |

### 2.3 Raccourcis déjà en place

Tous passent par `react-hotkeys-hook` 4.6.2 (`mod` = `Ctrl` sous Windows), sauf `Échap` global (écouteur `keydown` en capture) et le raccourci global de dictée.

| Raccourci                   | Action                                                                     | Fichier                                                                         |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `Ctrl+N`                    | Nouvelle note (nouveau chat si le champ du chat a le focus)                | `shared/useMainShortcuts.tsx`                                                   |
| `Ctrl+Maj+N`                | Commencer l'écoute de la note en préparation, sinon nouvelle note + écoute | `shared/useMainShortcuts.tsx`, `session/components/capsule/session-capsule.tsx` |
| `Alt+←`                     | Retour (ou accueil)                                                        | `shared/useMainShortcuts.tsx`                                                   |
| `Échap`                     | Ferme le chat, sinon quitte la vue courante vers l'accueil                 | `shared/useMainShortcuts.tsx`, `shared/leave-overlay-tab.ts`                    |
| `Ctrl+K`                    | Palette « Rechercher une note »                                            | `shared/open-note-dialog.tsx`                                                   |
| `Ctrl+,`                    | Paramètres                                                                 | `contexts/shell/settings.ts`                                                    |
| `Ctrl+J`                    | Ouvre ou ferme le chat (« Demander à la note »)                            | `chat/state/use-chat-mode.ts`                                                   |
| `Ctrl+F`                    | Rechercher dans la note (bascule : un second appui **ferme** la barre)     | `session/components/note-input/search/context.tsx`                              |
| `Ctrl+H`                    | Rechercher et remplacer                                                    | idem                                                                            |
| `Ctrl+F`                    | Contacts : focus sur le champ de recherche                                 | `sidebar/contacts.tsx`                                                          |
| `Ctrl+Alt+←` / `Ctrl+Alt+→` | Vue précédente / suivante de la note (notes, synthèse, transcription)      | `session/components/note-input/index.tsx`                                       |
| `Ctrl+Maj+↑` / `Ctrl+Maj+↓` | Étendre la sélection dans la transcription                                 | `session/components/note-input/transcript/renderer/index.tsx`                   |
| `Ctrl+S`, `Échap`           | Sortir de l'édition de la transcription (seulement dans ce mode)           | `session/index.tsx`                                                             |
| `Ctrl+Entrée`               | Valider un segment de transcription                                        | `session/components/note-input/transcript/renderer/segment.tsx`                 |
| `Ctrl+Alt+Espace` (défaut)  | Dictée, raccourci **global** Windows, réglable, Pro                        | `settings/schema.ts`, `plugins/shortcut/src/global.rs`                          |
| `Échap`                     | Ferme une fenêtre de note autonome                                         | `routes/app/note.$sessionId.tsx`                                                |

### 2.4 Ce qui coince aujourd'hui

1. **`Maj+Tab` ne fonctionne pas dans la version publiée.** `tauri_plugin_prevent_default::init()` (`src-tauri/src/lib.rs`, hors debug) active tous les drapeaux, dont `FOCUS_MOVE`, qui annule `Maj+Tab` (`assets/script.js` du plugin 4.0.4). On ne peut pas revenir au champ précédent au clavier. C'est le défaut le plus grave pour ce persona.
2. **Clic droit désactivé partout** (drapeau `CONTEXT_MENU`), y compris dans l'éditeur, où Mme Martin cherche « Copier / Coller ». Les menus contextuels propres à l'app (`header-*.tsx`, transcription, contacts) restent.
3. **`Ctrl+,` est cassé sur AZERTY.** `react-hotkeys-hook` 4.6.2 compare soit `event.key`, soit `event.code` (`mapKey` du module). `"mod+,"` devient `comma`, qui ne correspond qu'au **code** physique `Comma`. Sur AZERTY, la touche « , » a le code `KeyM` ; c'est `Ctrl+;` qui ouvre les paramètres. Même piège pour toute lettre déplacée en AZERTY : un `mod+q` se déclencherait sur `Ctrl+A`, un `mod+w` sur `Ctrl+Z`.
4. **`F11` est affiché dans le menu Afficher, mais aucun raccourci ne l'écoute** (`main/windows-title-bar.tsx` ne fait que le bouton).
5. **La recherche des paramètres ne trouve que les noms de pages**, sans tolérance aux accents (`toLowerCase().includes`, `sidebar/settings.tsx` et `filterPageResults` de la palette). « micro », « sombre », « langue » ou « parametres » ne donnent rien ou pas le bon écran.
6. **Exporter n'existe que dans la capsule (étape Synthèse) et le menu ⋯.** Rien dans le menu Fichier, pas de `Ctrl+P`, pas d'impression. Le drapeau `PRINT` du plugin bloque `Ctrl+P` : la touche ne fait rien.
7. **Notations mélangées** : « Ctrl+N » (menus), « Ctrl N » et « Ctrl ⇧ N » (capsules), « Accueil · Échap » (infobulle). Sous Windows en français, on écrit « Ctrl+Maj+N ».
8. **`Ctrl+Alt+←/→` peut tourner l'écran** sur les PC à pilote graphique Intel (raccourci de rotation d'écran, encore actif sur des parcs d'administration). `Ctrl+Alt` est aussi `AltGr` sur AZERTY.
9. **`Ctrl+S` ne fait rien hors édition de transcription.** L'enregistrement est automatique, mais rien ne le dit.

## 3. Carte des raccourcis

### 3.1 Règles

1. **Windows d'abord, Word ensuite.** Un raccourci de l'app reprend le sens qu'il a dans Word ou l'Explorateur, ou il n'existe pas.
2. **Jamais `Ctrl+Alt+lettre ou chiffre`** : c'est `AltGr` sur AZERTY (@, €, #, {, [).
3. **Jamais une lettre que l'AZERTY déplace** (A, Q, Z, W, M) ni une ponctuation, sauf à comparer `event.key` (voir 3.4).
4. **Pas de raccourci pour une action risquée** : arrêter l'écoute, supprimer, quitter. Bouton seulement.
5. **Ne rien intercepter de ce que Windows garde** : `Alt+F4`, `Alt+Tab`, `Alt+Espace`, `Ctrl+Échap`, `Ctrl+Maj+Échap`, `Win+…` (dont `Win+H`, la dictée Windows), `Impr. écran`.
6. **Chaque raccourci a un bouton ou une entrée de menu** qui l'affiche. Aucun raccourci n'est le seul chemin.

### 3.2 Comportement de WebView2 et du plugin

Dans la version publiée, deux couches existent avant l'app : WebView2 (moteur Edge) et le script de `tauri-plugin-prevent-default`, qui appelle `preventDefault()` sur une liste fixe de touches. Les écouteurs de l'app reçoivent quand même l'événement : le plugin n'arrête pas la propagation. En développement, le plugin est absent : seul le `preventDefault: true` de l'app protège de WebView2. **Tout raccourci de l'app doit donc garder `preventDefault: true` et être enregistré en permanence** (pas seulement quand l'écran concerné est monté), sinon WebView2 reprend la main en dev.

« À vérifier » signifie : comportement WebView2 non confirmé par le code, à tester sur Windows avant de livrer.

### 3.3 Tableau

| Raccourci                                    | Windows / WebView2 par défaut                                          | Plugin 4.0.4 (publié)                                              | Proposition                                                                                                                               | Statut            |
| -------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `Ctrl+N`                                     | Aucun effet connu dans WebView2                                        | —                                                                  | Nouvelle note                                                                                                                             | Existe, garder    |
| `Ctrl+Maj+N`                                 | Aucun effet (InPrivate n'existe pas dans WebView2)                     | —                                                                  | Commencer l'écoute                                                                                                                        | Existe, garder    |
| `Ctrl+K`                                     | Aucun effet dans WebView2                                              | —                                                                  | Rechercher (notes, pages, **paramètres**)                                                                                                 | Existe, étendre   |
| `Ctrl+Maj+P`                                 | Impression par la boîte de dialogue système (Chromium)                 | Bloqué (`PRINT`)                                                   | **Rechercher un paramètre** (palette filtrée)                                                                                             | Nouveau (373)     |
| `Ctrl+P`                                     | Aperçu avant impression de la page web entière                         | Bloqué (`PRINT`)                                                   | **Exporter ou imprimer la note**                                                                                                          | Nouveau (374)     |
| `Ctrl+,`                                     | Aucun effet                                                            | —                                                                  | Paramètres, **corriger pour AZERTY**                                                                                                      | Existe, corriger  |
| `Ctrl+F`                                     | Barre de recherche de WebView2                                         | Bloqué (`FIND`)                                                    | Rechercher dans la note ; dans Paramètres et Contacts, focus sur leur champ. Un second appui **resélectionne** le texte au lieu de fermer | Existe, ajuster   |
| `Ctrl+H`                                     | Aucun effet                                                            | —                                                                  | Remplacer (comme Word)                                                                                                                    | Existe, garder    |
| `F3` / `Maj+F3`                              | Occurrence suivante de la recherche WebView2                           | `F3` bloqué (`FIND`)                                               | Occurrence suivante / précédente quand la barre de recherche est ouverte                                                                  | Nouveau, petit    |
| `Ctrl+G`, `Ctrl+Maj+G`                       | Occurrence suivante / précédente                                       | Bloqués (`FIND`)                                                   | Rien                                                                                                                                      | Ne pas utiliser   |
| `F1`                                         | Aucun effet dans WebView2 (à vérifier)                                 | —                                                                  | **Aide et raccourcis** (fenêtre locale)                                                                                                   | Nouveau (372)     |
| `F11`                                        | Aucun effet dans WebView2 (à vérifier)                                 | —                                                                  | Plein écran, comme le menu l'annonce déjà                                                                                                 | Nouveau (372)     |
| `Ctrl+S`                                     | « Enregistrer sous » de la page (à vérifier selon la version WebView2) | —                                                                  | Hors édition de transcription : message « Vos notes sont enregistrées automatiquement. »                                                  | Nouveau (372)     |
| `Échap`                                      | Quitte le plein écran                                                  | —                                                                  | Fermer la fenêtre ou le panneau ouvert, sinon retour à l'accueil                                                                          | Existe, garder    |
| `Alt+←`                                      | Page précédente                                                        | —                                                                  | Retour                                                                                                                                    | Existe, garder    |
| `Alt+→`                                      | Page suivante                                                          | —                                                                  | Rien (pas d'historique avant) ; l'app doit l'annuler pour éviter une navigation WebView2                                                  | Neutraliser       |
| `Ctrl+Alt+←/→`                               | Rotation d'écran sur certains pilotes Intel ; `AltGr+flèche`           | —                                                                  | Garder, mais ajouter **`Ctrl+Pg.Préc` / `Ctrl+Pg.Suiv`** (feuilles Excel, onglets) comme raccourci affiché                                | Existe, compléter |
| `Ctrl+J`                                     | Téléchargements                                                        | Bloqué (`DOWNLOADS`)                                               | Demander à la note                                                                                                                        | Existe, garder    |
| `F10`                                        | Active la barre de menus des applications Windows                      | —                                                                  | Focus sur le menu « Fichier » de la barre de titre                                                                                        | Nouveau, petit    |
| `Ctrl+O`                                     | Ouvrir un fichier                                                      | Bloqué (`OPEN`)                                                    | Rien en 0.6.0 (voir points ouverts)                                                                                                       | Réservé           |
| `F5`, `Ctrl+R`, `Ctrl+Maj+R`, `Ctrl+F5`      | Recharger la page : perte de l'état en cours                           | Bloqués (`RELOAD`)                                                 | Rien, jamais                                                                                                                              | Bloquer           |
| `Ctrl+W`, `Ctrl+F4`                          | Aucun effet dans WebView2 (pas d'onglets)                              | —                                                                  | Rien : risque de confusion avec fermer l'app, et `mod+w` = `Ctrl+Z` en AZERTY                                                             | Ne pas utiliser   |
| `Ctrl+Q`                                     | Aucun effet                                                            | —                                                                  | Rien : `mod+q` = `Ctrl+A` en AZERTY                                                                                                       | Ne pas utiliser   |
| `Ctrl+/`                                     | Aucun effet                                                            | —                                                                  | Rien : sur AZERTY c'est `Ctrl+Maj+:`, et `react-hotkeys-hook` le refuse (Maj inattendu)                                                   | Ne pas utiliser   |
| `Alt+F4`                                     | Ferme la fenêtre (Windows, non interceptable de façon fiable)          | —                                                                  | Comportement natif ; le menu Fichier l'affiche déjà                                                                                       | Laisser Windows   |
| `Ctrl+molette`, `Ctrl++`, `Ctrl+-`, `Ctrl+0` | Zoom de WebView2                                                       | —                                                                  | Garder le zoom natif (utile à la lecture) ; l'indiquer dans l'aide                                                                        | Laisser WebView2  |
| `Maj+Tab`                                    | Champ précédent                                                        | **Bloqué (`FOCUS_MOVE`)**                                          | Comportement natif obligatoire                                                                                                            | Débloquer (376)   |
| `F7`                                         | Navigation au curseur                                                  | Bloqué (`CARET_BROWSING`)                                          | Rien                                                                                                                                      | Bloquer           |
| `Ctrl+U`, `Ctrl+Maj+I`, `F12`                | Source, outils de développement                                        | `Ctrl+U`, `Ctrl+Maj+I` bloqués ; outils désactivés hors `devtools` | Rien                                                                                                                                      | Bloquer           |
| Clic droit                                   | Menu contextuel WebView2 (copier, coller…)                             | **Bloqué (`CONTEXT_MENU`)**                                        | Voir points ouverts                                                                                                                       | À trancher        |
| `Ctrl+Alt+Espace`                            | —                                                                      | —                                                                  | Réservé à la dictée globale : aucun raccourci de l'app ne doit le reprendre                                                               | Réservé           |

### 3.4 Règles d'implémentation (pour 372)

- **Ponctuation et lettres déplacées : comparer `event.key`.** Pour `Ctrl+,`, écouter `"mod+comma, mod+m"` et ne déclencher que si `event.key === ","` (sur AZERTY, la touche « , » a le code `KeyM`). Mettre ce test dans un petit utilitaire partagé, testé avec des événements AZERTY et QWERTY. Monter `react-hotkeys-hook` en v5 (option `useKey`) est une alternative ; ce n'est pas une nouvelle dépendance, mais c'est un chantier à part.
- **Enregistrer tous les raccourcis globaux dans `shared/useMainShortcuts.tsx`**, avec `preventDefault: true`, `enableOnFormTags` et `enableOnContentEditable`. L'écran concerné s'y abonne, comme `startPreparedNoteFromShortcut` le fait déjà (`session/components/capsule/start-shortcut.ts`). Les fenêtres de note autonomes (`routes/app/note.$sessionId.tsx`) déclarent les leurs, comme `session-capsule.tsx` pour `Ctrl+Maj+N`.
- **Une seule table des raccourcis** (par exemple `shared/shortcuts.ts` : identifiant, touches, libellé Lingui, contexte). Menus, infobulles, `aria-keyshortcuts`, puces `kbd` et l'aide `F1` la lisent. On ne recopie plus « Ctrl+N » à la main.
- **Notation Windows partout** : `Ctrl+Maj+N`, `Ctrl+Pg.Suiv`, `Échap`, `Entrée`. Puces de la capsule : `Ctrl Maj N`. Les symboles ⌘ ⇧ ⌥ seulement sur macOS.
- **Infobulle = libellé + raccourci entre parenthèses**, comme Office : « Exporter (Ctrl+P) », « Accueil (Échap) ». Remplace « Accueil · Échap ».

## 4. Raccourcis retenus pour la 0.6.0

Les ajouts et corrections, pas plus. Le reste existe et ne change pas.

| Raccourci                       | Action                                                   | Où il s'affiche                                                   | Issue |
| ------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- | ----- |
| `Ctrl+P`                        | Exporter ou imprimer la note                             | Menu Fichier « Exporter… », bouton Exporter de la capsule, menu ⋯ | 374   |
| `Ctrl+Maj+P`                    | Rechercher un paramètre                                  | Menu Fichier « Rechercher un paramètre… », champ des Paramètres   | 373   |
| `F1`                            | Aide et raccourcis                                       | Menu Aide « Aide et raccourcis »                                  | 372   |
| `F11`                           | Plein écran                                              | Menu Afficher (déjà affiché)                                      | 372   |
| `Ctrl+,`                        | Paramètres, corrigé pour AZERTY                          | Menu Fichier (déjà affiché)                                       | 372   |
| `Ctrl+S`                        | Message « Vos notes sont enregistrées automatiquement. » | Aide F1                                                           | 372   |
| `Ctrl+Pg.Préc` / `Ctrl+Pg.Suiv` | Vue précédente / suivante de la note                     | Infobulles des onglets Notes, Synthèse, Transcription             | 372   |
| `F3` / `Maj+F3`                 | Occurrence suivante / précédente                         | Infobulles des flèches de la barre de recherche                   | 372   |
| `F10`                           | Aller au menu Fichier                                    | Aide F1                                                           | 372   |
| `Maj+Tab`                       | Champ précédent (rétabli)                                | —                                                                 | 376   |

**`Ctrl+F` change légèrement** : il ouvre la barre et sélectionne son texte, il ne la ferme plus ; `Échap` la ferme. Comme dans Word.

## 5. Recherche de paramètres (373)

### 5.1 Principe

Une seule recherche, trois portes d'entrée, un seul index :

1. **`Ctrl+K`** : la palette existante cherche aussi dans les paramètres, en plus des notes.
2. **`Ctrl+Maj+P`** et le menu Fichier « Rechercher un paramètre… » : la même palette, filtrée sur les paramètres.
3. **Le champ en haut de l'écran Paramètres**, comme dans les Paramètres Windows : même index, résultats dans la colonne.

### 5.2 L'index

Un fichier unique, par exemple `settings/search-index.ts`, qui liste **chaque réglage**, pas seulement chaque page :

| Champ         | Exemple                                                   |
| ------------- | --------------------------------------------------------- |
| `id`          | `main-language`                                           |
| `page`        | `app` (une valeur de `SettingsTab`) ou une destination    |
| `label`       | « Langue principale » (message Lingui, celui de la ligne) |
| `section`     | « Langue et région »                                      |
| `keywords`    | « langue, français, anglais, traduction »                 |
| `requiresPro` | `false`                                                   |

- Les **mots-clés** sont les mots de Mme Martin : « micro » pour Réunions › Audio, « sombre, clair, couleur » pour Apparence, « démarrage, allumer le PC » pour « Démarrer Syntheo à la connexion », « Téléchargements, PDF » pour le dossier d'export.
- **Comparaison** : minuscules, accents retirés (`normalize("NFD")` puis suppression des diacritiques), chaque mot tapé doit apparaître dans le libellé, la section, la page ou les mots-clés. Pas de recherche floue : elle surprend plus qu'elle n'aide.
- **Ordre** : libellé qui commence par le texte tapé, puis libellé qui le contient, puis section ou mots-clés.
- **Arrivée** : `Entrée` ouvre la page, fait défiler jusqu'à la ligne, la surligne 2 secondes avec le fond `accent`, et donne le focus à son réglage. Chaque `SettingRow` reçoit un attribut `data-setting-id`.
- **Pro** : le réglage reste trouvable, avec le cadenas de la navigation actuelle.
- Un test vérifie que chaque `id` de l'index existe bien dans une page (pas de résultat qui mène nulle part).

### 5.3 Maquette : palette `Ctrl+Maj+P`

La palette existante (fond `popover`, ligne sélectionnée `accent`). Une étiquette « Paramètres » dans le champ indique le filtre ; « × » ou `Retour arrière` dans un champ vide la retire et montre toute la palette.

```
┌────────────────────────────────────────────────────────────┐
│ ⌕ [ Paramètres × ] micro▌                                  │
├────────────────────────────────────────────────────────────┤
│  PARAMÈTRES                                                │
│ ▌ Microphone                 Réunions › Audio      Entrée  │
│   Détection du microphone    Notifications                 │
│   Microphone                 Avancé › Permissions          │
│   Dictée                     Écrire › Dictée       Pro     │
├────────────────────────────────────────────────────────────┤
│  ↑↓ Choisir    Entrée Ouvrir    Échap Fermer               │
└────────────────────────────────────────────────────────────┘
```

Sans filtre (`Ctrl+K`, texte « langue ») : le groupe « Paramètres » arrive après « Aller à » et avant les notes, limité à 5 résultats, avec une ligne « Voir les 8 paramètres » qui active le filtre.

```
┌────────────────────────────────────────────────────────────┐
│ ⌕ langue▌                                                  │
├────────────────────────────────────────────────────────────┤
│  PARAMÈTRES                                                │
│ ▌ Langue principale          Profil › Langue et région     │
│   Langues parlées            Profil › Langue et région     │
│   Langue pour les synthèses  Profil › Langue et région     │
│   Langue et vocabulaire      Écrire › Dictée               │
│   Voir les 8 paramètres                                    │
│  NOTES                                                     │
│   Point mensuel langues étrangères           12 sept.      │
└────────────────────────────────────────────────────────────┘
```

Aucun résultat :

```
┌────────────────────────────────────────────────────────────┐
│ ⌕ micor▌                                                   │
├────────────────────────────────────────────────────────────┤
│  Aucun paramètre ne correspond à « micor ».                │
│  Vérifiez l'orthographe, ou essayez un mot plus court.     │
└────────────────────────────────────────────────────────────┘
```

### 5.4 Maquette : champ de l'écran Paramètres

Le libellé devient « Rechercher un paramètre » (mot de Windows), sans points de suspension. Quand on tape, la liste des résultats remplace les groupes de la colonne ; `↓` y entre, `Entrée` ouvre. `Ctrl+F` sur l'écran Paramètres place le curseur dans ce champ.

```
┌──────────────────────────┬─────────────────────────────────────────┐
│ ⌕ sombre▌            ×   │  Apparence                              │
│                          │                                         │
│  2 résultats             │  Thème                                  │
│ ▌ Thème                  │ ┌─────────────────────────────────────┐ │
│   Apparence              │ │ ○ Clair   ● Sombre   ○ Système      │ │ ← surligné 2 s
│   Palette                │ └─────────────────────────────────────┘ │
│   Apparence              │  Palette                                │
│                          │  Thé vert · Glycine · Laque et encre    │
│                          │                                         │
│ ● Serveurs locaux : OK   │                                         │
└──────────────────────────┴─────────────────────────────────────────┘
```

Pas de kanji ni de décor dans la recherche : c'est un outil. Le clin d'œil reste dans le sélecteur de palette, déjà prévu.

## 6. `Ctrl+P` : exporter ou imprimer (374)

**Décision : `Ctrl+P` ouvre la fenêtre d'export existante, qui gagne un bouton « Imprimer… ».** On ne fait pas `window.print()` : WebView2 imprimerait toute l'interface (capsule, barre de titre), pas le compte-rendu.

- **Titre** : « Exporter ou imprimer ». Format PDF présélectionné (c'est déjà le défaut).
- **Deux boutons** : « Enregistrer » (principal, `Entrée`) garde le comportement actuel : fichier dans le dossier d'export, puis l'Explorateur s'ouvre dessus. « Imprimer… » crée le même PDF (commande `export` déjà utilisée) dans un dossier temporaire, puis l'ouvre dans le lecteur PDF de Windows (Edge, le plus souvent). Une ligne l'annonce : « Le PDF s'ouvre dans votre lecteur. Choisissez Imprimer. »
- **Le dossier d'enregistrement est écrit** sous les boutons (« Enregistré dans Téléchargements »), pour qu'elle sache où chercher.
- **Selon l'étape** :
  - Préparer et Synthèse : `Ctrl+P` ouvre la fenêtre.
  - Écouter : message « Terminez l'écoute pour exporter la note. » Exporter une transcription en cours prête à confusion.
  - Hors d'une note (accueil, paramètres) : message « Ouvrez une note pour l'exporter. »
- **Affichage** : « Exporter… Ctrl+P » dans le menu Fichier (grisé hors note), infobulle « Exporter (Ctrl+P) » sur le bouton de la capsule et l'entrée du menu ⋯.
- **Branchement** : raccourci global dans `shared/useMainShortcuts.tsx` (toujours `preventDefault`, pour couvrir le dev sans plugin) ; la note active s'abonne via un registre du même modèle que `registerPreparedNoteStart`, et `session-capsule.tsx` appelle son `openExport` existant. Fenêtre autonome : même raccourci déclaré localement.

## 7. Aide `F1`

`F1` ouvre une fenêtre locale « Aide et raccourcis », qui fonctionne sans réseau :

- Les raccourcis rangés par tâche : Préparer, Écouter, Relire, Exporter, Régler, Se déplacer. Générés depuis la table unique de 3.4.
- Une ligne « Vos notes sont enregistrées automatiquement. »
- Un bouton « Ouvrir la documentation en ligne », qui annonce qu'il ouvre le navigateur (`shared/documentation.ts`).
- Accessible aussi par le menu Aide et la palette (« Raccourcis clavier »).

On n'utilise pas `Ctrl+/` (voir 3.3).

## 8. Ce que chaque issue doit en tirer

### Issue 372 (raccourcis)

- Ajouter `F1`, `F11`, `Ctrl+S` (message), `Ctrl+Pg.Préc/Suiv`, `F3/Maj+F3`, `F10`, et neutraliser `Alt+→`.
- Corriger `Ctrl+,` sur AZERTY avec l'utilitaire `event.key` ; tests AZERTY et QWERTY.
- `Ctrl+F` : ouvre et sélectionne, ne ferme plus ; sur l'écran Paramètres, focus sur le champ de recherche.
- Créer la table unique des raccourcis ; menus, infobulles, `aria-keyshortcuts`, puces et aide `F1` la lisent.
- Unifier la notation : `Ctrl+Maj+N` en texte, `Ctrl Maj N` en puces, « Libellé (raccourci) » en infobulle.
- Interdits : `Ctrl+Alt+lettre`, `Ctrl+W`, `Ctrl+Q`, `Ctrl+/`, `F5`, `Ctrl+R`, `Ctrl+Alt+Espace`.
- `Ctrl+N` et `Ctrl+F` existent déjà : l'issue ne les recode pas.

### Issue 373 (recherche de paramètres)

- Index par réglage (`settings/search-index.ts`) avec mots-clés en langage courant, `data-setting-id` sur chaque ligne, test de cohérence.
- Comparaison sans accents, tous les mots requis, ordre défini en 5.2.
- Palette `Ctrl+K` : groupe « Paramètres » (5 résultats, puis « Voir les N paramètres »).
- `Ctrl+Maj+P` et menu Fichier « Rechercher un paramètre… » : palette filtrée, étiquette retirable.
- Champ de l'écran Paramètres : libellé « Rechercher un paramètre », même index, résultats dans la colonne.
- `Entrée` : page, défilement, surlignage `accent` 2 s, focus sur le réglage.

### Issue 374 (`Ctrl+P`)

- Raccourci global + registre de la note active ; fenêtre « Exporter ou imprimer » ; bouton « Imprimer… » (PDF temporaire ouvert dans le lecteur Windows) ; dossier affiché ; règles par étape de 6.
- Entrée « Exporter… Ctrl+P » dans le menu Fichier.

### Issue 376 (`tauri-plugin-prevent-default`)

- Remplacer `init()` par un `Builder` avec des drapeaux explicites : tout **sauf `FOCUS_MOVE`** (rétablit `Maj+Tab`). Le choix pour `CONTEXT_MENU` dépend du point ouvert 2.
- Lire les changelogs 5 et 6 : noms et contenu des drapeaux ont pu changer.
- Vérifier sur Windows, version publiée : `Maj+Tab` revient au champ précédent ; `Ctrl+P`, `Ctrl+Maj+P`, `Ctrl+F`, `Ctrl+J` déclenchent l'action de l'app sans l'action WebView2 ; `F5` et `Ctrl+R` ne rechargent pas ; le zoom `Ctrl+molette` marche.
- Lever les « à vérifier » du tableau 3.3 (`F1`, `F11`, `Ctrl+S`) et reporter le résultat ici.

## 9. Points ouverts

1. **`Ctrl+Alt+←/→`** : on le garde à côté de `Ctrl+Pg.Préc/Suiv`, ou on le retire pour éviter la rotation d'écran Intel ? Recommandation : le retirer de l'affichage dès 0.6.0, le supprimer en 0.7.0.
2. **Clic droit** : laisser `CONTEXT_MENU` bloqué (pas de menu « Enregistrer sous / Imprimer » de WebView2) ou le rouvrir pour avoir « Copier / Coller » dans l'éditeur ? Recommandation : le débloquer **seulement dans les champs et l'éditeur**, avec un petit écouteur `contextmenu` de l'app qui annule ailleurs. À vérifier : que le menu WebView2 publié ne montre ni « Inspecter » ni « Actualiser ».
3. **Impression directe** (boîte de dialogue Windows sans passer par le lecteur PDF) : demande du code natif ; à évaluer après retour des utilisateurs.
4. **`Ctrl+O`** : Word ouvre un document. L'associer à « Rechercher une note » (`Ctrl+K`) ? Recommandation : non en 0.6.0, deux raccourcis pour la même chose brouillent l'aide.
5. **Touche `Alt` seule** pour aller aux menus (comme Office) : risque d'interférence avec la fenêtre native Windows. On s'en tient à `F10` en 0.6.0.
6. **`react-hotkeys-hook` v5** (`useKey`) plutôt que l'utilitaire maison : chantier à part, à ouvrir si d'autres raccourcis de ponctuation arrivent.
7. **Zoom** : WebView2 ne garde pas le niveau de zoom d'une session à l'autre (à vérifier). Le rendre persistant serait utile sur les petits écrans ; hors périmètre de l'epic 316.
