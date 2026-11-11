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
    Realtime), NVIDIA NeMo-Speech.cpp (WebSocket), `/v1/audio/transcriptions` ;
  - modèle de langage : API compatible OpenAI (vLLM, SGLang, llama.cpp, Ollama,
    LM Studio, TGI, MLX).
- **Aucune conservation de l'audio** : il n'existe qu'en mémoire, le temps
  d'être transcrit. Seuls la transcription et la note sont enregistrées,
  localement.
- **Ni compte, ni abonnement, ni télémétrie.**

Données, flux réseau et responsabilités au regard du RGPD :
[conformité RGPD](https://docs.syntheo.studio/fr/conformite/rgpd).

## Installation

### Linux : script en une ligne (AppImage)

```bash
curl -fsSL https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.sh | bash
```

Le script télécharge l'AppImage de la dernière release dans `~/.local/bin`,
vérifie sa somme SHA256, l'enregistre sous le nom `Syntheo-<version>.AppImage`
et crée le lien `syntheo`.

Pour **tester une release précise** (n'importe quelle version publiée) :

```bash
curl -fsSL https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.sh | bash -s -- --version v0.7.0
```

> Sur **Arch / Omarchy**, l'AppImage nécessite FUSE 2 : `sudo pacman -S fuse2`.
> Plusieurs versions peuvent coexister (fichiers `Syntheo-<version>.AppImage`).

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
