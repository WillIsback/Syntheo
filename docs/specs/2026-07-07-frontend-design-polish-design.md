# Frontend design polish — alignment with `syntheo_ui.html`

**Date / Date:** 2026-07-07
**Issue:** TBD (open before implementation)
**Scope / Périmètre:** Restructure and restyle the application UI (`app/`, `components/`) to
match the layout, spacing, and typography of the reference mockup
`docs/specs/syntheo_ui.html`, and add responsive breakpoints. No backend/API changes.

---

## Goal / Objectif

FR: L'IHM actuelle est un squelette fonctionnel mais peu abouti (padding/marges serrés,
pas de réactivité, structure simplifiée). Rapprocher le rendu du mockup de référence :
mieux centré, mieux espacé, layout en colonnes, typographie « document ».

EN: The current UI is a working skeleton but under-polished (cramped padding/margins, no
responsiveness, simplified structure). Bring the rendering closer to the reference mockup:
better centered, better spaced, column layout, "document" typography.

## Constraints / Contraintes

- **No fabricated data.** The mockup shows a waveform, WER %, session titles, highlight
  spans, notification/app-grid icons. We have none of these (audio is never persisted per
  RGPD; sessions have no title column; no confidence score). We render only what real data
  supports and derive the rest client-side from existing segment data.
- **No new backend surface.** No new API routes, no schema changes, no per-session
  delete/export endpoint. Transcript export is client-side download.
- **RGPD/IA Act invariants preserved.** The "AI-generated" disclaimer stays permanently
  visible on transcripts and reports. No audio stored client-side.
- **Bilingual labels.** All UI text stays French AND English, as today.
- **Design tokens from `docs/agents/frontend.md`** (colors, radius) are the source of truth.

## Non-goals / Hors périmètre

Waveform / audio scrubber, colored highlight spans inside transcript text, session titles,
notification bell, app-grid icon, per-session delete/export API, fabricated stats (WER %).

---

## Architecture

The app is a Next.js App Router application. The protected area uses a shared layout
(`app/(protected)/layout.tsx`) composing a sidebar + header + main content. This work
touches four layers:

1. **Design tokens** — `app/globals.css`
2. **App shell** — `components/layout/` (header → topbar, sidebar, new `app-shell` for
   shared mobile-drawer state)
3. **Session detail** — `app/(protected)/sessions/[id]/page.tsx` + `transcript-view`,
   `report-view`, and a new right-hand stats panel component
4. **Peripheral pages** — sessions list, consent dialog, record, account (restyle only)

### Component boundaries

| Unit | Purpose | Depends on |
|------|---------|-----------|
| `app-shell.tsx` (new, client) | Holds mobile drawer open/closed state; renders Topbar + Sidebar + `<main>` slot | `header`, `sidebar` |
| `header.tsx` → topbar | Logo, nav tabs, avatar, hamburger (mobile) | drawer toggle from shell |
| `sidebar.tsx` | New-session button, recent sessions list, footer | recent sessions (server prop) |
| `transcript-view.tsx` | Card-based transcript blocks, speaker rename chips, disclaimer | `speaker-chip` |
| `session-panel.tsx` (new, client) | Speaker cards w/ derived share, stats grid, quick actions | derived from segments |
| `report-view.tsx` | Report card (below transcript in same column) | AI SDK `useCompletion` |

`session-panel` and the doc-meta (participant count, duration, word count, turn count) are
**pure derivations** from `Segment[]`: participants = distinct speakers; duration =
`max(end)`; words = sum of tokenized text; turns = segment count; per-speaker share =
speaker talk-time ÷ total talk-time. No new data fetched.

---

## Design details

### 1. Tokens (`app/globals.css`)

Add to `:root`:
- Spacing scale: `--space-1:4px … --space-8:64px`.
- `--font-serif: Georgia, "Times New Roman", serif` (document body).
- Layout widths: `--sidebar-w:264px`, `--panel-w:256px`, `--doc-max-w:820px`,
  `--topbar-h:56px`.

Components consume these instead of ad-hoc Tailwind values, keeping padding/margins
consistent across the app.

### 2. App shell

- **Topbar** (56px): logo (blue icon + "Syntheo" wordmark), nav tabs (Sessions / Compte)
  with active state, avatar initial. Hamburger button visible only `<768px`.
- **Sidebar** (264px): "Nouvelle session / New session" pill; "Récentes / Recent" section
  listing last ~6 sessions (server-fetched in protected layout, passed as prop) with active
  highlight on current session id; existing France-hosting footer.
- **Responsive:** `<768px` the sidebar is `position: fixed` off-canvas, slid in/out via the
  shell's state, with a dimmed backdrop. `AppShell` is a thin client wrapper owning
  `drawerOpen` so topbar hamburger and sidebar share it. The protected layout fetches recent
  sessions server-side and passes them into `AppShell`.

### 3. Sessions list page

Kept as the full list (the sidebar is quick-access; this page is the browsable archive).
Restyle with token spacing, generous centered column (`--doc-max-w`), improved empty state,
responsive card layout (single column that breathes on mobile, comfortable on desktop).

### 4. Session detail — main restructure

From cramped 2-col grid → **single centered document column (`--doc-max-w`) + right stats
panel (`--panel-w`)**:

- **Doc header:** session date as title, meta row (participants · duration · words), doc
  action buttons kept minimal (Exporter transcription — client download).
- **AI disclaimer bar** (restyled, existing content).
- **Transcript blocks:** one card per turn — speaker color dot + name (rename chip),
  timestamp, serif body text (`--font-serif`), hover border highlight. Grouped under
  segment/time headers is optional polish; base requirement is clean per-turn cards.
- **Report card** rendered **below** transcript in the same scrollable column (fixes the
  "not centered / side-by-side cramped" complaint).
- **Right panel** (`session-panel.tsx`): speaker cards (avatar initials, name, derived
  share %), a 2×2 stats grid (duration / participants / words / turns), quick actions
  (Exporter transcription client-side; link to /account for export & delete). Hidden
  `<1280px`; its content renders inline **below** the report on narrow screens.
- **Responsive:** `≥1280px` → document column + right panel; `768–1280px` → document column
  only, panel content inline below; `<768px` → stacked, drawer sidebar.

### 5. Consent dialog & record page

Functionally unchanged. Apply spacing tokens, tighten typography, make the record page's
centered mic-button layout responsive.

### 6. Account page

Restyle cards to match session-panel card treatment for visual consistency. No functional
change.

---

## Data flow

Unchanged from today. Server components fetch sessions/detail with RLS-scoped DB client and
pass plain data to client components. New derivations (stats, shares) computed in client
components from already-fetched `Segment[]`. Recent-sessions for sidebar fetched once in the
protected layout server component.

## Error handling

No new failure modes. Empty/missing transcription and report states already handled and are
preserved (empty states restyled, not removed). Client-side export guards against empty
transcript.

## Testing

- Existing API route tests untouched (no API change).
- Manual/visual verification against the mockup at three widths: `<768`, `768–1280`,
  `≥1280`. Verify: no horizontal body scroll, document column centered, disclaimer visible
  on transcript and report, sidebar drawer toggles on mobile, derived stats match segment
  data.
- Lint/typecheck (`biome`, `tsc`) must pass.

## Rollout

Single branch off `main` per contribution process, one PR. Security validation required
(touches a data-display flow, though no data/auth logic changes). Docs-site update if a user
flow visibly changes (layout only — confirm with orchestrator).
