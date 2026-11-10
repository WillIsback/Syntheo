// <AppHome> : l'accueil, apps/desktop/src/home/home-view.tsx (filigrane,
// salutation), start-button.tsx (« Démarrer une réunion », Ctrl+N),
// folder-cards.tsx (« Vos dossiers »), note-index.tsx (« Reprendre » : menu
// « ⋮ », ↑↓ entre les notes), note-folder-chip.tsx, file-note-button.tsx
// (« Ranger ») et home-capsule.tsx (« Rechercher une note », Ctrl+K).
// Données d'exemple seulement ; les actions qui changent d'écran affichent
// une explication au lieu de naviguer.

const SYN_CSS_HOME = `
.syn-home{position:relative;height:560px;overflow:hidden;background:var(--syn-background)}
.syn-home-mark{position:absolute;top:64px;right:48px;font:700 300px/1 "Noto Serif JP",Newsreader,serif;color:var(--syn-primary);opacity:.06;pointer-events:none;user-select:none}
.syn-home-scroll{position:relative;height:100%;overflow-y:auto;display:flex;justify-content:center;padding:24px 24px 96px}
.syn-home-col{display:flex;flex-direction:column;gap:26px;width:640px;max-width:100%;margin-top:28px}
.syn-home-h1{margin:0;font:500 52px/1.05 Newsreader,Georgia,serif;letter-spacing:-.01em;color:var(--syn-foreground)}
.syn-home-start{display:flex;align-items:center;gap:18px;width:100%;border:0;border-radius:16px;background:var(--syn-primary);color:var(--syn-primary-foreground);padding:22px 24px;text-align:left;font:inherit;cursor:pointer}
.syn-home-start:hover{background:color-mix(in srgb,var(--syn-primary) 88%,var(--syn-foreground))}
.syn-home-start:focus-visible{outline:2px solid var(--syn-ring);outline-offset:2px}
.syn-home-mic{display:grid;place-items:center;flex:none;width:52px;height:52px;border-radius:14px;background:color-mix(in srgb,var(--syn-primary-foreground) 15%,transparent)}
.syn-home-steps{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;font-size:12px}
.syn-home-steps span{border:1px solid color-mix(in srgb,var(--syn-primary-foreground) 25%,transparent);border-radius:999px;padding:1px 9px;opacity:.85}
.syn-home-steps b{margin-right:4px;font-weight:400;opacity:.7}
.syn-home-start kbd,.syn-home-cap kbd{font:inherit;background:none;box-shadow:none;color:inherit}
.syn-home-start kbd{margin-left:auto;flex:none;border:1px solid color-mix(in srgb,var(--syn-primary-foreground) 30%,transparent);border-radius:6px;padding:2px 7px;font-size:12px;opacity:.8}
.syn-home-kicker{margin:0;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--syn-faint)}
.syn-home-link{border:0;background:none;padding:0;font:inherit;font-size:13px;color:var(--syn-muted-foreground);cursor:pointer}
.syn-home-link:hover{color:var(--syn-foreground)}
.syn-home-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin:0;padding:0;list-style:none}
.syn-home-card{display:flex;flex-direction:column;gap:4px;width:100%;height:100%;border:1px solid var(--syn-border);border-radius:8px;background:transparent;color:var(--syn-foreground);padding:12px 14px;text-align:left;font:inherit;cursor:pointer}
.syn-home-card:hover{background:var(--syn-accent)}
.syn-home-card small{font-size:12px;color:var(--syn-muted-foreground)}
.syn-home-table{width:100%;table-layout:fixed;border-collapse:collapse}
.syn-home-table td{border-top:1px solid var(--syn-border);padding:12px 4px;vertical-align:middle}
.syn-home-table tr{cursor:pointer}
.syn-home-table tr:hover,.syn-home-table tr:focus-within{background:var(--syn-accent)}
.syn-home-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;background:none;padding:0;color:var(--syn-foreground);font:inherit;font-size:15px;text-align:left;cursor:pointer}
.syn-home-chip{display:inline-flex;align-items:center;gap:4px;flex-shrink:0;max-width:176px;height:20px;border:1px solid var(--syn-border);border-radius:999px;background:transparent;padding:0 8px;font:400 12px/1 Geist,system-ui,sans-serif;color:var(--syn-muted-foreground);white-space:nowrap}
button.syn-home-chip{border-style:dashed;cursor:pointer}
button.syn-home-chip:hover{color:var(--syn-foreground)}
.syn-home-table .syn-icon-btn{width:24px;height:24px;opacity:0}
.syn-home-table tr:hover .syn-icon-btn,.syn-home-table tr:focus-within .syn-icon-btn,.syn-home-table .syn-icon-btn[aria-expanded=true]{opacity:1}
.syn-home-cap{position:absolute;left:50%;bottom:22px;z-index:10;transform:translateX(-50%);display:flex;padding:6px;border-radius:999px;background:var(--syn-primary);color:var(--syn-primary-foreground);box-shadow:var(--syn-shadow-capsule);font-size:14px;white-space:nowrap}
.syn-home-cap button{display:inline-flex;align-items:center;border:0;border-radius:999px;background:transparent;color:inherit;padding:7px 14px;font:inherit;cursor:pointer}
.syn-home-cap button:hover{background:color-mix(in srgb,var(--syn-primary-foreground) 10%,transparent)}
.syn-home-cap button:focus-visible{outline:2px solid var(--syn-primary-foreground);outline-offset:2px}
.syn-home-cap kbd{margin-left:6px;font-size:11px;opacity:.6}
.syn-home-toast{position:absolute;top:14px;left:50%;z-index:12;transform:translateX(-50%);display:flex;align-items:flex-start;gap:8px;width:min(560px,90%);border:1px solid var(--syn-border);border-radius:10px;background:var(--syn-popover);box-shadow:var(--syn-shadow-capsule);padding:10px 12px;font-size:13px}
`;

const SYN_HOME_FOLDERS = [
  { path: "Produit/Roadmap", count: 12, last: "2026-11-09", thread: { points: 3, tasks: 2 } },
  { path: "Recrutement", count: 5, last: "2026-11-06", thread: { points: 0, tasks: 0 } },
  { path: "Client Altis", count: 2, last: "2026-11-03", thread: null },
];

const SYN_HOME_NOTES = [
  { id: 1, date: "2026-11-09", title: "Point hebdo produit", folder: "Produit/Roadmap", minutes: 42 },
  { id: 2, date: "2026-11-06", title: "Entretien développeuse front", folder: "Recrutement", minutes: 65 },
  { id: 3, date: "2026-11-05", title: "Appel de cadrage", folder: "", minutes: 28 },
  { id: 4, date: "2026-11-04", title: "Rétro sprint 44", folder: "Produit/Roadmap", minutes: 35 },
];

// format.ts : « lun. 9 nov. », « 42 min », « 1 h 05 ».
const synHomeDate = (iso) => new Date(`${iso}T10:00:00`).toLocaleDateString(SYN_LOCALE, { weekday: "short", day: "numeric", month: "short" });
const synHomeDuration = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`);
const synHomeName = (path) => path.split("/").pop();

const SynHomeThread = ({ thread }) => {
  if (!thread) return <small style={{ color: "var(--syn-faint)" }}>{L("Project thread not created yet")}</small>;
  const { points, tasks } = thread;
  if (!points && !tasks) return <small style={{ color: "var(--syn-foreground)" }}>{L("Nothing pending")}</small>;
  return (
    <small style={{ color: "var(--syn-foreground)" }}>
      {[
        points ? LP("{openPoints, plural, one {# open point} other {# open points}}", points, { openPoints: points }) : null,
        tasks ? LP("{tasks, plural, one {# task} other {# tasks}}", tasks, { tasks }) : null,
      ]
        .filter(Boolean)
        .join(" · ")}
    </small>
  );
};

const SynHomeRow = ({ note, onSay, onDelete, onMove }) => {
  const open = () => onSay(`Ouvre la note « ${note.title} ».`);
  return (
    <tr onClick={open}>
      <td className="syn-muted" style={{ width: 110, fontSize: 13, whiteSpace: "nowrap" }}>{synHomeDate(note.date)}</td>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <button
            type="button"
            className="syn-home-title"
            data-home-note
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
            onKeyDown={onMove}
          >
            {note.title}
          </button>
          {note.folder ? (
            <span className="syn-home-chip" title={note.folder}>
              {h(SynIcon, { name: I("Folder"), size: 12 })}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{synHomeName(note.folder)}</span>
            </span>
          ) : (
            <button
              type="button"
              className="syn-home-chip"
              aria-haspopup="dialog"
              onClick={(e) => {
                e.stopPropagation();
                onSay(`« Ranger » ouvre le sélecteur de dossier de la note « ${note.title} », le même qu'en tête de note.`);
              }}
            >
              {h(SynIcon, { name: I("Plus"), size: 12 })}
              {/* msgctxt « file a note in a folder » : libellé recopié de messages.po. */}
              Ranger
            </button>
          )}
        </div>
      </td>
      <td className="syn-muted" style={{ width: 72, fontSize: 13, textAlign: "right", whiteSpace: "nowrap" }}>{synHomeDuration(note.minutes)}</td>
      <td style={{ width: 32, textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
        {h(SynMenuButton, {
          label: L("More actions"),
          icon: I("DotsThreeVertical"),
          items: [
            { label: L("Open"), onSelect: open },
            { label: L("Export…"), onSelect: () => onSay(`Ouvre la fenêtre d'export de « ${note.title} », sans ouvrir la note.`) },
            { separator: true },
            { label: L("Delete"), onSelect: () => onDelete(note) },
          ],
        })}
      </td>
    </tr>
  );
};

/** Accueil de l'app : salutation, « Démarrer une réunion », « Vos dossiers », « Reprendre » et capsule « Rechercher une note ». */
export const AppHome = () => {
  const [notes, setNotes] = useState(SYN_HOME_NOTES);
  const [message, setMessage] = useState("");
  const timer = useRef(null);
  const tableRef = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const say = (text) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 6000);
  };
  const reset = () => {
    setNotes(SYN_HOME_NOTES);
    setMessage("");
  };
  const start = () => say("« Démarrer une réunion » crée une note et l'ouvre à l'étape Préparer. Cliquez ensuite sur « Commencer l'écoute » dans la capsule de la note.");
  const search = () => say("« Rechercher une note » ouvre la palette : essayez-la dans la reproduction suivante.");
  const onMove = (e) => {
    const delta = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    const buttons = [...(tableRef.current?.querySelectorAll("button[data-home-note]") ?? [])];
    const next = buttons[buttons.indexOf(e.currentTarget) + delta];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };
  return h(
    SynFigure,
    { title: L("Home"), onReset: reset },
    <div
      className="syn-home"
      onKeyDown={(e) => {
        const key = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && (key === "n" || key === "k")) {
          e.preventDefault();
          if (key === "n") start();
          else search();
        } else if (e.key === "Escape" && message) {
          setMessage("");
        }
      }}
    >
      <span className="syn-home-mark" aria-hidden="true">茶</span>
      {message ? (
        <div className="syn-home-toast" role="status">
          {h(SynIcon, { name: I("Info"), style: { marginTop: 2, color: "var(--syn-primary)" } })}
          <span>{message}</span>
        </div>
      ) : null}
      <div className="syn-home-scroll">
        <div className="syn-home-col">
          <header>
            <h1 className="syn-home-h1">{LF("Hello {firstName}.", { firstName: "Camille" })}</h1>
          </header>
          <button type="button" className="syn-home-start" aria-keyshortcuts="Control+N" onClick={start}>
            <span className="syn-home-mic" aria-hidden="true">{h(SynIcon, { name: I("Microphone"), size: 24 })}</span>
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.35 }}>{L("Start a meeting")}</span>
              <span className="syn-home-steps">
                {[L("Prepare"), L("Listen"), L("Synthesis")].map((label, i) => (
                  <span key={label}>
                    <b aria-hidden="true">{i + 1}</b>
                    {label}
                  </span>
                ))}
              </span>
            </span>
            <kbd aria-hidden="true">Ctrl N</kbd>
          </button>
          <section aria-labelledby="syn-home-folders">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
              <h2 id="syn-home-folders" className="syn-home-kicker">{L("Your folders")}</h2>
              <button type="button" className="syn-home-link" onClick={() => say("« Tous les dossiers » ouvre la vue Dossiers telle que vous l'avez laissée.")}>
                {L("All folders")}
              </button>
            </div>
            <ul className="syn-home-cards">
              {SYN_HOME_FOLDERS.map((f) => (
                <li key={f.path} style={{ minWidth: 0 }}>
                  <button type="button" className="syn-home-card" title={f.path} onClick={() => say(`Ouvre la page du dossier « ${synHomeName(f.path)} » : fil rouge et ordre du jour de la prochaine réunion.`)}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      {h(SynIcon, { name: I("Folder"), style: { color: "var(--syn-muted-foreground)" } })}
                      <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{synHomeName(f.path)}</span>
                    </span>
                    <small>
                      {LP("{0, plural, one {# meeting} other {# meetings}}", f.count)} · {LF("last {lastDate}", { lastDate: synHomeDate(f.last) })}
                    </small>
                    {h(SynHomeThread, { thread: f.thread })}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {notes.length ? (
            <section aria-labelledby="syn-home-resume">
              <h2 id="syn-home-resume" className="syn-home-kicker" style={{ marginBottom: 2 }}>{L("Resume")}</h2>
              <table className="syn-home-table" ref={tableRef}>
                <tbody>
                  {notes.map((note) =>
                    h(SynHomeRow, {
                      key: note.id,
                      note,
                      onSay: say,
                      onMove,
                      onDelete: (n) => {
                        setNotes((list) => list.filter((x) => x.id !== n.id));
                        say(`« ${n.title} » est supprimée. Dans l'app, un message propose « Annuler » ; ici, « Recommencer » la rétablit.`);
                      },
                    }),
                  )}
                </tbody>
              </table>
            </section>
          ) : null}
          <p className="syn-muted" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: 13 }}>
            <i className="syn-pip" aria-hidden="true" />
            {L("Everything is processed on your local server")}
          </p>
        </div>
      </div>
      <div className="syn-home-cap" role="group" aria-label={L("Home capsule")}>
        <button type="button" aria-keyshortcuts="Control+K" onClick={search}>
          {L("Search a note")}
          <kbd aria-hidden="true">Ctrl K</kbd>
        </button>
      </div>
    </div>,
  );
};
