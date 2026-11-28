<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="packages/design-system/assets/brand/syntheo-logo-dark.svg" />
  <img alt="Syntheo" src="packages/design-system/assets/brand/syntheo-logo-light.svg" height="72" />
</picture>

<h1>Syntheo</h1>

<p>
  <b>Ici, tout peut se dire. Rien ne peut sortir. IA comprise.</b>
  <br />
  Le bloc-notes de réunion open source qui tourne sur votre machine.
  <br />
  Transcription en temps réel et comptes rendus clairs, avec les modèles
  open-weight de <i>votre</i> infrastructure. Aucun cloud, aucun audio conservé.
</p>

<p>
  <a href="https://github.com/WillIsback/Syntheo/releases/latest/download/Syntheo-windows-x64-setup.exe"><img alt="Télécharger pour Windows" src="https://img.shields.io/badge/Windows-t%C3%A9l%C3%A9charger-0078D4?logo=windows11&logoColor=white" /></a>
  <a href="https://github.com/WillIsback/Syntheo/releases/latest/download/Syntheo-linux-x86_64.AppImage"><img alt="Télécharger pour Linux" src="https://img.shields.io/badge/Linux-t%C3%A9l%C3%A9charger-FCC624?logo=linux&logoColor=black" /></a>
  <a href="https://syntheo.studio/fr/"><img alt="Site syntheo.studio" src="https://img.shields.io/badge/site-syntheo.studio-316745" /></a>
  <a href="https://docs.syntheo.studio/fr"><img alt="Documentation" src="https://img.shields.io/badge/documentation-en%20ligne-316745?logo=readthedocs&logoColor=white" /></a>
  <a href="LICENSE"><img alt="Licence MIT" src="https://img.shields.io/badge/licence-MIT-green" /></a>
</p>

<p><a href="README.md">English</a> · <b>Français</b></p>

</div>

> **Statut** : bêta. L'application est utilisable, mais son comportement et ses
> réglages peuvent encore évoluer d'une version à l'autre. Voir
> l'[architecture](https://docs.syntheo.studio/fr/architecture) actuelle et la
> [feuille de route](https://docs.syntheo.studio/fr/roadmap).

## Ce que fait Syntheo

- **Transcription en temps réel** du micro et du son de l'ordinateur.
- **Comptes rendus** rédigés à partir de vos notes et de la transcription,
  guidés par des **modèles** (réunion générale, comité conformité / RGPD, point
  projet, standup… et un **générateur de modèles** par IA). Ce qui vient de vos
  notes reste en vert, et ce que Syntheo ajoute s'écrit à l'encre.
- **Dossiers projet** : un fil rouge d'une réunion à l'autre, et un ordre du
  jour proposé pour la suivante.
- **Automatisations** : des actions lancées sur une note terminée (export,
  tâches, webhook…).
- **Inférence sur site uniquement** : l'application ne parle qu'aux serveurs
  que vous configurez, via les protocoles standard des moteurs open-weight :
  - transcription : OpenAI Realtime, vLLM Realtime (par exemple Voxtral Mini 4B
    Realtime), NVIDIA NeMo-Speech.cpp (WebSocket), `/v1/audio/transcriptions`.
    Pas encore de serveur ? Une image Docker prête à l'emploi en lance un sur
    votre poste : [installer le service de transcription en local](https://docs.syntheo.studio/fr/local-transcription-service) ;
  - modèle de langage : API compatible OpenAI (vLLM, SGLang, llama.cpp, Ollama,
    LM Studio, TGI, MLX).
- **Aucune conservation de l'audio** : il n'existe qu'en mémoire, le temps
  d'être transcrit. Seuls la transcription et la note sont enregistrées,
  localement.
- **Ni compte, ni abonnement, ni télémétrie.**

Données, flux réseau et responsabilités au regard du RGPD :
[conformité RGPD](https://docs.syntheo.studio/fr/conformite/rgpd).

## Syntheo et les autres bloc-notes de réunion

Ce tableau ne retient que des points sur lesquels Syntheo a fait un choix
différent. Ce n'est pas un classement : ces outils font aussi des choses que
Syntheo ne fait pas, [listées plus bas](#ce-que-les-autres-font-et-pas-syntheo).
Relevé du 28 novembre 2026, d'après les documentations et les dépôts publics
des éditeurs.

✅ oui · 🟡 en partie · ❌ non

|                                                             | Syntheo | Granola | Anarlog | OpenWhispr | Meetily |
| ----------------------------------------------------------- | :-----: | :-----: | :-----: | :--------: | :-----: |
| Code source de l'application ouvert                         |   ✅    |   ❌    |   ✅    |     ✅     |   ✅    |
| Toutes les fonctions gratuites, aucune offre payante        |   ✅    |   ❌    |   ❌    |     ❌     |   ❌    |
| Utilisable sans compte                                      |   ✅    |   ❌    |   ✅    |     ✅     |   ✅    |
| Aucune télémétrie dans l'application                        |   ✅    |   ❌    |   ❌    |     🟡     |   🟡    |
| Aucun service d'IA cloud intégré                            |   ✅    |   ❌    |   🟡    |     ❌     |   🟡    |
| Aucun audio de réunion conservé                             |   ✅    |   ✅    |   ❌    |     ✅     |   ❌    |
| Version Linux                                               |   ✅    |   ❌    |   ✅    |     ✅     |   🟡    |
| Installeur MSI pour un parc Windows                         |   ✅    |   ❌    |   ❌    |     ❌     |   ✅    |
| Service de transcription à héberger, fourni en image Docker |   ✅    |   ❌    |   ❌    |     ❌     |   ❌    |
| Interface et modèles de compte rendu en français            |   ✅    |   ❌    |   ❌    |     ✅     |   ❌    |
| Fil d'une réunion à l'autre et ordre du jour proposé        |   ✅    |   🟡    |   🟡    |     🟡     |   ❌    |
| Vos notes distinguées du texte de l'IA dans la synthèse     |   ✅    |   ✅    |   🟡    |     🟡     |   🟡    |
| Accès local et gratuit pour les agents (CLI et MCP)         |   ✅    |   ❌    |   ✅    |     🟡     |   ❌    |

<details>
<summary>Détail de chaque ligne et sources</summary>

- **Code source ouvert.** Granola est propriétaire. Anarlog est sous licence
  MIT, sauf son dossier `enterprise/`, sous licence commerciale
  ([LICENSING.md][cmp-a-licensing]). L'application OpenWhispr est sous licence
  MIT ; son service cloud n'est pas publié ([README][cmp-o-readme]). Meetily
  publie une édition communautaire sous licence MIT, à côté d'une édition Pro
  fermée ([README][cmp-m-readme]).
- **Aucune offre payante.** Granola : offre gratuite limitée à 30 jours
  d'historique, puis 14 $ par utilisateur et par mois ([offres][cmp-g-billing]).
  Anarlog : Pro à 14 $ par personne et par mois pour le cloud, la
  synchronisation, le partage et les équipes ([équipes][cmp-a-teams]).
  OpenWhispr : usage local gratuit et illimité, Pro à 8 $ par mois
  ([offres][cmp-o-plans]). Meetily : édition communautaire gratuite, Pro à 10 $
  par utilisateur et par mois ([README][cmp-m-readme]).
- **Sans compte.** Granola demande un compte Google ou Microsoft
  ([premiers pas][cmp-g-setup]). Anarlog et OpenWhispr fonctionnent sans compte
  en local. Pour Meetily, aucune connexion n'a été trouvée dans l'édition
  communautaire : la case est comptée en sa faveur.
- **Télémétrie.** Granola prévoit des outils d'analyse dans sa politique de
  confidentialité ([politique][cmp-g-privacy]). Anarlog partage les données
  d'usage par défaut, et un réglage permet de le couper
  ([données][cmp-a-privacy]). OpenWhispr et Meetily ont une télémétrie coupée
  par défaut, que l'utilisateur peut activer ([OpenWhispr][cmp-o-strings],
  [Meetily][cmp-m-privacy]). Dans Syntheo, ce code est retiré.
- **IA cloud.** Syntheo ne parle qu'aux serveurs que vous ou votre organisation
  configurez : aucun fournisseur n'est intégré. Si vous choisissez un serveur
  exploité par un tiers, vos données y vont. Granola transcrit et rédige dans
  son cloud ([explication de l'éditeur][cmp-g-cloud]). Anarlog propose son
  cloud (Pro) et des fournisseurs par clé personnelle à côté des modèles
  locaux, sans rien présélectionner ([modèles][cmp-a-models]). OpenWhispr
  utilise son cloud par défaut après l'accueil, avec un mode entièrement local
  au choix ([flux réseau][cmp-o-network]). Meetily est local par défaut, avec
  des fournisseurs cloud en option pour la synthèse ([README][cmp-m-readme]).
- **Audio.** Granola met l'audio en cache le temps de le transcrire dans son
  cloud, puis le supprime ([questions fréquentes][cmp-g-faq]). OpenWhispr
  indique ne jamais stocker l'audio de réunion ([textes de
  l'interface][cmp-o-strings]). Anarlog et Meetily l'enregistrent par défaut,
  et un réglage permet de l'éviter ([Anarlog][cmp-a-privacy],
  [Meetily][cmp-m-rec]).
- **Linux.** Granola existe pour macOS, Windows, iOS et Android
  ([premiers pas][cmp-g-setup]). La version Linux d'Anarlog est en bêta
  ([installation][cmp-a-install]). Meetily publie ses installeurs pour Windows
  et macOS ; sous Linux, il se compile depuis les sources
  ([README][cmp-m-readme]).
- **MSI.** Granola, Anarlog et OpenWhispr publient un installeur EXE
  ([Granola][cmp-g-managed], [Anarlog][cmp-a-install],
  [OpenWhispr][cmp-o-builder]) ; Meetily publie un MSI
  ([version 0.5.0][cmp-m-release]). Anarlog et OpenWhispr ont aussi des
  réglages imposés par l'administrateur.
- **Service de transcription fourni.** Syntheo publie l'image
  `ghcr.io/willisback/syntheo-transcription`, à installer sur un poste ou sur
  un serveur partagé. Anarlog accepte un serveur auto-hébergé mais n'en fournit
  pas. Dans OpenWhispr, la prise de notes de réunion n'accepte pas encore de
  serveur auto-hébergé ([textes de l'interface][cmp-o-strings]). L'ancien
  serveur de Meetily est archivé ([backend][cmp-m-backend]). OpenWhispr et
  Meetily transcrivent dans l'application, sans serveur.
- **Français.** Tous transcrivent le français. L'interface de Granola est en
  anglais ([langues][cmp-g-lang]). Celle d'Anarlog est presque entièrement en
  anglais : 15 messages traduits sur 1 628 au jour du relevé
  ([catalogue][cmp-a-fr]). Celle d'OpenWhispr est entièrement traduite
  ([catalogue][cmp-o-fr]). Celle de Meetily est en anglais
  ([demande ouverte][cmp-m-i18n]), et la langue du résumé se règle.
- **Fil entre réunions.** Granola prépare des « briefs » d'avant réunion dans
  ses offres Business et Enterprise ([briefs][cmp-g-briefs]). Anarlog retrouve
  les réunions liées à la demande, dans le chat de l'offre Pro
  ([chat][cmp-a-chat]). OpenWhispr a des dossiers et une recherche, sans fil de
  projet. Meetily n'a pas de dossiers ([demande ouverte][cmp-m-folders]).
- **Provenance.** Granola affiche en noir ce qui vient de vos notes
  ([notes][cmp-g-notes]). Anarlog, OpenWhispr et Meetily séparent vos notes et
  la synthèse par onglets ([Anarlog][cmp-a-notes],
  [Meetily][cmp-m-workspace]).
- **Agents.** Le serveur MCP de Granola est distant et lié au compte
  ([MCP][cmp-g-mcp]). La CLI et le serveur MCP d'Anarlog sont locaux et
  gratuits ([MCP][cmp-a-mcp]). OpenWhispr a une CLI locale
  ([CLI][cmp-o-cli]) ; son serveur MCP est distant et rangé parmi les fonctions
  payantes ([MCP][cmp-o-mcp]). Chez Meetily, le serveur MCP, la CLI et l'API
  sont réservés à l'offre Pro ([MCP][cmp-m-mcp]).

</details>

### Ce que les autres font, et pas Syntheo

- **macOS et mobile.** Les quatre ont une version macOS, et Granola des
  applications iOS et Android. Syntheo n'est publié que pour Linux et Windows.
- **Modèle de langue embarqué.** OpenWhispr et Meetily rédigent le compte rendu
  hors ligne sans rien installer d'autre. Syntheo transcrit sur le poste depuis
  la version 0.8.0, mais le compte rendu demande un serveur de modèle de
  langage, Ollama par exemple.
- **Calendriers, partage, synchronisation, SSO.** Granola et Anarlog se
  connectent aux calendriers, partagent les notes et gèrent des équipes.
  Syntheo ne se connecte à aucun calendrier et ne synchronise rien.

Une erreur dans ce tableau ? [Ouvrez une issue](https://github.com/WillIsback/Syntheo/issues/new/choose).

## Installation

### Linux : script en une ligne (AppImage)

```bash
curl -fsSL https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.sh | bash
```

Le script télécharge l'AppImage de la dernière release dans `~/.local/bin`,
vérifie sa somme SHA256, l'enregistre sous le nom `Syntheo.AppImage` et crée le
lien `syntheo`. Une réinstallation remplace la version précédente.

Pour **tester une release précise** (n'importe quelle version publiée) :

```bash
curl -fsSL https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.sh | bash -s -- --version v0.7.0
```

> Sur **Arch / Omarchy**, l'AppImage nécessite FUSE 2 : `sudo pacman -S fuse2`.
> Une ancienne installation `Syntheo-<version>.AppImage` est retirée au passage.

### Debian / Ubuntu

Le script peut aussi installer le paquet `.deb` :

```bash
curl -fsSL https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.sh | bash -s -- --deb
sudo apt install ~/.local/bin/Syntheo_*_amd64.deb   # ou : sudo apt install ./Syntheo_*.deb
```

### Windows

**Téléchargez l'installeur** (conseillé si vous n'utilisez pas le terminal) :
[`Syntheo-windows-x64-setup.exe`](https://github.com/WillIsback/Syntheo/releases/latest/download/Syntheo-windows-x64-setup.exe),
ou le `.msi` :
[`Syntheo-windows-x64.msi`](https://github.com/WillIsback/Syntheo/releases/latest/download/Syntheo-windows-x64.msi).

Les installeurs des releases sont signés. SmartScreen peut encore afficher un
avertissement, le temps que le binaire se fasse une réputation.

**Script en une ligne** : il télécharge, vérifie la somme SHA256
(`SHA256SUMS-windows`) et installe sans fenêtre (pour l'utilisateur courant,
sans élévation) :

```powershell
irm https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.ps1 | iex
```

Pour **installer une release précise** :

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.ps1))) -Version v0.7.0
```

### Paquets

Les fichiers `.deb`, AppImage, `.msi` et `.exe` sont aussi sur la page
[Releases](https://github.com/WillIsback/Syntheo/releases). Chaque release
publie `SHA256SUMS` et `SHA256SUMS-windows`, ainsi qu'une attestation de
provenance vérifiable avec `gh attestation verify`.

### macOS

Les paquets macOS ne sont pas encore publiés. En attendant, l'application se
construit depuis les sources :
[CONTRIBUTING.md › Construire depuis les sources](CONTRIBUTING.md#construire-depuis-les-sources).

## Développement

- Desktop : `apps/desktop` (Tauri 2, React 19, TypeScript, Vite, Tailwind).
- Rust : `crates/` et `plugins/` (capture audio, adaptateurs de transcription,
  SQLite, modèles Jinja des prompts).
- Architecture (flux de capture et d'inférence, stockage, garanties) :
  [architecture](https://docs.syntheo.studio/fr/architecture).
- Contribution, conventions de commit et gates de CI :
  [CONTRIBUTING.md](CONTRIBUTING.md).

## Pourquoi le thé ?

Syn·thé·o : ce qu'on rassemble autour du thé. Au Japon, un _chakai_ (茶会) est
une réunion de thé dans une pièce fermée, et le _kaiki_ (会記) est le carnet
qu'un invité en garde. Comme le _kaiki_, votre compte rendu part de vos notes.
Une réunion ne se rejoue pas (一期一会, _ichi-go ichi-e_) : l'audio n'est jamais
conservé, seule la note reste. Lire [l'histoire du nom](https://docs.syntheo.studio/fr/philosophy).

## Origine

Syntheo est un projet indépendant, dérivé
d'**[Anarlog](https://github.com/fastrepl/anarlog)** (Fastrepl, Inc., licence
MIT), importé à la révision `a0d5bd0` du 2026-10-24 dans un nouveau dépôt.
Merci à l'équipe Anarlog pour cette base open source. Le détail de ce qui a été
repris, retiré et modifié est dans [NOTICE.md](NOTICE.md). Syntheo n'est ni
affilié à Fastrepl ni soutenu par Fastrepl.

Syntheo succède à [Syntheo-web](https://github.com/WillIsback/Syntheo-web),
une génération web antérieure du projet.

## Licence

[MIT](LICENSE) : © 2026 William Derue (Syntheo), © 2023 Fastrepl, Inc. (code d'origine).

[cmp-g-setup]: https://docs.granola.ai/help-center/getting-started/setting-up-granola-for-the-first-time
[cmp-g-privacy]: https://docs.granola.ai/help-center/policies/privacy-policy
[cmp-g-lang]: https://docs.granola.ai/help-center/customising-granola/multi-language
[cmp-g-faq]: https://docs.granola.ai/help-center/consent-security-privacy/security-privacy-data-faqs
[cmp-g-mcp]: https://docs.granola.ai/help-center/sharing/integrations/mcp
[cmp-g-billing]: https://docs.granola.ai/help-center/managing-your-account/subscriptions-and-billing
[cmp-g-cloud]: https://www.granola.ai/blog/local-first-ai-notetaker-vs-cloud
[cmp-g-briefs]: https://docs.granola.ai/help-center/taking-notes/pre-meeting-briefs
[cmp-g-managed]: https://docs.granola.ai/help-center/getting-started/managed-installations
[cmp-g-notes]: https://docs.granola.ai/help-center/taking-notes/ai-enhanced-notes
[cmp-a-licensing]: https://github.com/fastrepl/anarlog/blob/main/LICENSING.md
[cmp-a-privacy]: https://docs.anarlog.so/data-and-privacy
[cmp-a-models]: https://docs.anarlog.so/models-and-providers
[cmp-a-install]: https://docs.anarlog.so/desktop-installation
[cmp-a-mcp]: https://docs.anarlog.so/agents/mcp
[cmp-a-chat]: https://docs.anarlog.so/chat
[cmp-a-teams]: https://docs.anarlog.so/teams
[cmp-a-notes]: https://docs.anarlog.so/notes
[cmp-a-fr]: https://github.com/fastrepl/anarlog/blob/main/apps/desktop/src/i18n/locales/fr/messages.po
[cmp-o-readme]: https://github.com/OpenWhispr/openwhispr/blob/main/README.md
[cmp-o-strings]: https://github.com/OpenWhispr/openwhispr/blob/main/src/locales/en/translation.json
[cmp-o-fr]: https://github.com/OpenWhispr/openwhispr/blob/main/src/locales/fr/translation.json
[cmp-o-network]: https://github.com/OpenWhispr/openwhispr/blob/main/docs/network-allowlist.md
[cmp-o-plans]: https://docs.openwhispr.com/help/plans-and-limits
[cmp-o-builder]: https://github.com/OpenWhispr/openwhispr/blob/main/electron-builder.json
[cmp-o-cli]: https://github.com/OpenWhispr/openwhispr-cli
[cmp-o-mcp]: https://github.com/OpenWhispr/openwhispr-mcp
[cmp-m-readme]: https://github.com/Zackriya-Solutions/meetily/blob/main/README.md
[cmp-m-privacy]: https://github.com/Zackriya-Solutions/meetily/blob/main/PRIVACY_POLICY.md
[cmp-m-rec]: https://github.com/Zackriya-Solutions/meetily/blob/main/frontend/src-tauri/src/audio/recording_preferences.rs
[cmp-m-backend]: https://github.com/Zackriya-Solutions/meetily/blob/main/backend/README.md
[cmp-m-release]: https://github.com/Zackriya-Solutions/meetily/releases/tag/v0.5.0
[cmp-m-i18n]: https://github.com/Zackriya-Solutions/meetily/issues/819
[cmp-m-folders]: https://github.com/Zackriya-Solutions/meetily/issues/842
[cmp-m-mcp]: https://meetily.ai/mcp
[cmp-m-workspace]: https://docs.meetily.ai/features/meeting-workspace
