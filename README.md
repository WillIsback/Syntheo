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
    Realtime), NVIDIA NeMo-Speech.cpp (WebSocket), `/v1/audio/transcriptions`.
    No server yet? A ready-to-use Docker image runs one on your computer:
    [install the local transcription service](https://docs.syntheo.studio/en/local-transcription-service);
  - language model: OpenAI-compatible API (vLLM, SGLang, llama.cpp, Ollama,
    LM Studio, TGI, MLX).
- **No audio kept**: it only lives in memory while it is transcribed. Only the
  transcript and the note are saved, locally.
- **No account, no subscription, no telemetry.**

Data, network flows and GDPR responsibilities:
[GDPR compliance](https://docs.syntheo.studio/en/conformite/rgpd).

## Syntheo and other meeting notepads

This table only keeps points where Syntheo made a different choice. It is not
a ranking: these tools also do things Syntheo does not,
[listed below](#what-the-others-do-and-syntheo-does-not). Checked on
28 November 2026 against each vendor's public documentation and repositories.

✅ yes · 🟡 partly · ❌ no

|                                                              | Syntheo | Granola | Anarlog | OpenWhispr | Meetily |
| ------------------------------------------------------------ | :-----: | :-----: | :-----: | :--------: | :-----: |
| Open-source application                                      |   ✅    |   ❌    |   ✅    |     ✅     |   ✅    |
| Every feature free, no paid plan                             |   ✅    |   ❌    |   ❌    |     ❌     |   ❌    |
| Works without an account                                     |   ✅    |   ❌    |   ✅    |     ✅     |   ✅    |
| No telemetry in the app                                      |   ✅    |   ❌    |   ❌    |     🟡     |   🟡    |
| No built-in cloud AI service                                 |   ✅    |   ❌    |   🟡    |     ❌     |   🟡    |
| No meeting audio kept                                        |   ✅    |   ✅    |   ❌    |     ✅     |   ❌    |
| Linux build                                                  |   ✅    |   ❌    |   ✅    |     ✅     |   🟡    |
| MSI installer for Windows fleets                             |   ✅    |   ❌    |   ❌    |     ❌     |   ✅    |
| Self-hosted transcription service, shipped as a Docker image |   ✅    |   ❌    |   ❌    |     ❌     |   ❌    |
| Interface and write-up templates in French                   |   ✅    |   ❌    |   ❌    |     ✅     |   ❌    |
| Thread across meetings and a proposed agenda                 |   ✅    |   🟡    |   🟡    |     🟡     |   ❌    |
| Your notes told apart from AI text inside the write-up       |   ✅    |   ✅    |   🟡    |     🟡     |   🟡    |
| Free local access for agents (CLI and MCP)                   |   ✅    |   ❌    |   ✅    |     🟡     |   ❌    |

<details>
<summary>Details for each row, with sources</summary>

- **Open source.** Granola is proprietary. Anarlog is MIT-licensed, except its
  `enterprise/` folder, under a commercial licence
  ([LICENSING.md][cmp-a-licensing]). The OpenWhispr app is MIT-licensed; its
  cloud service is not published ([README][cmp-o-readme]). Meetily publishes an
  MIT community edition next to a closed Pro edition ([README][cmp-m-readme]).
- **No paid plan.** Granola: a free plan limited to 30 days of history, then
  $14 per user per month ([plans][cmp-g-billing]). Anarlog: Pro at $14 per
  person per month for cloud, sync, sharing and teams ([teams][cmp-a-teams]).
  OpenWhispr: free unlimited local use, Pro at $8 per month
  ([plans][cmp-o-plans]). Meetily: free community edition, Pro at $10 per user
  per month ([README][cmp-m-readme]).
- **No account.** Granola requires a Google or Microsoft account
  ([getting started][cmp-g-setup]). Anarlog and OpenWhispr work locally without
  one. For Meetily, no sign-in was found in the community edition: the cell is
  counted in its favour.
- **Telemetry.** Granola's privacy policy provides for analytics tools
  ([policy][cmp-g-privacy]). Anarlog shares usage data by default, with a
  setting to turn it off ([data][cmp-a-privacy]). OpenWhispr and Meetily ship
  telemetry that is off by default and that the user can turn on
  ([OpenWhispr][cmp-o-strings], [Meetily][cmp-m-privacy]). In Syntheo, that
  code is removed.
- **Cloud AI.** Syntheo only talks to the servers you or your organization
  configure: no provider is built in. If you choose a server run by a third
  party, your data goes there. Granola transcribes and writes in its cloud
  ([the vendor's explanation][cmp-g-cloud]). Anarlog offers its cloud (Pro) and
  bring-your-own-key providers next to local models, with nothing preselected
  ([models][cmp-a-models]). OpenWhispr uses its cloud by default after
  onboarding, with a fully local mode available
  ([network flows][cmp-o-network]). Meetily is local by default, with optional
  cloud providers for summaries ([README][cmp-m-readme]).
- **Audio.** Granola caches audio while its cloud transcribes it, then deletes
  it ([FAQ][cmp-g-faq]). OpenWhispr states that meeting audio is never stored
  ([interface strings][cmp-o-strings]). Anarlog and Meetily record it by
  default, with a setting to avoid it ([Anarlog][cmp-a-privacy],
  [Meetily][cmp-m-rec]).
- **Linux.** Granola runs on macOS, Windows, iOS and Android
  ([getting started][cmp-g-setup]). Anarlog's Linux build is in beta
  ([installation][cmp-a-install]). Meetily publishes installers for Windows and
  macOS; on Linux it is built from source ([README][cmp-m-readme]).
- **MSI.** Granola, Anarlog and OpenWhispr publish an EXE installer
  ([Granola][cmp-g-managed], [Anarlog][cmp-a-install],
  [OpenWhispr][cmp-o-builder]); Meetily publishes an MSI
  ([version 0.5.0][cmp-m-release]). Anarlog and OpenWhispr also have
  administrator-enforced settings.
- **Transcription service provided.** Syntheo publishes the
  `ghcr.io/willisback/syntheo-transcription` image, to run on one computer or
  on a shared server. Anarlog accepts a self-hosted server but does not provide
  one. In OpenWhispr, meeting notes cannot use a self-hosted server yet
  ([interface strings][cmp-o-strings]). Meetily's former server is archived
  ([backend][cmp-m-backend]). OpenWhispr and Meetily transcribe inside the app,
  with no server.
- **French.** All of them transcribe French. Granola's interface is in English
  ([languages][cmp-g-lang]). Anarlog's is almost entirely in English: 15
  messages translated out of 1,628 on the day of the check
  ([catalogue][cmp-a-fr]). OpenWhispr's is fully translated
  ([catalogue][cmp-o-fr]). Meetily's is in English
  ([open request][cmp-m-i18n]), and the summary language can be set.
- **Thread across meetings.** Granola prepares pre-meeting briefs on its
  Business and Enterprise plans ([briefs][cmp-g-briefs]). Anarlog finds related
  meetings on demand, in the Pro plan's chat ([chat][cmp-a-chat]). OpenWhispr
  has folders and search, without a project thread. Meetily has no folders
  ([open request][cmp-m-folders]).
- **Provenance.** Granola shows what comes from your notes in black
  ([notes][cmp-g-notes]). Anarlog, OpenWhispr and Meetily separate your notes
  and the summary into tabs ([Anarlog][cmp-a-notes],
  [Meetily][cmp-m-workspace]).
- **Agents.** Granola's MCP server is remote and tied to the account
  ([MCP][cmp-g-mcp]). Anarlog's CLI and MCP server are local and free
  ([MCP][cmp-a-mcp]). OpenWhispr has a local CLI ([CLI][cmp-o-cli]); its MCP
  server is remote and listed with the paid features ([MCP][cmp-o-mcp]). At
  Meetily, the MCP server, the CLI and the API are Pro features
  ([MCP][cmp-m-mcp]).

</details>

### What the others do, and Syntheo does not

- **macOS and mobile.** All four have a macOS build, and Granola has iOS and
  Android apps. Syntheo is only published for Linux and Windows.
- **Built-in language model.** OpenWhispr and Meetily write the summary offline
  with nothing else to install. Syntheo has transcribed on the computer since
  version 0.8.0, but the write-up needs a language-model server, Ollama for
  example.
- **Calendars, sharing, sync, SSO.** Granola and Anarlog connect to calendars,
  share notes and manage teams. Syntheo connects to no calendar and syncs
  nothing.

Found a mistake in this table? [Open an issue](https://github.com/WillIsback/Syntheo/issues/new/choose).

## Installation

### Linux: one-line script (AppImage)

```bash
curl -fsSL https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.sh | bash
```

The script downloads the latest release's AppImage into `~/.local/bin`, checks
its SHA256 checksum, saves it as `Syntheo.AppImage` and creates the `syntheo`
link. Reinstalling replaces the previous version.

To **try a specific release**, replace `vX.Y.Z` with a tag from the
[Releases](https://github.com/WillIsback/Syntheo/releases) page:

```bash
curl -fsSL https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.sh | bash -s -- --version vX.Y.Z
```

> On **Arch / Omarchy**, the AppImage needs FUSE 2: `sudo pacman -S fuse2`.
> An older `Syntheo-<version>.AppImage` install is removed along the way.

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

To **install a specific release**, replace `vX.Y.Z` with a tag from the
[Releases](https://github.com/WillIsback/Syntheo/releases) page:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.ps1))) -Version vX.Y.Z
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
