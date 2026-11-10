<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="packages/design-system/assets/brand/syntheo-logo-dark.svg" />
  <img alt="Syntheo" src="packages/design-system/assets/brand/syntheo-logo-light.svg" height="72" />
</picture>

<h1>Syntheo</h1>

<p>
  <b>What's said in the room stays in the room. Even the AI.</b>
  <br />
  The open-source meeting notepad that runs on your own machine.
  <br />
  Live transcription and clear write-ups, with the open-weight models of
  <i>your</i> infrastructure. No cloud, no audio kept.
</p>

<p>
  <a href="https://github.com/WillIsback/Syntheo/releases/latest/download/Syntheo-windows-x64-setup.exe"><img alt="Download for Windows" src="https://img.shields.io/badge/Windows-download-0078D4?logo=windows11&logoColor=white" /></a>
  <a href="https://github.com/WillIsback/Syntheo/releases/latest/download/Syntheo-linux-x86_64.AppImage"><img alt="Download for Linux" src="https://img.shields.io/badge/Linux-download-FCC624?logo=linux&logoColor=black" /></a>
  <a href="https://syntheo.studio"><img alt="Website syntheo.studio" src="https://img.shields.io/badge/website-syntheo.studio-316745" /></a>
  <a href="https://docs.syntheo.studio"><img alt="Documentation" src="https://img.shields.io/badge/docs-online-316745?logo=readthedocs&logoColor=white" /></a>
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-green" /></a>
</p>

<p><b>English</b> · <a href="README.fr.md">Français</a></p>

</div>

> **Status**: beta. The app is usable, but its behaviour and settings may still
> change from one version to the next. See the current
> [architecture](https://docs.syntheo.studio/en/architecture) and the
> [roadmap](https://docs.syntheo.studio/en/roadmap).

## What Syntheo does

- **Live transcription** of your microphone and your computer's audio.
- **Write-ups** built from your own notes and the transcript, guided by
  **templates** (general meeting, compliance / GDPR committee, project review,
  stand-up… and an AI **template generator**). What comes from your notes stays
  green; what Syntheo adds is in ink.
- **Project folders**: a running thread across meetings, and an agenda proposed
  for the next one.
- **Automations**: run actions on a finished note (export, tasks, webhook…).
- **On-premise inference only**: the app only talks to the endpoints you
  configure, through the standard protocols of open-weight engines:
  - speech-to-text: OpenAI Realtime, vLLM Realtime (e.g. Voxtral Mini 4B
    Realtime), NVIDIA NIM (WebSocket and gRPC), `/v1/audio/transcriptions`;
  - language model: OpenAI-compatible API (vLLM, SGLang, llama.cpp, Ollama,
    TGI, NIM, MLX).
- **No audio kept**: it only lives in memory while it is transcribed. Only the
  transcript and the note are saved, locally.
- **No account, no subscription, no telemetry.**

Data, network flows and GDPR responsibilities:
[GDPR compliance](https://docs.syntheo.studio/en/conformite/rgpd).

## Installation

### Linux: one-line script (AppImage)

```bash
curl -fsSL https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.sh | bash
```

The script downloads the latest release's AppImage into `~/.local/bin`, checks
its SHA256 checksum, saves it as `Syntheo-<version>.AppImage` and creates the
`syntheo` link.

To **try a specific release** (any published version):

```bash
curl -fsSL https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.sh | bash -s -- --version v0.7.0
```

> On **Arch / Omarchy**, the AppImage needs FUSE 2: `sudo pacman -S fuse2`.
> Several versions can live side by side (`Syntheo-<version>.AppImage` files).

### Debian / Ubuntu

The script can also install the `.deb` package:

```bash
curl -fsSL https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.sh | bash -s -- --deb
sudo apt install ~/.local/bin/Syntheo_*_amd64.deb   # or: sudo apt install ./Syntheo_*.deb
```

### Windows

**Download the installer** (recommended if you don't use the terminal):
[`Syntheo-windows-x64-setup.exe`](https://github.com/WillIsback/Syntheo/releases/latest/download/Syntheo-windows-x64-setup.exe),
or the `.msi`:
[`Syntheo-windows-x64.msi`](https://github.com/WillIsback/Syntheo/releases/latest/download/Syntheo-windows-x64.msi).

Release installers are signed. SmartScreen may still show a warning while the
binary builds its reputation.

**One-line script**: downloads, checks the SHA256 checksum
(`SHA256SUMS-windows`) and installs silently (per user, no elevation):

```powershell
irm https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.ps1 | iex
```

To **install a specific release**:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.ps1))) -Version v0.7.0
```

### Packages

The `.deb`, AppImage, `.msi` and `.exe` files are also on the
[Releases](https://github.com/WillIsback/Syntheo/releases) page. Each release
publishes `SHA256SUMS` and `SHA256SUMS-windows`, plus a provenance attestation
you can check with `gh attestation verify`.

### macOS

macOS packages are not published yet. Meanwhile, you can build the app from
source: [CONTRIBUTING.md › Building from source](CONTRIBUTING.md#construire-depuis-les-sources).

## Development

- Desktop: `apps/desktop` (Tauri 2, React 19, TypeScript, Vite, Tailwind).
- Rust: `crates/` and `plugins/` (audio capture, speech-to-text adapters,
  SQLite, Jinja prompt templates).
- Architecture (capture and inference flows, storage, guarantees):
  [architecture](https://docs.syntheo.studio/en/architecture).
- Contributing, commit conventions and CI gates (in French):
  [CONTRIBUTING.md](CONTRIBUTING.md).

## Why tea?

Syn·thé·o: what gathers around tea. In Japan, a _chakai_ (茶会) is a tea
gathering in a closed room, and a _kaiki_ (会記) is the notebook a guest keeps of
it. Like a _kaiki_, your write-up starts from your own notes. A meeting happens
only once (一期一会, _ichi-go ichi-e_): the audio is never kept, only the note
remains. Read [the story behind the name](https://docs.syntheo.studio/en/philosophy).

## Origin

Syntheo is an independent project derived from
**[Anarlog](https://github.com/fastrepl/anarlog)** (Fastrepl, Inc., MIT
licence), imported at revision `a0d5bd0` on 2026-10-24 into a new repository.
Thanks to the Anarlog team for this open-source foundation. What was kept,
removed and changed is detailed in [NOTICE.md](NOTICE.md). Syntheo is neither
affiliated with nor endorsed by Fastrepl.

Syntheo succeeds [Syntheo-web](https://github.com/WillIsback/Syntheo-web), an
earlier web generation of the project.

## Licence

[MIT](LICENSE): © 2026 William Derue (Syntheo), © 2023 Fastrepl, Inc. (original code).
