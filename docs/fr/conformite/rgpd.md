---
title: "Syntheo Desktop et le RGPD"
sidebarTitle: "Conformité RGPD"
description: "Données stockées, flux réseau, garanties techniques et responsabilités de l'utilisateur."
---

Document de référence pour une personne ou une organisation qui évalue Syntheo
Desktop. Il est mis à jour à chaque changement de flux réseau ou de stockage.

**Principe** : Syntheo Desktop est un client local. Il n'a ni serveur, ni base
centrale, ni compte, et n'émet aucune télémétrie. L'éditeur n'accède à aucune donnée et n'est
pas responsable de traitement : l'utilisateur l'est, sur son poste.

> **État au 2026-10-26 :** l'audio ne touche plus jamais le disque, sur aucun
> chemin. La capture de réunion, la dictée, l'import et le dépôt d'un fichier
> audio, ainsi que le découpage interne du traitement batch, travaillent
> entièrement en mémoire ; le fichier importé est lu à son emplacement
> d'origine, sans copie dans le dossier de données.
>
> **Providers** : endpoints on-premise uniquement. La transcription parle aux
> protocoles OpenAI et NVIDIA NeMo-Speech.cpp ; le résumé, le chat et le
> générateur de templates parlent à un seul endpoint LLM configuré, une API
> OpenAI-compatible (vLLM, Ollama, llama.cpp server…).

## Données stockées

Tout est stocké sur le poste, dans le dossier de données de l'application
(`syntheo` sous le répertoire de données de l'utilisateur, par exemple
`~/.local/share/syntheo` sous Linux).

| Donnée                                     | Où                                                                                                                                               | Durée                                 | Suppression                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------- |
| Transcripts (texte, horodatage, locuteurs) | base SQLite locale `app.db`                                                                                                                      | jusqu'à suppression par l'utilisateur | suppression de la réunion dans l'application, ou du dossier de données |
| Notes et comptes rendus générés            | base SQLite locale                                                                                                                               | idem                                  | idem                                                                   |
| Contacts, dossiers, réglages               | base SQLite locale                                                                                                                               | idem                                  | idem                                                                   |
| Clés d'API des endpoints d'inférence       | trousseau du système (Keychain, Secret Service, Credential Manager) ; jamais en clair dans la base                                               | jusqu'à suppression du provider       | retrait du provider dans les réglages                                  |
| Index de recherche plein texte (tantivy)   | dossier de données (copie indexée des transcripts et notes)                                                                                      | tant que les réunions existent        | suit la suppression des réunions, ou suppression du dossier de données |
| Journaux techniques `app.log`              | dossier de logs de l'application ; contenu filtré par un module de masquage (`RedactingWriter`), rotation par taille                             | rotation automatique                  | suppression du dossier de logs                                         |
| Exports (Markdown, etc.)                   | dossier export choisi par l'utilisateur                                                                                                          | sous le contrôle de l'utilisateur     | suppression des fichiers exportés                                      |
| Audio d'une réunion                        | **jamais sur disque** : en mémoire le temps d'être envoyé à l'endpoint STT ; une coupure de transcription laisse un trou daté dans le transcript | —                                     | —                                                                      |
| Audio de la dictée ou d'un import          | **jamais sur disque**, même temporairement : la dictée produit un WAV en mémoire, l'import lit le fichier à son emplacement d'origine sans copie | —                                     | —                                                                      |

Aucune de ces données n'est envoyée à l'éditeur.

**Inférence sur le poste, seulement si l'utilisateur installe les modèles** :
par défaut, l'application n'exécute aucun modèle (transcription, LLM,
diarisation ou empreintes vocales). Le programme de transcription sur le poste,
`syntheo-speech`, est livré avec l'application mais ne tourne que si
l'utilisateur choisit la source facultative « Sur ce poste » et installe ses
modèles (environ 1,1 Go) dans `speech/models` du dossier de données ; le
résultat de la mise en service est dans `speech/commissioning.json`. Le
programme transcrit l'audio de l'écoute en mémoire, sur la boucle locale, sans
rien écrire d'audio ni journaliser de texte. Les modèles se suppriment avec
**Retirer les modèles** ou avec le dossier de données. Les réglages gérés
`on_device_transcription_enabled` (interdire la source) et
`speech_models_urls` (imposer un miroir des modèles) sont à la disposition de
l'organisation. Voir [Transcrire sur ce poste](/fr/on-device-transcription). Une version antérieure a pu laisser des fichiers de
modèles dans les dossiers `models/stt`, `models/llm` et `models/aec` (modèles
d'annulation d'écho, désormais fournis avec l'application) du dossier de données,
ainsi que dans le cache de modèles Soniqo sous macOS : ils ne sont plus ni lus
ni chargés, et peuvent être supprimés à la main. Les empreintes vocales
qu'une version antérieure a pu enregistrer (vecteurs dans le trousseau du
système, références dans les tables `voiceprint_exemplars` et
`voiceprint_candidates`) sont effacées au démarrage ; si le trousseau refuse
une suppression, l'effacement est retenté au lancement suivant.

## Flux réseau

- **Transcription sur le poste** (source facultative « Sur ce poste ») :
  l'audio de l'écoute part vers le programme `syntheo-speech`, sur la boucle
  locale (`127.0.0.1`) du poste, après authentification mutuelle ; rien ne
  quitte le poste, et le programme n'ouvre aucune connexion vers l'extérieur.
  Pour une écoute « Sur ce poste », aucun audio ne part vers le serveur, même
  pour réparer un passage coupé.
- **Téléchargement des modèles de la transcription sur le poste**, seulement
  quand l'utilisateur choisit **Télécharger les modèles** : requêtes HTTPS
  pour les fichiers des modèles vers la release GitHub de Syntheo
  (`github.com`, redirigé vers `release-assets.githubusercontent.com`), puis
  vers Hugging Face (`huggingface.co`, redirigé vers ses serveurs de contenu
  sous `hf.co`, par exemple `cas-bridge.xethub.hf.co`) en secours, ou vers le
  miroir défini par l'administrateur (`speech_models_urls`) à la place ; les
  redirections HTTPS sont suivies (5 au plus), y compris celles du miroir
  vers un autre hôte. Aucune donnée de
  réunion n'est envoyée ; ces hôtes voient l'adresse IP du poste. Aucun flux
  si les modèles sont installés depuis un dossier. L'administrateur coupe ce
  flux, avec tout le module, par la clé `on_device_transcription_enabled` à
  `false` dans `managed_settings.json`.
- **Endpoints d'inférence configurés par l'utilisateur** : ASR
  (protocole OpenAI : Realtime et `/v1/audio/transcriptions` ; NVIDIA
  NeMo-Speech.cpp : WebSocket `/v1/audio/transcriptions/realtime`) et
  l'endpoint LLM configuré (API OpenAI-compatible). L'audio de
  la capture et le texte (transcript, notes, prompts) y transitent, sans
  empreinte d'appareil ni identifiant de tâche dans les en-têtes. Une URL de transcription non
  reconnue est traitée avec le protocole OpenAI, jamais renvoyée vers un
  service tiers.
- **TLS recommandé** dès que l'endpoint n'est pas sur la machine ou un réseau de
  confiance (par exemple via un reverse proxy ou un VPN). L'application accepte
  HTTP en clair uniquement vers un hôte privé (machine locale, réseau local,
  plage Tailscale, noms `.local`), après confirmation hors de la machine, et
  exige HTTPS ailleurs.
- **Webhooks configurés par l'utilisateur**, désactivés tant qu'aucune
  adresse n'est saisie :
  - webhooks de l'API locale (Paramètres → Développeurs) : à la fin d'une
    réunion (`meeting.completed`) ou d'un résumé (`note.enhanced`), requête
    `POST` signée (HMAC-SHA256) vers l'adresse saisie, avec la note, les
    résumés, les participants, les actions à mener et le texte complet de la
    transcription ;
  - étape « Envoyer vers une adresse (webhook) » d'une automatisation : le
    corps JSON composé par l'utilisateur, qui peut inclure les mêmes données,
    vers l'adresse saisie, sans signature.
  - dans les deux cas, le destinataire est l'adresse choisie par
    l'utilisateur (`http://` ou `https://`). Contrairement aux endpoints,
    HTTPS n'est pas exigé : préférer HTTPS ou un réseau privé.
- Un endpoint exploité par un tiers devient **sous-traitant de l'utilisateur**
  (art. 28 RGPD) : contrat et localisation des données à vérifier.
- **Autres flux, hors inférence** :
  - recherche de mises à jour : 15 secondes après le démarrage, activée par
    défaut et désactivable par l'utilisateur ou par l'administrateur
    (`managed_settings.json`, clé `automatic_updates` à `false`), et à tout
    moment à la demande de l'utilisateur, même quand la recherche au démarrage
    est coupée. Lecture **non authentifiée** de `latest.json`
    (`github.com/WillIsback/Syntheo/releases/latest/download/latest.json`,
    redirigé par GitHub vers ses serveurs de contenu), qui porte aussi les
    notes de la nouvelle version ; celles de la version installée sont
    incluses dans l'application. Aucune donnée personnelle transmise ; GitHub
    voit l'adresse IP du poste ;
  - téléchargement de l'installeur d'une mise à jour, seulement quand
    l'utilisateur le demande : fichier de la release GitHub indiquée par
    `latest.json`, dont la signature est vérifiée avant l'installation ;
  - modèles de la transcription sur le poste : voir plus haut (au clic
    seulement, coupés par `on_device_transcription_enabled`) ;
  - modèles d'annulation d'écho : fournis avec l'application, aucun
    téléchargement.
- **Pas de compte, pas de synchronisation, pas de rapport d'erreur, pas
  d'installation sans action de l'utilisateur** (la mise à jour intégrée,
  AppImage et installeur Windows, s'installe sur demande, installeur signé ;
  .deb et MSI : lien vers les GitHub Releases).
- Aucune intégration de calendrier ni de tâches : Apple Calendar, Rappels et
  les intégrations hébergées héritées (calendriers Google et Outlook, Linear,
  GitHub) sont retirées du code.

## Garanties techniques

- **Aucun compte ni authentification** : le code d'authentification hérité
  (Supabase, plugin `auth`) est supprimé.
- **Aucune télémétrie, aucun rapport d'erreur** : le code d'analyse (PostHog)
  et de rapport d'erreur (Sentry) est **retiré** (`crates/analytics`,
  `plugins/analytics`, dépendances `posthog-rs`, `sentry`, `@sentry/react`),
  ainsi que l'identifiant d'appareil qui n'existait que pour la télémétrie. Il
  n'y a plus rien à désactiver.
- **Clés dans le trousseau du système**, pas dans la base.
- **Aucun audio sur disque, sur aucun chemin** : la session de capture ne
  démarre plus d'enregistreur, la rétention est figée à « aucune » et un test
  Rust vérifie qu'aucun fichier audio n'apparaît dans le dossier de session ;
  ni lecteur, ni retranscription, ni empreintes vocales. La dictée produit un
  WAV en mémoire, l'import et le dépôt d'un fichier transcrivent depuis
  l'emplacement d'origine sans copie, et le découpage batch se fait en mémoire.
- **Garde-fou dans les tests** : `apps/desktop/src/no-cloud-imports.test.ts`
  échoue si un module cloud ou d'authentification retiré est réimporté.
- **Contrôle de bout en bout** : une capture réseau pendant une session
  complète ne doit montrer que les endpoints d'inférence configurés et les
  flux listés plus haut ; tout autre flux est traité comme une vulnérabilité
  (voir `SECURITY.md`).

## Responsabilités de l'utilisateur

- **Informer les participants** avant d'enregistrer une réunion (art. 13 et 14
  RGPD). En France, enregistrer une conversation privée à l'insu des
  participants est puni par l'article 226-1 du Code pénal ; en entreprise, les
  salariés doivent être informés. Au démarrage de chaque capture,
  l'application affiche un rappel d'informer les participants ; il est activé
  par défaut et se désactive dans Paramètres → Réunions (« Rappeler aux
  participants l'enregistrement »).
- **Choisir les endpoints d'inférence** et en assumer le traitement : un
  endpoint auto-hébergé reste sous le contrôle de l'utilisateur ; un endpoint
  tiers est un sous-traitant.
- **Gérer la durée de conservation** des transcripts et des notes, et les
  supprimer quand ils ne sont plus nécessaires.
- **Analyse d'impact (AIPD)** : à envisager par une organisation qui déploie
  l'outil à grande échelle ou pour des réunions sensibles (art. 35 RGPD).
- **Protéger le poste** (chiffrement du disque, session verrouillée) : les
  données y sont stockées en clair dans la base locale.
