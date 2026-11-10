# Syntheo documentation instructions

## Scope

- This is the Mintlify project published at `https://github.com/WillIsback/Syntheo/tree/main/docs`.
- Write for Syntheo users, developers, and agents using the CLI or MCP server.
- Configuration lives in `docs.json`; content pages are MDX.
- The public agent skill is served from `skill.md`. Keep its workflow aligned with the packaged skill in `../skills/syntheo/`.

## Sources of truth

- Treat `apps/cli/src/cli.rs` as the CLI command contract.
- Treat `apps/cli/src/mcp/` as the MCP tool and resource contract.
- Treat current release automation as the source of truth for installation channels.
- Do not infer product behavior from the raw SQLite schema.

## Writing

- Use active voice and second person.
- Keep headings and sentences concise.
- Put the result before implementation detail.
- Use `Syntheo` for the product and `syntheo` for the executable.
- Use root-relative links between Mintlify pages. Use `https://github.com/WillIsback/Syntheo/tree/main/docs` in external instructions and agent metadata.

## Accuracy boundaries

- Document only commands, options, tools, resources, and output behavior present in the source.
- Mark planned features and distribution channels as forthcoming.
- Never describe Homebrew, standalone release binaries, or Windows package-manager installation as available until release automation publishes them.
- Document desktop-bundled CLI installation only for platforms whose release workflow includes the CLI sidecar and installer UI.
- Never tell users or agents to read, migrate, or modify the SQLite database directly.
- Keep transcript examples bounded. CLI and MCP transcript pages default to 200 words and cap at 500 words.

## Verification

- Check `docs.json` after adding or moving a page.
- Run `pnpm exec dprint fmt 'docs/**/*' 'skills/**/*'` from the repository root.
- Run `pnpm exec dprint check 'docs/**/*' 'skills/**/*'` before submitting.
- Run `mint validate` and `mint broken-links --check-anchors --check-redirects` from `docs/` before deploying.

## Code map

- `code/` is the codebase knowledge graph ("Carte du code" tab). It maps apps, plugins, crates, and packages to their role, dependencies, and the user pages they affect.
- `code/doc-map.mdx` maps each user page to its source paths. Update it when a page's sources move or a new page is added.
- Keep `code/` factual and source-verified like the rest of the docs; it does not replace `architecture.mdx`.

## Interactive app reproductions

- `snippets/*.gen.jsx` hold React components that reproduce app screens. They are generated: edit the templates in `scripts/docs-ui/`, then run `node scripts/sync-docs-ui.mjs` from the repository root. `apps/desktop/src/docs-ui.test.ts` fails when a snippet drifts from the app's tokens, French labels, or icons, or when a label no longer exists.
- `scripts/docs-ui/config.json` lists the shared templates (in every snippet) and the templates of each snippet. Mintlify snippets cannot import another snippet or JSON, so every snippet is self-contained.
- Shared components, importable from any snippet: `<SettingsPath>`, `<Kbd>`, `<AppSettings section="…" focus="…">` (Settings screen; sections `meetings`, `transcription`, `intelligence`, `app`, `dictation`, `privacy`, `permissions`), `<AppPalette demo="recherche-contenu" | "dossier">` (Ctrl+K palette).
- Page components: `app.gen.jsx` (`<AppScreen>`, `<Capsule>`), `start.gen.jsx` (`<AppHome>`), `capture.gen.jsx` (`<DictationScreen>`, `<AutoCaptureScreen>`, `<ImportScreen>`), `organize.gen.jsx` (`<NoteActions>`, `<FolderPage>`, `<TemplatesEditor>`, `<ContactsScreen>`), `assist.gen.jsx` (`<AskNote>`, `<AutomationEditor>`, `<Troubleshooter>`, `<DataFlows>`). `code/doc-map.mdx` (section "Reproductions interactives") maps each component to its template and to the app sources it reproduces: update the template when those sources change.
- A page imports from one snippet only, with a single import line.
- In templates, every displayed app label goes through `L("English msgid")` (`LP` for plurals, `LF` for variables) and every icon through `I("Name")` from `packages/ui/src/components/icons-*.tsx`; the generator rejects unknown labels and icons. Labels with a `msgctxt` are not supported. Use only `var(--syn-…)` colors.
- Never write a JSX tag for an internal component (`<SynFigure>`): call `h(SynFigure, props, ...children)`. Mintlify splits a snippet by the page's imports and only resolves JSX tags within each part; the generator rejects `<Syn…>` tags. Do not combine `??` with `&&` or `||` in one expression, even with parentheses: Mintlify's parser rejects `(a ?? b) && c`; use a ternary.
- Use at most two reproductions per page (`<SettingsPath>` and `<Kbd>` do not count), where the reader must find a button or a setting. Keep the page's text complete: the components render in the browser and are not indexed by search or the `syntheo-docs` MCP server. Use sample data only, real buttons and fields, keyboard support, and visible focus.
- `<SettingsPath steps={[...]}>` takes French UI labels exactly as the app shows them; the generator rejects any step that is not in `messages.po`.
- Update `scripts/docs-ui/config.json` (`version`) with each release.
