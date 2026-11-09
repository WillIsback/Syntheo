// <AppPalette> : la palette Ctrl+K, apps/desktop/src/shared/open-note-dialog.tsx
// et palette-search-groups.tsx (recherche dans le titre puis le contenu,
// dossiers en tête, Tab pour chercher dans un dossier, Retour arrière pour en
// sortir, Échap pour fermer). Données d'exemple seulement.

const SYN_CSS_PALETTE = `
.syn-pal-stage{position:relative;min-height:470px;padding:56px 16px 24px;background:color-mix(in srgb,var(--syn-background) 60%,var(--syn-muted))}
.syn-pal{max-width:520px;margin:0 auto;border:1px solid var(--syn-border);border-radius:16px;background:var(--syn-popover);box-shadow:var(--syn-shadow-capsule);overflow:hidden}
.syn-pal-head{display:flex;align-items:center;gap:12px;border-bottom:1px solid color-mix(in srgb,var(--syn-border) 60%,transparent);padding:12px 16px;color:var(--syn-muted-foreground)}
.syn-pal-head input{flex:1;min-width:0;border:0;background:transparent;color:var(--syn-foreground);font:400 14px/1.4 Geist,system-ui,sans-serif;outline:none}
.syn-pal-head input::placeholder{color:var(--syn-muted-foreground)}
.syn-pal-chip{display:flex;align-items:center;gap:4px;max-width:45%;border:0;border-radius:6px;background:var(--syn-accent);color:var(--syn-accent-foreground);padding:2px 6px;font:500 12px/1.3 Geist,system-ui,sans-serif;cursor:pointer}
.syn-pal-close{display:grid;place-items:center;width:20px;height:20px;border:0;border-radius:999px;background:color-mix(in srgb,var(--syn-accent) 80%,transparent);color:var(--syn-muted-foreground);cursor:pointer;padding:0}
.syn-pal-list{max-height:330px;overflow-y:auto;padding:8px}
.syn-pal-heading{padding:6px 8px;font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--syn-muted-foreground)}
.syn-pal-divider{height:1px;margin:6px 8px;background:var(--syn-accent)}
.syn-pal-item{display:flex;align-items:center;gap:8px;border-radius:8px;padding:7px 8px;font-size:14px;color:var(--syn-foreground);cursor:pointer}
.syn-pal-item svg{color:var(--syn-muted-foreground)}
.syn-pal-item[aria-selected=true]{background:var(--syn-accent)}
.syn-pal-item .syn-pal-meta{margin-left:auto;flex-shrink:0;font-size:12px;color:var(--syn-muted-foreground)}
.syn-pal-folder{display:inline-flex;align-items:center;gap:4px;max-width:45%;border-radius:6px;background:var(--syn-muted);padding:0 6px;font-size:12px;color:var(--syn-muted-foreground)}
.syn-pal-snippet{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--syn-muted-foreground)}
.syn-pal-snippet mark{background:color-mix(in srgb,var(--syn-primary) 22%,transparent);color:inherit;border-radius:2px}
.syn-pal-empty{padding:22px 12px;text-align:center;font-size:14px;color:var(--syn-muted-foreground)}
.syn-pal-foot{display:flex;flex-wrap:wrap;gap:16px;border-top:1px solid color-mix(in srgb,var(--syn-border) 60%,transparent);padding:8px 16px;font-size:12px;color:var(--syn-muted-foreground)}
.syn-pal-foot kbd{font:inherit;font-weight:500}
`;

const SYN_PAL_FOLDERS = [
  { path: "Produit/Roadmap", count: 12 },
  { path: "Recrutement", count: 5 },
  { path: "Juridique", count: 3 },
];

const SYN_PAL_NOTES = [
  { id: 1, title: "Point hebdo produit", folder: "Produit/Roadmap", date: "9 nov.", body: "La bêta est décalée au 21 novembre. Malik vérifie le quota du serveur de transcription." },
  { id: 2, title: "Revue sprint 42", folder: "Produit/Roadmap", date: "5 nov.", body: "Démo de la pastille flottante. Bêta ouverte à vingt testeurs." },
  { id: 3, title: "Entretien candidat", folder: "Recrutement", date: "4 nov.", body: "Questions sur le quota de congés et le télétravail." },
  { id: 4, title: "Comité RGPD", folder: "Juridique", date: "2 nov.", body: "Registre des traitements, durée de conservation." },
];

const synFolderName = (path) => path.split("/").pop();
const synFolderPath = (path) => path.split("/").filter(Boolean).join(" / ");
const synNorm = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Entrées de premier niveau de « Aller à » (open-note-dialog.tsx, topLevelPageIds).
const synPalPages = () => [
  ["settings", L("Settings"), I("Gear")],
  ["templates", L("Templates"), I("FileText")],
  ["folders", L("Folders"), I("FolderSimple")],
  ["contacts", L("Contacts"), I("Users")],
  ["automations", L("Automations"), I("Lightning")],
];

const synPalSearch = (query, folder) => {
  const q = synNorm(query.trim());
  const notes = SYN_PAL_NOTES.filter((n) => !folder || n.folder === folder);
  const groups = [];
  if (!q && !folder) {
    groups.push({ heading: L("Recent"), items: notes.slice(0, 2).map((n) => ({ kind: "note", note: n })) });
    groups.push({ heading: L("Go to"), items: synPalPages().map(([id, label, icon]) => ({ kind: "page", id, label, icon })) });
    groups.push({ heading: L("All Notes"), items: notes.slice(2).map((n) => ({ kind: "note", note: n })) });
    return groups;
  }
  if (!folder) {
    const folders = SYN_PAL_FOLDERS.filter((f) => synNorm(f.path).includes(q) || SYN_PAL_NOTES.some((n) => n.folder === f.path && synNorm(n.title + " " + n.body).includes(q)));
    if (folders.length) groups.push({ heading: L("Folders"), items: folders.map((f) => ({ kind: "folder", folder: f })) });
    const pages = synPalPages().filter(([, label]) => synNorm(label).includes(q));
    if (pages.length) groups.push({ heading: L("Go to"), items: pages.map(([id, label, icon]) => ({ kind: "page", id, label, icon })) });
  }
  // Titre d'abord, puis contenu avec un extrait.
  const byTitle = notes.filter((n) => !q || synNorm(n.title).includes(q));
  const byBody = q ? notes.filter((n) => !byTitle.includes(n) && synNorm(n.body).includes(q)) : [];
  const items = [
    ...byTitle.map((n) => ({ kind: "note", note: n })),
    ...byBody.map((n) => {
      const i = synNorm(n.body).indexOf(q);
      return { kind: "note", note: n, snippet: [n.body.slice(Math.max(0, i - 28), i), n.body.slice(i, i + q.length), n.body.slice(i + q.length, i + q.length + 32)] };
    }),
  ];
  if (folder) {
    groups.push({ heading: L("In this folder"), items, emptyText: L("No notes in this folder match.") });
    const question = query.trim();
    groups.push({
      heading: L("Actions"),
      items: [
        { kind: "action", id: "ask", label: question ? LF("Ask the folder: “{question}”", { question }) : L("Ask the folder"), icon: I("Sparkle") },
        { kind: "action", id: "new", label: L("New note in this folder"), icon: I("NotePencil") },
      ],
    });
  } else if (items.length) {
    groups.push({ heading: L("Notes"), items });
  }
  return groups;
};

const SynPalItem = ({ item, selected, id, inFolder, onPick, onHover }) => (
  <div id={id} role="option" aria-selected={selected} className="syn-pal-item" onClick={onPick} onMouseMove={onHover}>
    {item.kind === "folder" ? (
      <>
        {h(SynIcon, { name: I("Folder") })}
        <span style={{ fontWeight: 500 }}>{synFolderName(item.folder.path)}</span>
        <span className="syn-muted syn-small">{LP("{count, plural, one {# meeting} other {# meetings}}", item.folder.count)}</span>
        {selected ? <span className="syn-pal-meta">{L("Tab: search inside")}</span> : null}
      </>
    ) : item.kind === "note" ? (
      <>
        {h(SynIcon, { name: I("FileText"), style: { alignSelf: "flex-start", marginTop: 3 } })}
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span>{item.note.title}</span>
            {inFolder ? null : (
              <span className="syn-pal-folder">
                {h(SynIcon, { name: I("Folder"), size: 12 })}
                {synFolderPath(item.note.folder)}
              </span>
            )}
            <span className="syn-pal-meta">{item.note.date}</span>
          </span>
          {item.snippet ? (
            <span className="syn-pal-snippet">
              … {item.snippet[0]}<mark>{item.snippet[1]}</mark>{item.snippet[2]} …
            </span>
          ) : null}
        </span>
      </>
    ) : (
      <>
        {h(SynIcon, { name: item.icon })}
        <span>{item.label}</span>
        {item.kind === "page" && item.id !== "settings" && !["templates", "folders", "contacts", "automations"].includes(item.id) ? (
          <span className="syn-pal-meta">{L("Settings")}</span>
        ) : null}
      </>
    )}
  </div>
);

/**
 * Palette de recherche (Ctrl+K). `demo` : « recherche-contenu » (palette
 * vide : récents, Aller à, toutes les notes) ou « dossier » (« quota » tapé,
 * le dossier proposé en tête : Tab pour chercher dedans).
 */
export const AppPalette = ({ demo = "recherche-contenu" }) => {
  const initialQuery = demo === "dossier" ? "quota" : "";
  const [query, setQuery] = useState(initialQuery);
  const [folder, setFolder] = useState(null);
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);
  const listId = useId();
  const groups = synPalSearch(query, folder);
  const flat = groups.flatMap((g) => g.items);
  const sel = Math.min(index, Math.max(0, flat.length - 1));
  const selected = flat[sel];
  const placeholder = folder ? L("Search in this folder...") : L("Search notes and pages...");
  const reset = () => {
    setQuery(initialQuery);
    setFolder(null);
    setIndex(0);
    setOpen(true);
  };
  const enterFolder = (path) => {
    setFolder(path);
    setQuery("");
    setIndex(0);
    inputRef.current?.focus();
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((sel + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % Math.max(1, flat.length));
    } else if (e.key === "Tab" && !e.shiftKey && selected?.kind === "folder") {
      e.preventDefault();
      enterFolder(selected.folder.path);
    } else if (e.key === "Backspace" && !query && folder) {
      e.preventDefault();
      setFolder(null);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Enter" && selected?.kind === "folder") {
      e.preventDefault();
      enterFolder(selected.folder.path);
    }
  };
  let position = -1;
  return h(
    SynFigure,
    { onReset: reset },
      <div
        className="syn-pal-stage"
        onKeyDown={(e) => {
          if (!open && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {open ? (
          <div className="syn-pal" role="dialog" aria-label={placeholder}>
            <div className="syn-pal-head">
              {h(SynIcon, { name: I("MagnifyingGlass") })}
              {folder ? (
                <button
                  type="button"
                  className="syn-pal-chip"
                  aria-label={LF("Remove the {name} folder filter", { name: synFolderName(folder) })}
                  title={synFolderPath(folder)}
                  onClick={() => setFolder(null)}
                >
                  {h(SynIcon, { name: I("Folder"), size: 12 })}
                  {synFolderName(folder)}
                  {h(SynIcon, { name: I("X"), size: 12 })}
                </button>
              ) : null}
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={selected ? `${listId}-${sel}` : undefined}
                aria-label={placeholder}
                placeholder={placeholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIndex(0);
                }}
                onKeyDown={onKeyDown}
              />
              <button type="button" className="syn-pal-close" aria-label={L("Close")} onClick={() => setOpen(false)}>
                {h(SynIcon, { name: I("X"), size: 12 })}
              </button>
            </div>
            <div className="syn-pal-list" id={listId} role="listbox" aria-label={placeholder}>
              {flat.length === 0 && !folder ? <div className="syn-pal-empty">{L("No results found.")}</div> : null}
              {groups.map((group, g) => (
                <div key={group.heading} role="group" aria-label={group.heading}>
                  {g > 0 ? <div className="syn-pal-divider" /> : null}
                  <div className="syn-pal-heading" aria-hidden="true">{group.heading}</div>
                  {group.items.length === 0 && group.emptyText ? <div className="syn-pal-empty">{group.emptyText}</div> : null}
                  {group.items.map((item) => {
                    position += 1;
                    const i = position;
                    return (
                      h(SynPalItem, { key: `${group.heading}-${i}`, id: `${listId}-${i}`, item, selected: i === sel, inFolder: Boolean(folder), onHover: () => setIndex(i), onPick: () => (item.kind === "folder" ? enterFolder(item.folder.path) : setIndex(i)) })
                    );
                  })}
                </div>
              ))}
            </div>
            {folder ? (
              <div className="syn-pal-foot">
                <span><kbd>↑↓</kbd> {L("Choose")}</span>
                <span><kbd>{L("Enter")}</kbd> {L("Open")}</span>
                <span><kbd>{L("Backspace")}</kbd> {L("Leave the folder")}</span>
                <span><kbd>{L("Esc")}</kbd> {L("Close")}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ display: "grid", placeItems: "center", minHeight: 300 }}>
            <button type="button" className="syn-ui-btn" onClick={() => setOpen(true)}>
              {h(SynIcon, { name: I("MagnifyingGlass") })} Rouvrir la palette (Ctrl K)
            </button>
          </div>
        )}
      </div>
  );
};
