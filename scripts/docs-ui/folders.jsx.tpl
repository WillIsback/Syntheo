// <FolderPage> : la vue Dossiers (folders.mdx). Reproduit
// apps/desktop/src/folders/sidebar.tsx et sidebar-tree-view.tsx
// (arborescence, cinq notes visibles puis « … N autres »), folder-editor.tsx
// et folders/project/ (en-tête, Prochaine réunion, Fil rouge du projet,
// Réunions, colonne de droite). Données d'exemple seulement.

const SYN_CSS_FOLDERS = `
.syn-fold{display:flex;height:600px;background:var(--syn-background)}
.syn-fold-nav{flex:0 0 250px;display:flex;flex-direction:column;gap:8px;border-right:1px solid var(--syn-border);background:var(--syn-muted);padding:8px 10px}
.syn-fold-navhead{display:flex;align-items:center;justify-content:space-between;height:36px}
.syn-fold-search{display:flex;align-items:center;gap:8px;height:32px;border:1px solid var(--syn-border);border-radius:8px;background:color-mix(in srgb,var(--syn-accent) 50%,transparent);padding:0 10px;color:var(--syn-muted-foreground)}
.syn-fold-search input{flex:1;min-width:0;border:0;background:transparent;color:var(--syn-foreground);font:400 13px/1.3 Geist,system-ui,sans-serif;outline:none}
.syn-fold-search input::placeholder{color:var(--syn-muted-foreground)}
.syn-fold-tree{margin:0;padding:0;list-style:none;overflow-y:auto}
.syn-fold-tree li{display:flex;align-items:center;gap:6px;min-width:0;margin:0;border-radius:8px;padding:6px 8px 6px 0;font-size:14px;color:var(--syn-muted-foreground);cursor:default}
.syn-fold-tree li:hover{background:color-mix(in srgb,var(--syn-accent) 50%,transparent);color:var(--syn-foreground)}
.syn-fold-tree li[aria-selected=true]{background:var(--syn-accent);color:var(--syn-foreground);font-weight:500}
.syn-fold-tree li[data-kind=note],.syn-fold-tree li[data-kind=more]{font-size:12.5px}
.syn-fold-tree li:focus-visible{outline:1px solid var(--syn-ring);outline-offset:0}
.syn-fold-caret{display:grid;place-items:center;width:16px;height:16px;flex-shrink:0;transition:transform 150ms}
.syn-fold-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.syn-fold-count{flex-shrink:0;font-size:11.5px;font-weight:400;font-variant-numeric:tabular-nums}
.syn-fold-main{flex:1;min-width:0;display:flex;flex-direction:column}
.syn-fold-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;padding:10px 6px 12px 14px}
.syn-fold-head input{border:0;background:transparent;padding:0;font:600 14px/1.3 Geist,system-ui,sans-serif;color:var(--syn-foreground);outline:none}
.syn-fold-scroll{flex:1;overflow-y:auto;padding:0 14px 24px}
.syn-fold-grid{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:20px;align-items:start}
.syn-fold-col{display:flex;flex-direction:column;gap:16px;min-width:0}
.syn-fold-card{position:relative;display:flex;flex-direction:column;gap:10px;border:1px solid var(--syn-border);border-radius:12px;background:var(--syn-card);padding:14px 16px}
.syn-fold-card h3{margin:0;font-size:14px;font-weight:600}
.syn-fold-card p{margin:0}
.syn-fold-card ul,.syn-fold-card ol{margin:0;padding-left:20px;font-size:14px}
.syn-fold-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.syn-fold-sm{min-height:30px;padding:4px 10px;font-size:13px}
.syn-fold-fresh{border-radius:6px;padding:0 6px;font-size:11px;font-weight:600;background:var(--syn-muted);color:var(--syn-muted-foreground)}
.syn-fold-fresh[data-ok]{background:var(--syn-accent);color:var(--syn-accent-foreground)}
.syn-fold-chip{border-radius:5px;background:var(--syn-accent);color:var(--syn-accent-foreground);padding:0 5px;font-size:12px}
.syn-fold-alert{display:flex;flex-wrap:wrap;align-items:center;gap:8px;border-radius:8px;background:var(--syn-muted);padding:8px 12px;font-size:12px}
.syn-fold-thread h5{margin:6px 0 2px;font-size:13px;font-weight:600}
.syn-fold-thread label{display:flex;gap:8px;align-items:flex-start;cursor:pointer}
.syn-fold-thread input{accent-color:var(--syn-primary);margin-top:4px}
.syn-fold-meet{display:flex;flex-direction:column;margin:0;padding:0;list-style:none}
.syn-fold-meet li{display:grid;grid-template-columns:5.5rem .75rem minmax(0,1fr);gap:10px;padding:8px 0}
.syn-fold-dot{width:8px;height:8px;margin-top:6px;border-radius:999px;background:var(--syn-primary)}
.syn-fold-link{display:block;max-width:100%;border:0;background:none;padding:0;color:var(--syn-foreground);font:600 13.5px/1.3 Geist,system-ui,sans-serif;text-align:left;cursor:pointer}
.syn-fold-link:hover{color:var(--syn-primary)}
.syn-fold-more{align-self:flex-start;border:0;background:none;padding:0 0 0 6.75rem;color:var(--syn-primary);font:400 12.5px/1.3 Geist,system-ui,sans-serif;cursor:pointer}
.syn-fold-mat{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0;padding:0;list-style:none}
.syn-fold-mat li>*{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;width:100%;aspect-ratio:4/3;border:1px solid var(--syn-border);border-radius:8px;background:transparent;color:var(--syn-muted-foreground);padding:6px;font:500 12px/1.2 Geist,system-ui,sans-serif;text-align:center}
.syn-fold-mat button{border-style:dashed!important;cursor:pointer}
.syn-fold-status{border-top:1px solid var(--syn-border);padding:6px 14px;min-height:30px;font-size:12px;color:var(--syn-muted-foreground)}
`;

// Dossiers, sous-dossiers et réunions (date ISO, titre, ligne du compte rendu).
const SYN_FOLD_TREE = {
  Clients: ["Clients/Acme", "Clients/Biotech Nord"],
  "Clients/Acme": [],
  "Clients/Biotech Nord": [],
  Produit: ["Produit/Roadmap"],
  "Produit/Roadmap": [],
  RH: [],
};
const SYN_FOLD_ROOTS = ["Clients", "Produit", "RH"];
const SYN_FOLD_NOTES = {
  Produit: [
    ["2026-11-04", "Revue sprint 14", "Import des factures terminé ; le quota du serveur de transcription bloque les tests de charge."],
    ["2026-10-28", "Point hebdo produit", "Bêta décalée au 21 novembre ; Camille prévient les testeurs."],
    ["2026-10-21", "Point hebdo produit", "Priorité à l'export CSV avant la bêta."],
    ["2026-10-14", "Revue sprint 13", "Export CSV livré à moitié ; filtre par date reporté."],
    ["2026-10-07", "Point hebdo produit", "Choix du serveur de transcription pour la bêta."],
    ["2026-09-30", "Atelier parcours d'import", "Trois parcours d'import retenus."],
  ],
  "Produit/Roadmap": [["2026-10-30", "Revue roadmap T1", "Trois chantiers retenus pour le premier trimestre."], ["2026-10-02", "Revue roadmap T4", "Mode hors ligne reporté."]],
  "Clients/Acme": [["2026-11-03", "Comité de pilotage Acme", "Mise en production validée pour le 1er décembre."], ["2026-10-20", "Point projet Acme", "Reprise des données terminée."], ["2026-09-15", "Lancement client Acme", "Périmètre et jalons validés."]],
  "Clients/Biotech Nord": [["2026-10-29", "Découverte Biotech Nord", "Besoin : comptes rendus de comités qualité."]],
  RH: [["2026-10-23", "Entretien annuel — Léa M.", "Objectifs 2027 fixés."], ["2026-09-25", "Point recrutement", "Deux postes ouverts au premier trimestre."]],
};
const SYN_FOLD_TEMPLATES = ["Réunion générale", "Comité conformité / RGPD", "Point projet / Sprint", "Standup équipe", "Lancement client", "Entretien individuel (1:1)"];
const SYN_FOLD_INITIAL = {
  selected: "Produit",
  expanded: { Produit: true },
  search: "",
  agenda: { Produit: { edited: true, version: 0 } },
  thread: { Produit: "2026-10-28" },
  done: {},
  context: { Produit: "Application Syntheo : sprints de deux semaines, bêta prévue en novembre." },
  template: { Produit: "Point projet / Sprint", Clients: "Lancement client", RH: "Entretien individuel (1:1)" },
  showAll: false,
  confirming: false,
  status: "",
};

const synFoldName = (path) => path.split("/").pop();
const synFoldDate = (iso, weekday) =>
  new Intl.DateTimeFormat(SYN_LOCALE, { day: "numeric", month: "short", timeZone: "UTC", ...(weekday ? { weekday: "short" } : {}) }).format(new Date(`${iso}T12:00:00Z`));
const synFoldMeetings = (path) =>
  [path, ...SYN_FOLD_TREE[path].flatMap((child) => [child, ...SYN_FOLD_TREE[child]])]
    .flatMap((p) => (SYN_FOLD_NOTES[p] ?? []).map(([iso, title, line]) => ({ iso, title, line, folder: p })))
    .sort((a, b) => (a.iso < b.iso ? 1 : -1));

// Lignes visibles de l'arborescence (sidebar-tree.ts, visibleFolderTreeRows).
const synFoldRows = (state) => {
  const q = synNorm(state.search.trim());
  const matches = (path) => synNorm(synFoldName(path)).includes(q) || SYN_FOLD_TREE[path].some(matches);
  const rows = [];
  const walk = (path, depth) => {
    if (q && !matches(path)) return;
    const own = SYN_FOLD_NOTES[path] ?? [];
    const expandable = SYN_FOLD_TREE[path].length > 0 || own.length > 0;
    const expanded = expandable && (q ? SYN_FOLD_TREE[path].some(matches) : Boolean(state.expanded[path]));
    rows.push({ kind: "folder", path, depth, expandable, expanded, count: synFoldMeetings(path).length });
    if (!expanded) return;
    SYN_FOLD_TREE[path].forEach((child) => walk(child, depth + 1));
    if (q) return;
    own.slice(0, 5).forEach(([iso, title]) => rows.push({ kind: "note", path, depth: depth + 1, iso, title }));
    if (own.length > 5) rows.push({ kind: "more", path, depth: depth + 1, hidden: own.length - 5 });
  };
  SYN_FOLD_ROOTS.forEach((root) => walk(root, 0));
  return rows;
};

const SynFoldTree = ({ state, patch, markers }) => {
  const rows = synFoldRows(state);
  const [focus, setFocus] = useState(0);
  const listRef = useRef(null);
  const current = Math.min(focus, Math.max(0, rows.length - 1));
  const toggle = (row) => row.expandable && patch({ expanded: { ...state.expanded, [row.path]: !row.expanded } });
  const activate = (row) => {
    if (row.kind === "note") patch({ status: `La note « ${row.title} » s'ouvre dans un onglet.` });
    else patch({ selected: row.path, showAll: false, confirming: false, status: "" });
  };
  const move = (index) => {
    setFocus(index);
    listRef.current?.querySelectorAll("[role=treeitem]")[index]?.focus();
  };
  const onKeyDown = (e) => {
    const row = rows[current];
    if (!row) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(Math.min(rows.length - 1, Math.max(0, current + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "ArrowRight" && row.kind === "folder" && !row.expanded) {
      e.preventDefault();
      toggle(row);
    } else if (e.key === "ArrowLeft" && row.kind === "folder" && row.expanded) {
      e.preventDefault();
      toggle(row);
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(row);
    }
  };
  if (rows.length === 0) {
    return (
      <div className="syn-muted" style={{ padding: "32px 12px", textAlign: "center" }}>
        {h(SynIcon, { name: I("FolderSimple"), size: 32, style: { margin: "0 auto 8px", display: "block" } })}
        <p style={{ margin: 0, fontSize: 14 }}>{L("No folders found")}</p>
      </div>
    );
  }
  return (
    <ul className="syn-fold-tree" role="tree" aria-label={L("Folders")} ref={listRef} onKeyDown={onKeyDown}>
      {rows.map((row, index) => (
        <li
          key={`${row.kind}-${row.path}-${row.title ?? ""}-${index}`}
          role="treeitem"
          data-kind={row.kind}
          aria-level={row.depth + 1}
          aria-expanded={row.kind === "folder" && row.expandable ? row.expanded : undefined}
          aria-selected={row.kind === "folder" && row.path === state.selected}
          aria-label={row.kind === "folder" ? synFoldName(row.path) : row.title}
          tabIndex={index === current ? 0 : -1}
          style={{ paddingLeft: 4 + row.depth * 14, position: "relative" }}
          onFocus={() => setFocus(index)}
          onClick={() => (row.kind === "more" ? patch({ selected: row.path, status: "" }) : activate(row))}
        >
          {row.kind === "folder" ? (
            <span
              role="presentation"
              className="syn-fold-caret"
              style={{ visibility: row.expandable ? "visible" : "hidden", transform: row.expanded ? "rotate(90deg)" : "none" }}
              onClick={(e) => {
                e.stopPropagation();
                toggle(row);
              }}
            >
              {h(SynIcon, { name: I("CaretRight"), size: 12 })}
            </span>
          ) : (
            <span aria-hidden="true" style={{ width: 16, flexShrink: 0 }} />
          )}
          {row.kind === "folder" ? (
            <>
              {h(SynIcon, { name: I("Folder") })}
              <span className="syn-fold-name">{synFoldName(row.path)}</span>
              <span className="syn-fold-count" aria-label={LP("{0, plural, one {# meeting} other {# meetings}}", row.count)}>{row.count}</span>
            </>
          ) : row.kind === "note" ? (
            <>
              <span className="syn-fold-name">{row.title}</span>
              <span className="syn-fold-count">{synFoldDate(row.iso)}</span>
            </>
          ) : (
            <span className="syn-fold-name">{LP("{0, plural, one {… # other} other {… # others}}", row.hidden)}</span>
          )}
          {markers && row.path === "Clients" && row.kind === "folder" ? h(SynHotspot, { n: 1, style: { right: 28, top: 5 } }) : null}
        </li>
      ))}
    </ul>
  );
};

/**
 * Vue Dossiers : arborescence à gauche, page du dossier « Produit » à droite.
 * Repères : 1 arborescence, 2 en-tête du dossier, 3 Prochaine réunion,
 * 4 Fil rouge du projet, 5 colonne de droite.
 */
export const FolderPage = ({ markers = true }) => {
  const [state, setState] = useState(SYN_FOLD_INITIAL);
  const [showMarkers, setShowMarkers] = useState(markers);
  const patch = (p) => setState((s) => ({ ...s, ...p }));
  const path = state.selected;
  const name = synFoldName(path);
  const meetings = synFoldMeetings(path);
  const count = meetings.length;
  const visible = state.showAll ? meetings : meetings.slice(0, 5);
  const agenda = state.agenda[path];
  const covered = state.thread[path];
  const pending = covered ? meetings.filter((m) => m.iso > covered).length : count;
  const ownTemplate = state.template[path] ?? "";
  const parent = path.includes("/") ? path.split("/")[0] : null;
  const inherited = !ownTemplate && parent ? state.template[parent] : null;
  const propose = () => {
    patch({
      agenda: { ...state.agenda, [path]: { edited: false, version: (agenda?.version ?? -1) + 1 } },
      confirming: false,
      status: "Ordre du jour proposé : chaque point renvoie à sa réunion.",
    });
  };
  const agendaItems = meetings.slice(0, 4).map((m) => [`Points restés ouverts de « ${m.title} »`, m.iso]);
  const productAgenda = [["Confirmer la date de la bêta", "2026-10-28"], ["Quota du serveur de transcription : point de Malik", "2026-11-04"], ["Filtre par date de l'export CSV", "2026-10-14"]];
  const items = path === "Produit" ? productAgenda : agendaItems;
  return h(
    SynFigure,
    { title: L("Folders"), width: 940, markers: showMarkers, setMarkers: setShowMarkers, onReset: () => setState(SYN_FOLD_INITIAL) },
    <div className="syn-fold">
      <nav className="syn-fold-nav" aria-label={L("Folders")}>
        <div className="syn-fold-navhead">
          <button type="button" className="syn-icon-btn" aria-label={L("Go home")} title={L("Back")}>{h(SynIcon, { name: I("ArrowLeft") })}</button>
          <button type="button" className="syn-icon-btn" aria-label={L("New folder")} title={L("New folder")}>{h(SynIcon, { name: I("Plus") })}</button>
        </div>
        <label className="syn-fold-search">
          {h(SynIcon, { name: I("MagnifyingGlass") })}
          <input
            type="text"
            aria-label={L("Search folders...")}
            placeholder={L("Search folders...")}
            value={state.search}
            onChange={(e) => patch({ search: e.target.value })}
            onKeyDown={(e) => e.key === "Escape" && patch({ search: "" })}
          />
          {state.search ? (
            <button type="button" className="syn-icon-btn" style={{ width: 18, height: 18 }} aria-label={L("Clear search")} onClick={() => patch({ search: "" })}>
              {h(SynIcon, { name: I("X"), size: 14 })}
            </button>
          ) : null}
        </label>
        {h(SynFoldTree, { state, patch, markers: showMarkers })}
      </nav>
      <section className="syn-fold-main" aria-label={path}>
        <div className="syn-fold-head">
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <button type="button" className="syn-icon-btn" aria-label={L("Choose folder icon")}>{h(SynIcon, { name: I("Folder") })}</button>
            <div>
              <input key={path} defaultValue={name} aria-label={L("Folder name")} placeholder={L("Folder name")} />
              <p className="syn-muted syn-small" style={{ margin: 0 }}>
                {count === 0
                  ? L("No meetings yet")
                  : count === 1
                    ? `${LP("{0, plural, one {# meeting} other {# meetings}}", 1)} · ${synFoldDate(meetings[0].iso, true)}`
                    : `${LP("{0, plural, one {# meeting} other {# meetings}}", count)} · ${LF("since {first}", { first: synFoldDate(meetings[count - 1].iso) })} · ${LF("last on {last}", { last: synFoldDate(meetings[0].iso, true) })}`}
              </p>
            </div>
          </div>
          <div className="syn-fold-row" style={{ position: "relative" }}>
            {showMarkers ? h(SynHotspot, { n: 2, style: { left: -26, top: 4 } }) : null}
            <button type="button" className="syn-ui-btn syn-fold-sm" aria-keyshortcuts="Control+J" onClick={() => patch({ status: `Le chat s'ouvre avec le dossier « ${name} » pour contexte.` })}>
              {h(SynIcon, { name: I("ChatCircle"), size: 14 })}
              {L("Ask the folder")}
              <kbd className="syn-muted" aria-hidden="true" style={{ font: "inherit", fontSize: 11 }}>Ctrl J</kbd>
            </button>
            <button type="button" className="syn-ui-btn syn-fold-sm" data-variant="primary" onClick={() => patch({ status: `Nouvelle note rangée dans « ${name} », ouverte à l'étape Préparer.` })}>
              {h(SynIcon, { name: I("Plus"), size: 14 })}
              {L("New note in this folder")}
            </button>
            {h(SynMenuButton, { label: L("Folder actions"), items: [{ label: L("Delete") }] })}
          </div>
        </div>
        <div className="syn-fold-scroll">
          <div className="syn-fold-grid">
            <div className="syn-fold-col">
              <section className="syn-fold-card" aria-label={L("Next meeting")}>
                <div className="syn-fold-row">
                  <h3>{L("Next meeting")}</h3>
                  {showMarkers ? h(SynHotspot, { n: 3, style: { left: 130, top: 16 } }) : null}
                  <button
                    type="button"
                    className="syn-ui-btn syn-fold-sm"
                    data-variant="ghost"
                    style={{ marginLeft: "auto" }}
                    disabled={count === 0}
                    onClick={() => (agenda?.edited && !state.confirming ? patch({ confirming: true }) : propose())}
                  >
                    {h(SynIcon, { name: I("ArrowsClockwise"), size: 14 })}
                    {L("Propose")}
                  </button>
                  <button type="button" className="syn-ui-btn syn-fold-sm" onClick={() => patch({ status: `Note « ${meetings[0]?.title ?? name} » créée dans « ${name} », avec les participants habituels et l'ordre du jour dans vos notes. Elle s'ouvre à l'étape Préparer.` })}>
                    {h(SynIcon, { name: I("NotePencil"), size: 14 })}
                    {L("Prepare the note")}
                  </button>
                </div>
                {state.confirming ? (
                  <div className="syn-fold-alert" role="alert">
                    <span style={{ marginRight: "auto" }}>{L("A new proposal replaces your changes to the agenda.")}</span>
                    <button type="button" className="syn-ui-btn syn-fold-sm" data-variant="ghost" onClick={() => patch({ confirming: false })}>{L("Cancel")}</button>
                    <button type="button" className="syn-ui-btn syn-fold-sm" data-variant="primary" onClick={propose}>{L("Replace")}</button>
                  </div>
                ) : null}
                {agenda ? (
                  <>
                    <p className="syn-muted syn-small">{L("Agenda proposed from the points still open (editable):")}</p>
                    <ol>
                      {(agenda.version % 2 ? [...items].reverse() : items).map(([text, iso]) => (
                        <li key={text}>{text} <span className="syn-fold-chip">@{synFoldDate(iso)}</span></li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <p className="syn-muted" style={{ fontSize: 14 }}>{L("Propose drafts the agenda from the open points, decisions to confirm and open tasks of this folder, with your local model.")}</p>
                )}
              </section>
              <section className="syn-fold-card" aria-label={L("Project thread")}>
                <div className="syn-fold-row">
                  <h3>{L("Project thread")}</h3>
                  {covered ? (
                    <span className="syn-fold-fresh" data-ok={pending === 0 ? "" : undefined}>
                      {LF("up to date as of {coveredDate}", { coveredDate: synFoldDate(covered) })}
                      {pending > 0 ? ` · ${LF("{pendingCount, plural, one {# meeting since} other {# meetings since}}", { pendingCount: pending })}` : null}
                    </span>
                  ) : null}
                  {showMarkers ? h(SynHotspot, { n: 4, style: { right: 116, top: 16 } }) : null}
                  <button
                    type="button"
                    className="syn-ui-btn syn-fold-sm"
                    style={{ marginLeft: "auto" }}
                    disabled={pending === 0}
                    onClick={() => patch({ thread: { ...state.thread, [path]: meetings[0].iso }, status: "Fil rouge mis à jour : nouvelles réunions intégrées, vos corrections gardées." })}
                  >
                    {h(SynIcon, { name: I("ArrowsClockwise"), size: 14 })}
                    {L("Update")}
                  </button>
                </div>
                {covered ? (
                  <>
                    <div className="syn-fold-thread" style={{ fontSize: 14 }}>
                      <p>{meetings[0] ? `Dernière réunion : « ${meetings[0].title} ». ${meetings[0].line}` : ""}</p>
                      <h5>{L("Decisions")}</h5>
                      <ul>{meetings.slice(0, 2).map((m) => <li key={m.iso}>{m.line} <span className="syn-fold-chip">@{synFoldDate(m.iso)}</span></li>)}</ul>
                      <h5>{L("Open points")}</h5>
                      <ul>{meetings.slice(2, 3).map((m) => <li key={m.iso}>{m.line} <span className="syn-fold-chip">@{synFoldDate(m.iso)}</span></li>)}</ul>
                      <h5>{L("Open tasks")}</h5>
                      {meetings.slice(0, 2).map((m) => {
                        const key = `${path}-${m.iso}`;
                        return (
                          <label key={key}>
                            <input type="checkbox" checked={Boolean(state.done[key])} onChange={() => patch({ done: { ...state.done, [key]: !state.done[key] } })} />
                            <span style={state.done[key] ? { textDecoration: "line-through", color: "var(--syn-muted-foreground)" } : undefined}>
                              Relire le compte rendu de « {m.title} » <span className="syn-fold-chip">@{synFoldDate(m.iso)}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="syn-muted" style={{ fontSize: 11.5 }}>{L("Editable: your corrections are kept when the thread is updated.")}</p>
                  </>
                ) : (
                  <p className="syn-muted" style={{ fontSize: 14 }}>{L("Not written yet. Update writes it from the summaries of the meetings in this folder, with your local model.")}</p>
                )}
              </section>
              <section className="syn-fold-card">
                <div className="syn-fold-row" style={{ alignItems: "baseline" }}>
                  <h3>{L("Meetings")}</h3>
                  <span className="syn-muted syn-small" style={{ marginLeft: "auto" }}>{L("most recent first")}</span>
                </div>
                {count === 0 ? (
                  <p className="syn-muted" style={{ fontSize: 14 }}>{L("No notes in this folder yet.")}</p>
                ) : (
                  <ol className="syn-fold-meet">
                    {visible.map((m) => (
                      <li key={`${m.folder}-${m.iso}`}>
                        <span className="syn-muted syn-small" style={{ textAlign: "right" }}>{synFoldDate(m.iso, true)}</span>
                        <span className="syn-fold-dot" aria-hidden="true" />
                        <div style={{ minWidth: 0 }}>
                          <button type="button" className="syn-fold-link" onClick={() => patch({ status: `La note « ${m.title} » s'ouvre dans un onglet.` })}>{m.title}</button>
                          {m.folder !== path ? <span className="syn-muted" style={{ fontSize: 11.5 }}>{synFoldName(m.folder)}</span> : null}
                          <p className="syn-muted" style={{ fontSize: 12.5 }}>{m.line}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                {count > visible.length ? (
                  <button type="button" className="syn-fold-more" onClick={() => patch({ showAll: true })}>
                    {LF("{hiddenCount, plural, one {See the previous meeting} other {See the # previous meetings}}", { hiddenCount: count - visible.length })}
                  </button>
                ) : null}
              </section>
            </div>
            <div className="syn-fold-col" style={{ position: "relative" }}>
              {showMarkers ? h(SynHotspot, { n: 5, style: { left: -14, top: -8 } }) : null}
              <section className="syn-fold-card">
                <h3>{L("Context")}</h3>
                <p className="syn-muted syn-small">{L("What these notes are usually about")}</p>
                <textarea
                  className="syn-input"
                  rows={4}
                  aria-label={L("Folder context")}
                  placeholder={L("Add context for this folder")}
                  value={state.context[path] ?? ""}
                  onChange={(e) => patch({ context: { ...state.context, [path]: e.target.value } })}
                  style={{ resize: "none" }}
                />
              </section>
              <section className="syn-fold-card">
                <h3>{L("Summary template")}</h3>
                <p className="syn-muted syn-small">{L("Used for this folder's notes unless a note picks another")}</p>
                <select className="syn-select" aria-label={L("Summary template")} value={ownTemplate} onChange={(e) => patch({ template: { ...state.template, [path]: e.target.value } })}>
                  <option value="">{L("None")}</option>
                  {SYN_FOLD_TEMPLATES.map((title) => <option key={title} value={title}>{title}</option>)}
                </select>
                {inherited ? <p className="syn-muted syn-small">{LF("Without one, notes use {inheritedTitle} from the {parentName} folder.", { inheritedTitle: inherited, parentName: parent })}</p> : null}
              </section>
              <section className="syn-fold-card">
                <h3>{L("Materials")}</h3>
                <ul className="syn-fold-mat">
                  <li>
                    <button type="button">{h(SynIcon, { name: I("Plus"), size: 24 })}{L("Add file")}</button>
                  </li>
                  {path === "Produit" ? (
                    <li><span>{h(SynIcon, { name: I("File"), size: 24 })}Specs bêta.md</span></li>
                  ) : null}
                </ul>
              </section>
            </div>
          </div>
        </div>
        <div className="syn-fold-status" role="status">{state.status}</div>
      </section>
    </div>
  );
};
