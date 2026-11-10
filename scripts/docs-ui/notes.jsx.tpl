// <NoteActions> : une note à l'étape Synthèse (notes.mdx). Reproduit
// apps/desktop/src/session/components/outer-header/ (sélecteur de dossier,
// menu ••• de overflow/index.tsx), living-document/ (ligne d'informations,
// summary-switcher-view.tsx, provenance.tsx, transcript-margin.tsx),
// capsule/index.tsx (étape Synthèse) et overflow/export-modal.tsx (fenêtre
// « Exporter ou imprimer »). Données d'exemple seulement.

const SYN_CSS_NOTES = `
.syn-notes{position:relative;min-height:540px;background:var(--syn-background)}
.syn-notes-head{display:flex;align-items:center;justify-content:flex-end;gap:2px;height:46px;padding:0 6px 0 12px}
.syn-notes-pill{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:6px;background:transparent;color:var(--syn-muted-foreground);padding:5px 8px;font:400 13px/1 Geist,system-ui,sans-serif;cursor:pointer}
.syn-notes-pill:hover,.syn-notes-pill[aria-expanded=true],.syn-notes-pill[aria-pressed=true]{background:var(--syn-accent);color:var(--syn-accent-foreground)}
.syn-notes-body{display:flex;gap:40px;padding:4px 40px 110px}
.syn-notes-doc{flex:1;min-width:0;display:flex;flex-direction:column;gap:12px;max-width:680px}
.syn-notes-title{margin:0;font:500 30px/1.15 Newsreader,Georgia,serif}
.syn-notes-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;font-size:14px;color:var(--syn-muted-foreground)}
.syn-notes-tag{border:1px solid var(--syn-border);border-radius:6px;padding:1px 8px;color:var(--syn-foreground)}
.syn-notes-tools{position:relative;margin-left:auto;display:flex;align-items:center;gap:6px}
.syn-notes-seg{display:flex;align-items:center;gap:2px;height:28px;padding:2px;border-radius:999px;background:color-mix(in srgb,var(--syn-foreground) 10%,transparent)}
.syn-notes-seg>button,.syn-notes-seg .syn-icon-btn{display:inline-flex;align-items:center;gap:6px;height:24px;border:0;border-radius:999px;background:transparent;color:var(--syn-muted-foreground);padding:0 10px;font:500 12px/1 Geist,system-ui,sans-serif;cursor:pointer}
.syn-notes-seg .syn-icon-btn{width:24px;padding:0}
.syn-notes-seg>button[aria-pressed=true]{background:var(--syn-background);color:var(--syn-foreground);box-shadow:0 1px 2px color-mix(in srgb,var(--syn-foreground) 15%,transparent)}
.syn-notes-legend{display:flex;gap:16px;margin:0;font-size:13px;color:var(--syn-muted-foreground)}
.syn-notes-legend span{display:flex;align-items:center}
.syn-notes-legend i{display:inline-block;width:10px;height:10px;margin-right:6px;border-radius:2px}
.syn-notes-sum h4{margin:6px 0 4px;font:500 19px/1.3 Newsreader,Georgia,serif}
.syn-notes-sum ul{margin:0;padding-left:20px;font-size:15px}
.syn-notes-ink{color:var(--syn-user-ink)}
.syn-notes-seal{display:grid;place-items:center;align-self:flex-end;width:46px;height:46px;transform:rotate(-5deg);border:2px solid var(--syn-seal);border-radius:7px;color:var(--syn-seal);font:700 25px/1 "Noto Serif JP",serif;opacity:.85}
.syn-notes-margin{flex:0 0 260px;display:flex;flex-direction:column;gap:10px;border-left:1px solid var(--syn-border);padding-left:16px;font-size:13px;color:var(--syn-muted-foreground)}
.syn-notes-margin h2{margin:0;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--syn-faint)}
.syn-notes-margin p{margin:0}
.syn-notes-margin b{color:var(--syn-foreground);font-weight:600}
.syn-notes-small{border:0;border-radius:6px;background:transparent;color:var(--syn-muted-foreground);padding:2px 6px;font:400 12px/1.2 Geist,system-ui,sans-serif;cursor:pointer}
.syn-notes-small:hover,.syn-notes-small[aria-pressed=true]{background:var(--syn-accent);color:var(--syn-foreground)}
.syn-notes-cap{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);z-index:10}
.syn-notes-cap .syn-menu{top:auto!important;bottom:calc(100% + 8px)}
.syn-notes-cap .syn-menu [role=menuitem]{color:var(--syn-foreground)}
.syn-notes-auto{display:flex;flex-direction:column;min-width:0;text-align:left}
.syn-notes-auto small{font-size:12px;color:var(--syn-muted-foreground)}
.syn-notes-toast{position:absolute;right:16px;bottom:82px;z-index:12;max-width:320px;border:1px solid var(--syn-border);border-radius:10px;background:var(--syn-popover);box-shadow:var(--syn-shadow-capsule);padding:8px 12px;font-size:13px}
.syn-notes-toast:empty{display:none}
.syn-notes-exp{width:300px;top:9%;border-radius:12px;background:var(--syn-background);padding:20px;display:flex;flex-direction:column;gap:16px;text-align:center}
.syn-notes-exp h2{margin:0;font-size:16px;font-weight:600}
.syn-notes-exp p{margin:0}
.syn-notes-opts{display:flex;justify-content:center;flex-wrap:wrap;gap:14px;font-size:14px}
.syn-notes-opts label{display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.syn-notes-opts input{accent-color:var(--syn-primary);margin:0}
.syn-notes-big{height:40px;width:100%;border-radius:999px;font:500 14px/1 Geist,system-ui,sans-serif;cursor:pointer;border:1px solid var(--syn-border);background:var(--syn-background);color:var(--syn-foreground)}
.syn-notes-big[data-primary]{border:2px solid var(--syn-primary);background:var(--syn-primary);color:var(--syn-primary-foreground)}
.syn-notes-big:disabled{opacity:.5;cursor:not-allowed}
`;

const SYN_NOTES_TITLE = "Revue sprint 14";
const SYN_NOTES_FORMATS = [["pdf", "PDF"], ["txt", "TXT"], ["md", "Markdown"], ["org", "Org"]];

// Hors démonstration : « Copier », « Demander à la note », etc. restent inertes.
const SynNotesExport = ({ onClose, onDone, markers }) => {
  const [format, setFormat] = useState("pdf");
  const [include, setInclude] = useState({ memo: false, summary: true, transcript: false });
  const saveRef = useRef(null);
  const titleId = useId();
  const formatId = useId();
  const includeId = useId();
  useEffect(() => saveRef.current?.focus(), []);
  const none = !include.memo && !include.summary && !include.transcript;
  const parts = [["memo", L("Memo")], ["summary", L("Summary")], ["transcript", L("Transcript")]];
  const chosen = parts.filter(([id]) => include[id]).map(([, label]) => label.toLowerCase()).join(" + ");
  const label = SYN_NOTES_FORMATS.find(([id]) => id === format)[1];
  return (
    <>
      <div className="syn-scrim" onClick={onClose} />
      <div
        className="syn-dialog syn-notes-exp"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 id={titleId}>{L("Export or print")}</h2>
          <p className="syn-muted" style={{ fontSize: 14 }}>{L("Choose a file format and what to include.")}</p>
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
          {markers ? h(SynHotspot, { n: 4, style: { left: -8, top: -4 } }) : null}
          <span id={formatId} style={{ fontSize: 14, fontWeight: 500 }}>{L("File format")}</span>
          <div className="syn-notes-opts" role="radiogroup" aria-labelledby={formatId}>
            {SYN_NOTES_FORMATS.map(([id, name]) => (
              <label key={id}>
                <input type="radio" name={`${titleId}-format`} checked={format === id} onChange={() => setFormat(id)} />
                {name}
              </label>
            ))}
          </div>
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
          {markers ? h(SynHotspot, { n: 5, style: { left: -8, top: -4 } }) : null}
          <span id={includeId} style={{ fontSize: 14, fontWeight: 500 }}>{L("Include")}</span>
          <div className="syn-notes-opts" role="group" aria-labelledby={includeId}>
            {parts.map(([id, name]) => (
              <label key={id}>
                <input type="checkbox" checked={include[id]} onChange={(e) => setInclude({ ...include, [id]: e.target.checked })} />
                {name}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            ref={saveRef}
            type="button"
            className="syn-notes-big"
            data-primary=""
            disabled={none}
            onClick={() => onDone(`Fichier « ${SYN_NOTES_TITLE} » (${label}, ${chosen}) écrit dans Téléchargements, puis affiché dans le gestionnaire de fichiers.`)}
          >
            {L("Save")}
          </button>
          <p className="syn-muted syn-small">{L("Saved in Downloads")}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button type="button" className="syn-notes-big" disabled={none} onClick={() => onDone(L("The PDF opens in your reader. Choose Print."))}>
            {L("Print…")}
          </button>
          <p className="syn-muted syn-small">{L("The PDF opens in your reader. Choose Print.")}</p>
        </div>
      </div>
    </>
  );
};

const SynNotesCapsule = ({ onExport, onStatus, markers }) => (
  <div className="syn-capsule" role="group" aria-label={L("Note capsule")} style={{ position: "relative" }}>
    {markers ? h(SynHotspot, { n: 2, style: { left: "50%", top: -30, marginLeft: -11 } }) : null}
    <ol className="syn-steps" aria-label={L("Note steps")}>
      {[["備", L("Prepare")], ["聴", L("Listen")], ["結", L("Synthesis")]].map(([kanji, label], index) => (
        <li key={kanji} aria-current={index === 2 ? "step" : undefined}>
          {index > 0 ? <span aria-hidden="true" style={{ opacity: 0.7, fontWeight: 400 }}>·</span> : null}
          <span><span className="syn-kanji" aria-hidden="true">{kanji}</span>{label}</span>
        </li>
      ))}
    </ol>
    <span className="syn-sep" aria-hidden="true" />
    <button type="button" className="syn-btn" onClick={() => onStatus(L("Note copied to clipboard"))}>{L("Copy")}</button>
    <button type="button" className="syn-btn" title={`${L("Export")} (Ctrl+P)`} aria-keyshortcuts="Control+P" onClick={onExport}>
      {L("Export")}
    </button>
    {h(SynMenuButton, {
      label: L("Automations"),
      buttonClassName: "syn-btn",
      align: "left",
      items: synNotesAutomationItems(onStatus),
      children: L("Automations"),
    })}
    <button type="button" className="syn-btn" data-tone="primary" aria-keyshortcuts="Control+J" onClick={() => onStatus("Le chat s'ouvre sur cette réunion.")}>
      {L("Ask the note")}
      <kbd aria-hidden="true">Ctrl J</kbd>
    </button>
  </div>
);

// Une automatisation prête (automations/launch.tsx) : titre, puis ses étapes.
const synNotesAutomationItems = (onStatus) => [
  { heading: L("Run an automation") },
  {
    icon: I("Lightning"),
    label: (
      <span className="syn-notes-auto">
        <span>Tâches pour l'équipe</span>
        <small>Générer avec le modèle local → Copier dans le presse-papiers</small>
      </span>
    ),
    onSelect: () => onStatus(LF("“{title}” ran on this note", { title: "Tâches pour l'équipe" })),
  },
];

/**
 * Note « Revue sprint 14 » à l'étape Synthèse. Repères : 1 menu •••,
 * 2 capsule, 3 « Transcription », 4 « Format de fichier », 5 « Inclure ».
 */
export const NoteActions = ({ markers = true }) => {
  const [showMarkers, setShowMarkers] = useState(markers);
  const [view, setView] = useState("summary");
  const [transcript, setTranscript] = useState(false);
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const reset = () => {
    setView("summary");
    setTranscript(false);
    setEditing(false);
    setExporting(false);
    setStatus("");
  };
  const openExport = () => {
    setStatus("");
    setExporting(true);
  };
  const closeExport = (message) => {
    setExporting(false);
    if (typeof message === "string") setStatus(message);
  };
  const menuItems = [
    { icon: I("CalendarBlank"), label: L("Meeting info"), hint: "›" },
    { icon: I("ClockCounterClockwise"), label: L("Version history") },
    { separator: true },
    ...synNotesAutomationItems(setStatus),
    { separator: true },
    { icon: I("AppWindow"), label: L("Open in New Window") },
    { icon: I("PushPin"), label: L("Always on Top") },
    { separator: true },
    { icon: I("Lock"), label: L("Lock Note") },
    { icon: I("Trash"), label: L("Delete") },
  ];
  return h(
    SynFigure,
    { title: SYN_NOTES_TITLE, markers: showMarkers, setMarkers: setShowMarkers, onReset: reset },
    <div
      className="syn-notes"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
          e.preventDefault();
          openExport();
        }
      }}
    >
      <div className="syn-notes-head">
        <button type="button" className="syn-notes-pill" title={`${L("Folder")} : Produit`}>
          {h(SynIcon, { name: I("Folder"), size: 14 })}
          Produit
        </button>
        <span style={{ position: "relative" }}>
          {showMarkers ? h(SynHotspot, { n: 1, style: { left: -18, top: -6 } }) : null}
          {h(SynMenuButton, { label: "Plus", items: menuItems })}
        </span>
      </div>
      <div className="syn-notes-body">
        <div className="syn-notes-doc">
          <h3 className="syn-notes-title">{SYN_NOTES_TITLE}</h3>
          <div className="syn-notes-meta">
            <span>Mardi 4 novembre · 10:00</span>
            <span className="syn-notes-tag">Point projet / Sprint</span>
            <span className="syn-notes-tag">Camille R.</span>
            <span className="syn-notes-tag">Malik B.</span>
            <span className="syn-notes-tools">
              <span className="syn-notes-seg" role="group" aria-label={L("Note view")}>
                <button type="button" aria-pressed={view === "notes"} onClick={() => setView("notes")}>{L("My notes")}</button>
                <button type="button" aria-pressed={view !== "notes"} onClick={() => setView("summary")}>
                  {h(SynIcon, { name: I("Sparkle"), size: 14 })}
                  {LF("Summary · v{shownVersion}", { shownVersion: 1 })}
                </button>
                {h(SynMenuButton, {
                  label: L("Summary versions"),
                  icon: I("CaretDown"),
                  items: [
                    { heading: L("Versions") },
                    { icon: I("Check"), label: "v1", hint: L("Current") },
                    { separator: true },
                    { icon: I("ArrowClockwise"), label: L("Regenerate") },
                    { icon: I("Swap"), label: L("Change template…") },
                    { icon: I("Copy"), label: L("Copy"), onSelect: () => setStatus(L("Copied to clipboard")) },
                  ],
                })}
              </span>
              <span style={{ position: "relative" }}>
                {showMarkers ? h(SynHotspot, { n: 3, style: { right: -10, top: -18 } }) : null}
                <button
                  type="button"
                  className="syn-notes-pill"
                  aria-expanded={transcript}
                  aria-pressed={transcript}
                  title={transcript ? L("Hide transcript") : L("Show transcript")}
                  onClick={() => setTranscript((v) => !v)}
                >
                  {L("Transcription")}
                </button>
              </span>
            </span>
          </div>
          <p className="syn-notes-legend" aria-label={L("Text provenance")}>
            <span className="syn-notes-ink"><i aria-hidden="true" style={{ background: "var(--syn-user-ink)" }} />{L("Your notes")}</span>
            <span style={{ color: "var(--syn-foreground)" }}><i aria-hidden="true" style={{ background: "var(--syn-foreground)" }} />{L("Completed by Syntheo")}</span>
          </p>
          {view === "notes" ? (
            <ul className="syn-notes-ink" style={{ margin: 0, paddingLeft: 20, fontSize: 15 }}>
              <li>import factures OK (Camille)</li>
              <li>export CSV : reste le filtre par date</li>
              <li>quota serveur → Malik avant jeudi</li>
            </ul>
          ) : (
            <div className="syn-notes-sum">
              <h4>Avancement</h4>
              <ul>
                <li>L'import des factures est terminé et validé par Camille.</li>
                <li className="syn-notes-ink">export CSV : reste le filtre par date</li>
              </ul>
              <h4>Blocages</h4>
              <ul><li>Le quota du serveur de transcription bloque les tests de charge.</li></ul>
              <h4>Prochaines étapes</h4>
              <ul>
                <li>Malik : vérifier le quota avant jeudi.</li>
                <li>Camille : prévenir les testeurs de la bêta.</li>
              </ul>
            </div>
          )}
          {view === "notes" ? null : <span className="syn-notes-seal" aria-hidden="true">記</span>}
        </div>
        {transcript ? (
          <aside className="syn-notes-margin" aria-label={L("Transcription")}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2>{L("Transcription")}</h2>
              <button type="button" className="syn-notes-small" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
                {editing ? L("Done") : L("Edit")}
              </button>
            </div>
            <p contentEditable={editing} suppressContentEditableWarning><b>Camille R.</b> — L'import des factures est bon, je l'ai testé hier.</p>
            <p contentEditable={editing} suppressContentEditableWarning><b>Malik B.</b> — Par contre on bute sur le quota du serveur.</p>
            <p contentEditable={editing} suppressContentEditableWarning><b>Vous</b> — Tu peux vérifier avant jeudi ?</p>
          </aside>
        ) : null}
      </div>
      <div className="syn-notes-toast" role="status">{status}</div>
      <div className="syn-notes-cap">
        {h(SynNotesCapsule, { onExport: openExport, onStatus: setStatus, markers: showMarkers })}
      </div>
      {exporting ? h(SynNotesExport, { onClose: closeExport, onDone: closeExport, markers: showMarkers }) : null}
    </div>
  );
};
