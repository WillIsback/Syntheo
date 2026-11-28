---
title: "Syntheo Desktop and the GDPR"
sidebarTitle: "GDPR compliance"
description: "Stored data, network flows, technical safeguards and user responsibilities."
---

Reference document for a person or an organization assessing Syntheo
Desktop. It is updated with every change to network flows or storage.

**Principle**: Syntheo Desktop is a local client. It has no server, no central
database and no account, and sends no telemetry. The vendor accesses no data and is
not the data controller: the user is, on their own computer.

> **Status as of 2026-10-26:** audio never touches the disk anymore, on any
> path. Meeting capture, dictation, importing and dropping an audio file, as
> well as the internal splitting of batch processing, work entirely in
> memory; the imported file is read where it is, without a copy in the data
> folder.
>
> **Providers**: only the endpoints the user or their organization configures;
> no cloud provider is built in. Transcription speaks the OpenAI
> and NVIDIA NeMo-Speech.cpp protocols; the summary, the chat and the template
> generator speak to a single configured LLM endpoint, an OpenAI-compatible API
> (vLLM, Ollama, llama.cpp server…).

## Stored data

Everything is stored on the computer, in the app's data folder (`syntheo`
under the user's data directory, for example `~/.local/share/syntheo` on
Linux).

| Data                                     | Where                                                                                                                                     | Retention                     | Deletion                                                                                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transcripts (text, timestamps, speakers) | local SQLite database `app.db`                                                                                                            | until the user deletes them   | deleting the meeting in the app removes it from the app and from search; its content stays in `app.db`. To erase it permanently today, delete the data folder (a real purge is planned) |
| Notes and generated summaries            | local SQLite database                                                                                                                     | same                          | same as transcripts                                                                                                                                                                     |
| Contacts, folders, settings              | local SQLite database                                                                                                                     | same                          | deleting the data folder                                                                                                                                                                |
| Inference endpoint API keys              | system keychain (Keychain, Secret Service, Credential Manager); never in plain text in the database                                       | until the provider is deleted | removing the provider in the settings                                                                                                                                                   |
| Full-text search index (tantivy)         | data folder (indexed copy of transcripts and notes)                                                                                       | as long as the meetings exist | follows meeting deletion, or deleting the data folder                                                                                                                                   |
| Technical logs `app.log`                 | the app's log folder; content filtered by a masking module (`RedactingWriter`), size-based rotation                                       | automatic rotation            | deleting the log folder                                                                                                                                                                 |
| Exports (Markdown, etc.)                 | export folder chosen by the user                                                                                                          | under the user's control      | deleting the exported files                                                                                                                                                             |
| Meeting audio                            | **never on disk**: in memory just long enough to be sent to the STT endpoint; a transcription outage leaves a dated gap in the transcript | —                             | —                                                                                                                                                                                       |
| Dictation or import audio                | **never on disk**, not even temporarily: dictation produces a WAV in memory, import reads the file where it is without a copy             | —                             | —                                                                                                                                                                                       |

None of this data is sent to the vendor.

**On-device inference, only if the user installs the models**: by default,
the app runs no model (transcription, LLM, diarization or voiceprints). The
on-device transcription program, `syntheo-speech`, ships with the app but only
runs if the user chooses the optional "On this computer" source and installs
its models (about 1.1 GB) in `speech/models` of the app data folder; the
commissioning result is in `speech/commissioning.json`. The program
transcribes the recording audio in memory, on the loopback, writing no audio
and logging no text. The models are removed with **Remove the models** or with
the data folder. The managed settings `on_device_transcription_enabled`
(forbid the source) and `speech_models_urls` (require a model mirror) are
available to the organization. See
[Transcribe on this computer](/en/on-device-transcription). An earlier version may have left model files in the
`models/stt`, `models/llm` and `models/aec` (echo cancellation models, now
shipped with the app) folders of the data folder, as well as in the
Soniqo model cache on macOS: they are no longer read or loaded, and can be
deleted by hand. Voiceprints that an earlier version may have saved (vectors
in the system keychain, references in the `voiceprint_exemplars` and
`voiceprint_candidates` tables) are erased at startup; if the keychain refuses
a deletion, erasure is retried at the next launch.

## Network flows

- **On-device transcription** (optional "On this computer" source): the
  recording audio goes to the `syntheo-speech` program, on the computer's
  loopback (`127.0.0.1`), after mutual authentication; nothing leaves the
  computer, and the program opens no outbound connection. For an "On this
  computer" recording, no audio goes to the server, not even to repair a
  dropped passage.
- **Download of the on-device transcription models**, only when the user
  chooses **Download the models**: HTTPS requests for the model files to
  Syntheo's GitHub release (`github.com`, redirected to
  `release-assets.githubusercontent.com`), then to Hugging Face
  (`huggingface.co`, redirected to its content servers under `hf.co`, for
  example `cas-bridge.xethub.hf.co`) as a fallback, or to the mirror set by
  the administrator (`speech_models_urls`) instead; HTTPS redirects are
  followed (5 at most), including the mirror's redirects to another host. No meeting data is sent; these hosts see the
  computer's IP address. No flow if the models are installed from a folder.
  The administrator turns this flow off, with the whole module, through the
  key `on_device_transcription_enabled` set to `false` in
  `managed_settings.json`.
- **Inference endpoints configured by the user**: ASR
  (OpenAI protocol: Realtime and `/v1/audio/transcriptions`; NVIDIA
  NeMo-Speech.cpp: WebSocket `/v1/audio/transcriptions/realtime`) and the
  configured LLM endpoint (OpenAI-compatible API). Capture
  audio and text (transcript, notes, prompts) go through them, with no device
  fingerprint or task identifier in the headers. An unrecognized transcription
  URL is handled with the OpenAI protocol, never redirected to a third-party
  service.
- **TLS recommended** as soon as the endpoint is not on the machine or a trusted
  network (for example through a reverse proxy or a VPN). The app accepts
  plain HTTP only toward a private host (local machine, local network,
  Tailscale range, `.local` names), after confirmation outside the machine,
  and requires HTTPS elsewhere.
- **Webhooks configured by the user**, off until an address is entered:
  - local API webhooks (Settings → Developers): when a meeting ends
    (`meeting.completed`) or a summary is produced (`note.enhanced`), a
    signed `POST` request (HMAC-SHA256) to the address entered, carrying the
    note, the summaries, the participants, the action items and the full
    transcript text;
  - the "Send to an address (webhook)" automation step: the JSON body the
    user writes, which can include the same data, to the address entered,
    without a signature.
  - in both cases, the recipient is the address the user chose
    (`http://` or `https://`). Unlike the endpoints, HTTPS is not required:
    prefer HTTPS or a private network.
- An endpoint run by a third party becomes the **user's processor**
  (Art. 28 GDPR): contract and data location to be checked.
- **Other flows, apart from inference**:
  - update check: 15 seconds after startup, on by default, can be turned off
    by the user or by the administrator (`managed_settings.json`, key
    `automatic_updates` set to `false`), and at any time on the user's
    request, even when the startup check is off. **Unauthenticated** read of
    `latest.json`
    (`github.com/WillIsback/Syntheo/releases/latest/download/latest.json`,
    redirected by GitHub to its content servers), which also carries the new
    version's release notes; those of the installed version are included in
    the app. No personal data sent; GitHub sees the computer's IP address;
  - download of the installer of an update, only when the user asks for it:
    file from the GitHub release named in `latest.json`, whose signature is
    checked before installation;
  - on-device transcription models: see above (on click only, turned off by
    `on_device_transcription_enabled`);
  - echo cancellation models: bundled with the app, no download.
- **No account, no sync, no error reports, nothing installed without the
  user's action** (the built-in update, AppImage and Windows installer,
  installs on request with a signed installer; .deb and MSI: link to GitHub
  Releases).
- No calendar or task integration: Apple Calendar, Reminders and the legacy
  hosted integrations (Google and Outlook calendars, Linear, GitHub) are
  removed from the code.

## Technical safeguards

- **No account or authentication**: the legacy authentication code
  (Supabase, `auth` plugin) is deleted.
- **No telemetry, no error reports**: the analytics code (PostHog) and error
  reporting code (Sentry) are **removed** (`crates/analytics`,
  `plugins/analytics`, dependencies `posthog-rs`, `sentry`, `@sentry/react`),
  as well as the device identifier that existed only for telemetry. There is
  nothing left to turn off.
- **Keys in the system keychain**, not in the database.
- **No audio on disk, on any path**: the capture session no longer starts a
  recorder, retention is fixed to "none" and a Rust test checks that no audio
  file appears in the session folder; no player, no re-transcription, no
  voiceprints. Dictation produces a WAV in memory, importing and dropping a
  file transcribe from where the file is without a copy, and batch splitting
  happens in memory.
- **Safeguard in the tests**: `apps/desktop/src/no-cloud-imports.test.ts`
  fails if a removed cloud or authentication module is imported again.
- **End-to-end check**: a network capture during a complete session must show
  only the configured inference endpoints and the flows listed above; any
  other flow is treated as a vulnerability (see `SECURITY.md`).

## User responsibilities

- **Inform participants** before recording a meeting (Art. 13 and 14
  GDPR). In France, recording a private conversation without the participants'
  knowledge is punishable under Article 226-1 of the Penal Code; in a company,
  employees must be informed. When each capture starts, the app shows a
  reminder to inform participants; it is on by default and can be turned off
  in Settings → Meetings ("Remind participants about recording").
- **Choose the inference endpoints** and take responsibility for the
  processing: a self-hosted endpoint stays under the user's control; a
  third-party endpoint is a processor. For a server provided by the
  organization, including Albert API for French State administrations, see
  [Server provided by your organization](/en/organization-server).
- **Manage the retention period** of transcripts and notes, and delete them
  when they are no longer needed. Deleting a meeting in the app removes it
  from the app and from search, but its content stays in the local database.
  To erase it permanently today, delete the data folder; a real purge is
  planned.
- **Data protection impact assessment (DPIA)**: to be considered by an
  organization that deploys the tool at scale or for sensitive meetings
  (Art. 35 GDPR).
- **Protect the computer** (disk encryption, locked session): the data is
  stored there in plain text in the local database.
