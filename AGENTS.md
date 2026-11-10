# Overview

Syntheo Desktop is a pnpm and Rust workspace (Tauri 2 desktop app), derived from Anarlog (see `NOTICE.md`). Read the nearest `AGENTS.md` before changing a component; nested files inherited from Anarlog may still mention removed services.

- `apps/desktop/`: Tauri 2 with React, TypeScript, Vite, and Tailwind. Zustand owns UI state; TanStack Query/Form own queries, mutations, and forms.
- `crates/db-app/`: SQLite schema and migrations. New migrations are timestamped after the last existing one.
- `crates/owhisper-client/`: STT adapters. Only on-premise protocols are allowed (OpenAI Realtime, vLLM Realtime, NVIDIA NIM WebSocket/gRPC, OpenAI-compatible batch).
- `crates/template-app/`: Jinja prompt templates (enhance).
- `design/refonte-the-vert/`: UI redesign in progress ("Thé vert" identity, "document vivant" note flow). Read its `README.md` before any UI change: it defines the target design, the work lots and the clickable mockups.

Project rules (see `docs/fr/architecture.mdx`):

- Inference only through user-configured on-premise endpoints; never add a cloud provider or a cloud integration.
- Audio is never written to disk, not even temporarily.
- No telemetry, account, or billing code.
- User-facing text is French first.
- Commits and PR titles follow Conventional Commits; PRs reference an issue (`Closes #N`).

Testing while developing (several agents often share one machine):

- Run only the tests your change touches: `pnpm -C apps/desktop exec vitest related --run <changed files>` (or `vitest run --changed origin/main`). Always pass `--run`: without it vitest stays in watch mode.
- Rust: `cargo test -p <crate>` / `cargo clippy -p <crate>`, never the whole workspace while iterating.
- Run the full suite once, before the final commit; CI runs it again on the PR.

## Documentation knowledge graph (Mintlify)

Two tools, two jobs:

- **CodeGraph** is for code tasks: locating symbols, tracing calls, impact of an edit.
- **The `syntheo-docs` MCP server** (`https://docs.syntheo.studio/mcp`, declared in `.mcp.json`) searches the published docs, including the code map under `docs/fr/code/` ("Carte du code"). Use it to keep documentation current.

When a change alters user-visible behavior, a CLI/MCP contract, or adds/renames/removes a crate, plugin, package, or top-level module:

1. Search `syntheo-docs` (or read `docs/fr/code/doc-map.mdx`) for the pages tied to the changed paths.
2. Update those pages in `docs/en/` and `docs/fr/` in the same PR, plus the zone page in `docs/fr/code/` if the unit inventory changed.
3. Follow `docs/AGENTS.md` for writing rules and verification.

The MCP server reflects the last deploy of `main`; for unmerged changes read `docs/` directly.
