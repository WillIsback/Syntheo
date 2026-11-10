// <AutomationEditor> : la vue Automatisations. Reproduit apps/desktop/src/
// sidebar/automations.tsx, settings/automations/index.tsx (vue d'ensemble,
// en-tête), workflow-builder.tsx, add-step-menu.tsx, step-forms.tsx,
// markdown-export-config.tsx, markdown-export-options.tsx, variable-field.tsx,
// workflow-test-panel.tsx et workflow-test-result.tsx ; libellés de
// automations/labels.ts. Non reproduits : le chat de droite, le nom de fichier
// d'export. Un champ à variables : pastilles puis champ texte (Retour arrière
// retire la dernière). Résultats du test : exemples.

const SYN_CSS_AUTOMATIONS = `
.syn-auto{display:flex;height:600px}.syn-auto-side{flex:0 0 230px;display:flex;flex-direction:column;gap:8px;border-right:1px solid var(--syn-border);background:var(--syn-muted);padding:10px}.syn-auto-side .syn-set-search{height:32px}.syn-auto-item{display:flex;align-items:center;gap:8px;width:100%;border:0;border-radius:8px;background:transparent;padding:7px 10px;color:var(--syn-foreground);text-align:left;font:inherit;cursor:pointer}
.syn-auto-item:hover{background:color-mix(in srgb,var(--syn-accent) 50%,transparent)}.syn-auto-item[aria-current=page]{background:var(--syn-accent)}.syn-auto-item b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;font-size:13.5px}.syn-auto-item small{display:block;font-size:12px;color:var(--syn-muted-foreground)}
.syn-auto-main{position:relative;flex:1;min-width:0;display:flex;flex-direction:column}.syn-auto-head{display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--syn-border);padding:10px 20px}.syn-auto-head h3{flex:1;min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 20px/1.2 Newsreader,Georgia,serif}.syn-auto-scroll{flex:1;overflow:auto;padding:14px 20px 28px;display:flex;flex-direction:column;gap:16px;font-size:13px}
.syn-auto-box{border:1px solid var(--syn-border);border-radius:16px;background:var(--syn-background)}.syn-auto-box>header{display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--syn-border);padding:14px 18px}.syn-auto-box h4{margin:0;font-size:14px;font-weight:600}.syn-auto-badge{display:inline-flex;align-items:center;border:1px solid var(--syn-border);border-radius:999px;padding:0 8px;font-size:11.5px;font-weight:500;color:var(--syn-foreground)}
.syn-auto-steps{margin:0;padding:16px 18px;list-style:none}.syn-auto-card{display:flex;align-items:flex-start;gap:12px;border:1px solid var(--syn-border);border-radius:12px;background:var(--syn-card);padding:14px}.syn-auto-num{display:grid;place-items:center;flex-shrink:0;width:28px;height:28px;border-radius:999px;background:color-mix(in srgb,var(--syn-primary) 14%,transparent);color:var(--syn-primary);font-size:12px;font-weight:600}.syn-auto-eyebrow{display:block;font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--syn-muted-foreground)}
.syn-auto-arrow{display:flex;height:24px;align-items:center;padding-left:22px;color:var(--syn-muted-foreground)}.syn-auto-field{display:flex;flex-direction:column;gap:5px;margin-top:10px}.syn-auto-field>span:first-child,.syn-auto-label{font-size:12px;font-weight:500}.syn-auto .syn-select,.syn-auto .syn-input{max-width:320px;min-height:32px;font-size:12.5px}
.syn-auto-var{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-height:32px;border:1px solid var(--syn-input);border-radius:7px;background:var(--syn-background);padding:4px 8px;font-size:12.5px;white-space:pre-wrap}.syn-auto-var[data-mono]{font-family:"Geist Mono",ui-monospace,monospace;font-size:12px}.syn-auto-var input{flex:1;min-width:80px;border:0;background:transparent;color:var(--syn-foreground);font:inherit;outline:none}.syn-auto-pill{border-radius:999px;background:color-mix(in srgb,var(--syn-primary) 13%,transparent);color:var(--syn-primary);padding:0 8px;font:500 11.5px/1.6 Geist,system-ui,sans-serif}
.syn-auto-pill[data-missing]{background:var(--syn-alert);color:var(--syn-destructive)}button.syn-auto-pill{border:0;cursor:pointer}.syn-auto-chips{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:8px;font-size:12px;color:var(--syn-muted-foreground)}.syn-auto-note{margin:8px 0 0;border-radius:8px;padding:7px 10px;font-size:12px;background:var(--syn-muted)}
.syn-auto-add{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:20px;border:1px dashed var(--syn-border);border-radius:12px;background:color-mix(in srgb,var(--syn-muted) 40%,transparent);padding:14px}.syn-auto-add p{margin:0}.syn-auto-foot{border-top:1px solid var(--syn-border);padding:12px 18px;font-size:12px;color:var(--syn-muted-foreground)}.syn-auto-foot p{margin:0}
.syn-auto-test{display:flex;flex-direction:column;gap:12px;border:1px solid var(--syn-border);border-radius:16px;padding:16px 18px}.syn-auto-notes{margin:0;padding:0;list-style:none;border:1px solid var(--syn-border);border-radius:8px;overflow:hidden}.syn-auto-notes li{display:flex;gap:8px;align-items:baseline;border-top:1px solid var(--syn-border);padding:6px 10px;cursor:pointer}.syn-auto-notes li:first-child{border-top:0}
.syn-auto-notes li[aria-selected=true]{background:var(--syn-accent);color:var(--syn-accent-foreground)}.syn-auto-warn{display:flex;gap:8px;border:1px solid var(--syn-alert-border);border-radius:8px;background:var(--syn-alert);color:var(--syn-alert-foreground);padding:8px 10px;font-size:12px}.syn-auto-warn[data-sim]{border-color:var(--syn-border);background:var(--syn-muted);color:var(--syn-muted-foreground)}.syn-auto-warn ul{margin:4px 0 0;padding:0;list-style:none}
.syn-auto-result ol{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}.syn-auto-result li{display:flex;gap:8px}.syn-auto-tpl{display:grid;grid-template-columns:1fr 1fr;gap:10px}.syn-auto-tpl button,.syn-auto-list button{display:flex;flex-direction:column;gap:3px;border:1px solid var(--syn-border);border-radius:12px;background:var(--syn-background);padding:12px 14px;color:var(--syn-foreground);text-align:left;font:inherit;cursor:pointer}
.syn-auto-tpl button:hover,.syn-auto-list button:hover{background:color-mix(in srgb,var(--syn-accent) 50%,transparent)}.syn-auto-list{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}.syn-auto-list button{flex-direction:row;align-items:center;width:100%}
`;

const SYN_AUTO_TYPES = ["markdown_export", "generate_text", "vault_write", "clipboard", "notification", "webhook", "command"];
const SYN_AUTO_ADVANCED = ["webhook", "command"];
const SYN_AUTO_OUTPUT = { markdown_export: "file", generate_text: "text", command: "text" };
const SYN_AUTO_EFFECT = { markdown_export: "file", vault_write: "vault", clipboard: "clipboard", notification: "notification", webhook: "webhook", command: "command" };

const synAutoLabels = () => ({
  trigger: {
    note_enhanced: [L("Meeting summary ready"), L("When the meeting summary is ready")],
    meeting_completed: [L("Meeting ends"), L("When the meeting ends")],
    manual: [L("Launched by hand"), L("When you launch it from a note")],
  },
  step: {
    markdown_export: [L("Export as Markdown"), L("Writes the note to a folder on your computer.")],
    generate_text: [L("Generate with the local model"), L("Applies an instruction (tasks, short summary, follow-up message); the result feeds the next steps.")],
    vault_write: [L("Write to the vault"), L("Creates or completes a note in the vault.")],
    clipboard: [L("Copy to the clipboard"), L("Ready to paste into a message or a document.")],
    notification: [L("System notification"), L("Lets you know when the automation has finished.")],
    webhook: [L("Send to an address (webhook)"), L("JSON to n8n, Home Assistant or a home server. The only step that leaves your computer.")],
    command: [L("Run a command"), L("Local script with the path of the exported file. Asks for confirmation the first time.")],
  },
  effect: { file: L("writes a Markdown file to the chosen folder"), vault: L("creates or completes a note in your vault"), clipboard: L("replaces the content of the clipboard"),
    notification: L("shows a system notification"), webhook: L("sends the JSON to the address, outside your computer"), command: L("runs the program on your computer") },
});

// Variables de la note : msgid avec msgctxt « automation variable » (non pris
// en charge par L), libellés français de messages.po.
const SYN_AUTO_VARS = [["summary", "Synthèse"], ["notes", "Notes"], ["transcript", "Transcription"], ["title", "Titre"], ["date", "Date"]];
const synAutoOutName = (step) => step.outputName?.trim() || (step.type === "command" ? L("Command output") : SYN_AUTO_OUTPUT[step.type] === "file" ? L("Exported file") : L("Generated text"));
const synAutoField = (...segs) => ({ segs, trail: "" });
const synAutoFilled = (f) => f.segs.length > 0 || f.trail.trim().length > 0;
const synAutoUrlOk = (url) => /^https?:\/\/[^\s@?]+$/.test(url.trim());

let synAutoSeq = 100;
const synAutoNew = (type) => {
  const id = `s${(synAutoSeq += 1)}`;
  if (type === "markdown_export") return { id, type, directory: "", include: { memo: true, summary: true, transcript: true, actions: true } };
  if (type === "generate_text") return { id, type, prompt: synAutoField(), outputName: "" };
  if (type === "vault_write") return { id, type, mode: "create", folder: synAutoField(), title: synAutoField(), content: synAutoField() };
  if (type === "clipboard") return { id, type, content: synAutoField() };
  if (type === "notification") return { id, type, title: synAutoField(), message: synAutoField() };
  if (type === "webhook") return { id, type, url: "", body: synAutoField({ t: '{\n  "title": "' }, { v: "title" }, { t: '",\n  "date": "' }, { v: "date" }, { t: '",\n  "summary": "' }, { v: "summary" }, { t: '"\n}' }) };
  return { id, type: "command", program: "", args: [], outputName: "" };
};

const synAutoReady = (step) => {
  if (step.type === "markdown_export") return Boolean(step.directory) && Object.values(step.include).some(Boolean);
  if (step.type === "generate_text") return synAutoFilled(step.prompt);
  if (step.type === "vault_write") return synAutoFilled(step.title) && synAutoFilled(step.content);
  if (step.type === "clipboard") return synAutoFilled(step.content);
  if (step.type === "notification") return synAutoFilled(step.title) || synAutoFilled(step.message);
  if (step.type === "webhook") return synAutoUrlOk(step.url);
  return step.program.trim().length > 0;
};

// Une pastille {v: "step:<id>"} pointe vers une étape placée avant.
const synAutoDangling = (wf) =>
  wf.steps.some((step, index) => {
    const before = wf.steps.slice(0, index).map((s) => `step:${s.id}`);
    return Object.values(step).some((f) => f && f.segs && f.segs.some((g) => g.v?.startsWith("step:") && !before.includes(g.v)));
  });
const synAutoWfReady = (wf) => wf.steps.length > 0 && wf.steps.every(synAutoReady) && !synAutoDangling(wf);

// Modèle « Extraire les tâches » (templates.ts). « Tâches » et « Tâches – » :
// msgctxt « vault folder » et « vault note title ».
const synAutoTasks = () => {
  const gen = { ...synAutoNew("generate_text"), prompt: synAutoField({ t: L("List the action items decided during the meeting, one per line, with the person responsible. Meeting summary:") + " " }, { v: "summary" }) };
  return [gen, { ...synAutoNew("vault_write"), folder: synAutoField({ t: "Tâches" }), title: synAutoField({ t: "Tâches – " }, { v: "title" }), content: synAutoField({ v: `step:${gen.id}` }) }];
};

const synAutoSample = () => [
  { id: "w1", title: L("Export as Markdown"), trigger: "meeting_completed", enabled: true, lastRun: ["il y a 20 heures", "/home/camille/Notes/2026-11-04 Point hebdo produit.md"], steps: [{ id: "s1", type: "markdown_export", directory: "/home/camille/Notes", include: { memo: true, summary: true, transcript: true, actions: true } }] },
  { id: "w2", title: L("Extract tasks"), trigger: "note_enhanced", enabled: false, lastRun: null, steps: synAutoTasks() },
  { id: "w3", title: "Copier le suivi", trigger: "manual", enabled: false, lastRun: null, steps: [{ id: "s4", type: "generate_text", outputName: "Message de suivi", prompt: synAutoField({ t: "Rédige un court message de suivi à partir de : " }, { v: "summary" }) }, { id: "s5", type: "clipboard", content: synAutoField({ v: "step:s4" }) }] },
];

const SYN_AUTO_NOTES = [["n1", "Point hebdo produit", "mar. 4 nov., 10:30"], ["n2", "Revue de lancement bêta", "lun. 3 nov., 14:00"], ["n3", "Atelier tarification", "ven. 31 oct., 09:15"]];

/** VariableField : texte et pastilles, puis « Insérer » (une pastille par variable). */
const SynAutoVar = ({ label, value, onChange, vars, mono, placeholder }) => {
  const nameOf = (v) => vars.find((x) => x.token === v)?.label;
  return (
    <div className="syn-auto-field">
      <span>{label}</span>
      <div className="syn-auto-var" data-mono={mono ? "" : undefined} role="group" aria-label={label}>
        {value.segs.map((g, i) => (g.v ? <span key={i} className="syn-auto-pill" title={`{{${g.v}}}`} data-missing={nameOf(g.v) ? undefined : ""}>{nameOf(g.v) ?? L("Missing output")}</span> : <span key={i}>{g.t}</span>))}
        <input aria-label={label} value={value.trail} placeholder={value.segs.length ? "" : placeholder} onChange={(e) => onChange({ ...value, trail: e.target.value })}
          onKeyDown={(e) => e.key === "Backspace" && !value.trail && value.segs.length && onChange({ ...value, segs: value.segs.slice(0, -1) })} />
      </div>
      <div className="syn-auto-chips" style={{ marginTop: 2 }}>
        <span>{L("Insert")}</span>
        {vars.map((v) => (
          <button key={v.token} type="button" className="syn-auto-pill" title={`{{${v.token}}}`} onClick={() => onChange({ segs: [...value.segs, ...(value.trail ? [{ t: value.trail }] : []), { v: v.token }, { t: " " }], trail: "" })}>
            + {v.label}
          </button>
        ))}
      </div>
    </div>
  );
};

const SynAutoText = ({ label, value, onChange, placeholder, error }) => {
  const id = useId();
  return (
    <div className="syn-auto-field">
      <label className="syn-auto-label" htmlFor={id}>{label}</label>
      <input id={id} className="syn-input" value={value} placeholder={placeholder} aria-invalid={Boolean(error)} onChange={(e) => onChange(e.target.value)} />
      {error ? <span style={{ color: "var(--syn-destructive)", fontSize: 12 }}>{error}</span> : null}
    </div>
  );
};

const SynAutoTypeOptions = ({ labels }) => (
  <>
    {SYN_AUTO_TYPES.filter((t) => !SYN_AUTO_ADVANCED.includes(t)).map((t) => <option key={t} value={t}>{labels.step[t][0]}</option>)}
    <optgroup label={L("Advanced")}>
      {SYN_AUTO_ADVANCED.map((t) => <option key={t} value={t}>{labels.step[t][0]}</option>)}
    </optgroup>
  </>
);

/** Formulaire d'une étape (step-forms.tsx, markdown-export-*.tsx). */
const SynAutoConfig = ({ step, set, vars }) => {
  const v = (key, label, extra = {}) => h(SynAutoVar, { label, value: step[key], vars, onChange: (val) => set({ [key]: val }), ...extra });
  const outName = h(SynAutoText, { label: L("Result available to the next steps under the name"), value: step.outputName, placeholder: synAutoOutName({ ...step, outputName: "" }), onChange: (val) => set({ outputName: val }) });
  if (step.type === "markdown_export") {
    const items = [["memo", L("Memo")], ["summary", L("Summary")], ["transcript", L("Transcript")], ["actions", L("Collect action items")]];
    return (
      <>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h5 style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>{L("Export folder")}</h5>
            <p className="syn-muted" style={{ margin: "2px 0 0", fontSize: 12 }}>{step.directory || L("No folder selected yet.")}</p>
          </div>
          <button type="button" className="syn-ui-btn" onClick={() => set({ directory: "/home/camille/Notes/Réunions" })}>{h(SynIcon, { name: I("FolderOpen"), size: 14 })}{L("Choose folder")}</button>
        </div>
        <div className="syn-auto-field">
          <span>{L("Include")}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {items.map(([key, label]) => (
              <label key={key} className="syn-check" style={{ fontSize: 12.5 }}>
                <input type="checkbox" checked={step.include[key]} onChange={() => set({ include: { ...step.include, [key]: !step.include[key] } })} />
                {label}
              </label>
            ))}
          </div>
          {Object.values(step.include).some(Boolean) ? null : <span style={{ color: "var(--syn-destructive)", fontSize: 12 }}>{L("Choose at least one section to export.")}</span>}
        </div>
      </>
    );
  }
  if (step.type === "generate_text")
    return <>{v("prompt", L("Instruction"), { placeholder: L("List the decisions and the tasks, one per line…") })}<p className="syn-muted" style={{ margin: "8px 0 0", fontSize: 12 }}>{L("Uses the local model chosen in Settings › Synthesis. Nothing leaves your computer.")}</p>{outName}</>;
  if (step.type === "vault_write")
    return (
      <>
        <select className="syn-select" aria-label={L("What to do in the vault")} value={step.mode} onChange={(e) => set({ mode: e.target.value })}>
          <option value="create">{L("Create a new note")}</option>
          <option value="append">{L("Complete the note with the same title")}</option>
        </select>
        {v("folder", L("Vault folder"), { placeholder: L("At the root of the vault") })}
        {v("title", L("Note title"))}
        {v("content", L("Content"))}
      </>
    );
  if (step.type === "clipboard") return v("content", L("Content"));
  if (step.type === "notification") return <>{v("title", L("Notification title"))}{v("message", L("Text"))}</>;
  if (step.type === "webhook")
    return (
      <>
        <p className="syn-auto-note">{L("The only step that leaves your computer: the JSON is sent to the address below. Use an address you trust, such as n8n, Home Assistant or a home server.")}</p>
        {h(SynAutoText, { label: L("Address (URL)"), value: step.url, placeholder: "http://localhost:5678/webhook/syntheo", error: step.url.trim() && !synAutoUrlOk(step.url) ? L("Use an http:// or https:// address.") : null, onChange: (url) => set({ url }) })}
        {v("body", L("JSON body"), { mono: true })}
        <p className="syn-muted" style={{ margin: "4px 0 0", fontSize: 12 }}>{L("Variables are inserted as JSON text, inside quotes. Redirects are not followed; the request stops after 15 seconds.")}</p>
      </>
    );
  return (
    <>
      <p className="syn-auto-note">{L("Syntheo asks for your confirmation the first time this exact command runs. Each argument is passed as is, without a shell; the run stops after 60 seconds.")}</p>
      {h(SynAutoText, { label: L("Program"), value: step.program, placeholder: "/home/me/scripts/publish.sh", onChange: (program) => set({ program }) })}
      <span className="syn-auto-label" style={{ display: "block", marginTop: 10 }}>{L("Arguments")}</span>
      {step.args.map((arg, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
          <div style={{ flex: 1 }}>{h(SynAutoVar, { label: LF("Argument {position}", { position: i + 1 }), value: arg, vars, onChange: (val) => set({ args: step.args.map((a, j) => (j === i ? val : a)) }) })}</div>
          <button type="button" className="syn-icon-btn" aria-label={LF("Remove argument {position}", { position: i + 1 })} onClick={() => set({ args: step.args.filter((_, j) => j !== i) })}>{h(SynIcon, { name: I("X"), size: 14 })}</button>
        </div>
      ))}
      <button type="button" className="syn-ui-btn" style={{ marginTop: 8 }} onClick={() => set({ args: [...step.args, synAutoField()] })}>{h(SynIcon, { name: I("Plus"), size: 12 })}{L("Add an argument")}</button>
      {outName}
    </>
  );
};

/** « Tester sur une note » et « Résultat du test ». */
const SynAutoTest = ({ wf, labels, onClose }) => {
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("n1");
  const [simulate, setSimulate] = useState(false);
  const [phase, setPhase] = useState("idle");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const notes = SYN_AUTO_NOTES.filter(([, t]) => synNorm(t).includes(synNorm(query.trim())));
  const effects = wf.steps.map((s, i) => [s, i + 2]).filter(([s]) => SYN_AUTO_EFFECT[s.type]);
  const title = SYN_AUTO_NOTES.find(([id]) => id === note)[1];
  const text = (f) => f.segs.map((g) => (g.v === "title" ? title : g.v === "date" ? "2026-11-04" : g.v ? "…" : g.t)).join("") + f.trail;
  const detail = (s) => {
    if (s.type === "markdown_export") return simulate ? s.directory : `${s.directory}/2026-11-04 ${title}.md`;
    if (s.type === "generate_text") return "Texte généré (412 caractères)";
    if (s.type === "vault_write") return simulate ? `Créerait la note « ${text(s.title).trim()} »` : `${L("Created:")} ${text(s.title).trim()}`;
    if (s.type === "clipboard") return simulate ? "Copierait le texte dans le presse-papiers" : "Copié dans le presse-papiers";
    if (s.type === "notification") return simulate ? "Afficherait une notification" : "Notification affichée";
    if (s.type === "webhook") return simulate ? `Enverrait le JSON à ${s.url}` : `Envoyé à ${s.url} (statut 200)`;
    return simulate ? `Lancerait ${s.program}` : `Commande terminée : ${s.program}`;
  };
  const pick = (id) => {
    setNote(id);
    setPhase("idle");
  };
  const run = () => {
    setPhase("running");
    timer.current = setTimeout(() => setPhase("done"), 900);
  };
  const rows = [[`1 · ${labels.trigger[wf.trigger][1]}`, LF("Note “{noteTitle}”", { noteTitle: title }), false], ...wf.steps.map((s, i) => [`${i + 2} · ${labels.step[s.type][0]}`, detail(s), simulate && SYN_AUTO_EFFECT[s.type]])];
  return (
    <section className="syn-auto-test" aria-labelledby="syn-auto-test-title">
      <div style={{ display: "flex", alignItems: "center" }}>
        <h4 id="syn-auto-test-title" style={{ flex: 1, margin: 0, fontSize: 14 }}>{L("Test on a note")}</h4>
        <button type="button" className="syn-icon-btn" aria-label={L("Close the test")} onClick={onClose}>{h(SynIcon, { name: I("X"), size: 14 })}</button>
      </div>
      <p className="syn-muted" style={{ margin: "-6px 0 0", fontSize: 12 }}>{L("Syntheo runs the automation as it is edited, even unsaved, on the note you choose.")}</p>
      <div className="syn-auto-field" style={{ marginTop: 0 }}>
        <span>{L("Note")}</span>
        <input className="syn-input" aria-label={L("Search by title")} placeholder={L("Search by title")} value={query} onChange={(e) => setQuery(e.target.value)} />
        <ul className="syn-auto-notes" role="listbox" aria-label={L("Note to test on")}>
          {notes.length === 0 ? <li role="presentation" className="syn-muted">{L("No note matches this search.")}</li> : null}
          {notes.map(([id, t, date]) => (
            <li key={id} role="option" tabIndex={0} aria-selected={id === note} onClick={() => pick(id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(id); } }}>
              <span style={{ fontWeight: 500 }}>{t}</span>
              {id === "n1" ? <span className="syn-muted" style={{ fontSize: 11.5 }}>{L("most recent")}</span> : null}
              <span className="syn-muted" style={{ marginLeft: "auto", fontSize: 12 }}>{date}</span>
            </li>
          ))}
        </ul>
      </div>
      {effects.length ? (
        <div role="note" className="syn-auto-warn" data-sim={simulate ? "" : undefined}>
          {h(SynIcon, { name: I("Warning"), size: 14 })}
          <div>
            <strong>{simulate ? L("These steps will be simulated: nothing is written, sent or run.") : L("This is a real test: these steps really act.")}</strong>
            <ul>{effects.map(([s, n]) => <li key={s.id}><strong>{n} · {labels.step[s.type][0]}</strong> — {labels.effect[SYN_AUTO_EFFECT[s.type]]}</li>)}</ul>
          </div>
        </div>
      ) : (
        <p className="syn-muted" style={{ margin: 0, fontSize: 12 }}>{L("No step acts outside Syntheo: the test only shows the results.")}</p>
      )}
      <label className="syn-check" style={{ alignItems: "flex-start", fontSize: 12 }}>
        <input type="checkbox" checked={simulate} onChange={(e) => { setSimulate(e.target.checked); setPhase("idle"); }} />
        <span><strong style={{ display: "block", fontWeight: 500 }}>{L("Simulate the steps with real effects")}</strong><span className="syn-muted">{L("They describe what they would do, without acting. The local model still generates its text.")}</span></span>
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" className="syn-ui-btn" onClick={onClose}>{L("Cancel")}</button>
        <button type="button" className="syn-ui-btn" data-variant="primary" disabled={phase === "running"} onClick={run}>
          {h(SynIcon, { name: phase === "running" ? I("CircleNotch") : I("Play"), size: 14 })}
          {phase === "running" ? L("Test running…") : L("Run the test")}
        </button>
      </div>
      {phase === "done" ? (
        <div className="syn-auto-result" role="region" aria-labelledby="syn-auto-result-title" style={{ borderTop: "1px solid var(--syn-border)", paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", marginBottom: 8 }}>
            <h5 id="syn-auto-result-title" style={{ flex: 1, margin: 0, fontSize: 14 }}>{L("Test result")}</h5>
            <span className="syn-muted" style={{ fontSize: 12 }}>{LF("{seconds} s", { seconds: "1,8" })}</span>
          </div>
          <ol>
            {rows.map(([head, body, sim]) => (
              <li key={head}>
                {h(SynIcon, { name: I("Check"), size: 14, style: { color: "var(--syn-primary)", marginTop: 2 } })}
                <span><strong style={{ fontWeight: 500 }}>{head}</strong> {sim ? <span className="syn-auto-badge">{L("Simulated")}</span> : null}<br /><span className="syn-muted" style={{ fontSize: 12, wordBreak: "break-all" }}>{body}</span></span>
              </li>
            ))}
          </ol>
          <p className="syn-muted" style={{ margin: "8px 0 0", fontSize: 12 }}>{L("The test changes neither the last run nor the list of notes already processed.")}</p>
        </div>
      ) : null}
    </section>
  );
};

const synAutoStatus = (wf) => (wf.trigger === "manual" ? L("Manual") : wf.enabled ? L("Enabled") : L("Draft"));

/** WorkflowBuilder : « Étapes », Quand (1), puis chaque action, « Ajouter une étape ». */
const SynAutoBuilder = ({ wf, labels, update, hs }) => {
  const nameId = useId();
  const setStep = (id, p) => update({ steps: wf.steps.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  const vars = (index) => [
    ...SYN_AUTO_VARS.map(([token, label]) => ({ token, label })),
    ...wf.steps.slice(0, index).filter((s) => SYN_AUTO_OUTPUT[s.type]).map((s) => ({ token: `step:${s.id}`, label: synAutoOutName(s) })),
  ];
  const card = (n, eyebrow, title, body, extra) => (
    <li key={n}>
      {n > 1 ? <div className="syn-auto-arrow" aria-hidden="true">{h(SynIcon, { name: I("ArrowRight"), size: 13, style: { transform: "rotate(90deg)" } })}</div> : null}
      <div className="syn-auto-card">
        <span className="syn-auto-num">{n}</span>
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <span><span className="syn-auto-eyebrow">{eyebrow}</span><span style={{ fontWeight: 500, fontSize: 14 }}>{title}</span></span>
            {extra}
          </div>
          <div style={{ marginTop: 10 }}>{body}</div>
        </div>
      </div>
    </li>
  );
  return (
    <section className="syn-auto-box" aria-labelledby="syn-auto-steps-title">
      <header>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h4 id="syn-auto-steps-title">{L("Steps")}</h4>
          <span className="syn-auto-badge">{synAutoStatus(wf)}</span>
        </div>
        <p className="syn-muted" style={{ margin: 0, fontSize: 12 }}>{L("Syntheo runs the steps in order on your computer: the trigger is step 1, then each action follows.")}</p>
        <label className="syn-auto-label" htmlFor={nameId}>{L("Name")}</label>
        <input id={nameId} className="syn-input" value={wf.title} placeholder={L("Untitled automation")} onChange={(e) => update({ title: e.target.value })} />
      </header>
      <ol className="syn-auto-steps">
        {card(1, L("When"), labels.trigger[wf.trigger][1], (
          <>
            {hs(2, { left: -48, top: -6 })}
            <select className="syn-select" aria-label={L("Trigger")} value={wf.trigger} onChange={(e) => update({ trigger: e.target.value })}>
              {Object.entries(labels.trigger).map(([id, [, long]]) => <option key={id} value={id}>{long}</option>)}
            </select>
            {wf.trigger === "manual" ? <p className="syn-muted" style={{ margin: "8px 0 0", fontSize: 12 }}>{L("Launch it from a note: the ⋯ menu, the capsule in Synthesis, or Ask the note (Ctrl+J).")}</p> : null}
            <div className="syn-auto-chips"><span>{L("Available to the next steps")}</span>{SYN_AUTO_VARS.map(([t, label]) => <span key={t} className="syn-auto-pill" title={`{{${t}}}`}>{label}</span>)}</div>
          </>
        ))}
        {wf.steps.map((step, index) =>
          card(index + 2, L("Then"), labels.step[step.type][0], (
            <>
              <select className="syn-select" aria-label={L("Action")} value={step.type} onChange={(e) => update({ steps: wf.steps.map((s) => (s.id === step.id ? { ...synAutoNew(e.target.value), id: s.id } : s)) })}>
                {h(SynAutoTypeOptions, { labels })}
              </select>
              <div style={{ position: "relative" }}>
                {index === 0 ? hs(4, { left: -40, top: 12 }) : null}
                {h(SynAutoConfig, { step, vars: vars(index), set: (p) => setStep(step.id, p) })}
              </div>
              {SYN_AUTO_OUTPUT[step.type] === "file" ? <div className="syn-auto-chips"><span>{L("Result available to the next steps as")}</span><span className="syn-auto-pill">{synAutoOutName(step)}</span></div> : null}
            </>
          ), (
            <>
              {synAutoReady(step) ? null : <span className="syn-auto-badge">{L("Needs setup")}</span>}
              <button type="button" className="syn-icon-btn" style={{ marginLeft: "auto" }} aria-label={LF("Remove step {stepNumber}", { stepNumber: index + 2 })} onClick={() => update({ steps: wf.steps.filter((s) => s.id !== step.id) })}>{h(SynIcon, { name: I("Trash"), size: 13 })}</button>
            </>
          )),
        )}
        <li className="syn-auto-add" style={{ position: "relative" }}>
          {hs(3, { left: -12, top: -10 })}
          <div>
            <p style={{ fontWeight: 500 }}>{L("Add a step")}</p>
            <p className="syn-muted" style={{ fontSize: 12 }}>{L("Each new step runs after the previous one.")}</p>
          </div>
          <select className="syn-select" style={{ width: 200 }} aria-label={L("Add a step")} value="" onChange={(e) => e.target.value && update({ steps: [...wf.steps, synAutoNew(e.target.value)] })}>
            <option value="">+ {L("Add a step")}</option>
            {h(SynAutoTypeOptions, { labels })}
          </select>
        </li>
      </ol>
      <div className="syn-auto-foot">
        {synAutoWfReady(wf) ? null : <p>{L("Add at least one configured action before enabling.")}</p>}
        {wf.lastRun ? <p>{LF("Last run {relative}: {0}", { relative: wf.lastRun[0], 0: wf.lastRun[1] })}</p> : null}
      </div>
    </section>
  );
};

/** Vue d'ensemble, sans automatisation ouverte : modèles et « Mes automatisations ». */
const SynAutoOverview = ({ wfs, labels, create, open }) => {
  const chain = (trigger, types) => [labels.trigger[trigger][0], ...types.map((t) => labels.step[t][0])].join(" → ");
  const tpl = [["md", "meeting_completed", [L("Export as Markdown"), L("Every finished meeting is saved as a Markdown file in a folder.")], () => [synAutoNew("markdown_export")]], ["tasks", "note_enhanced", [L("Extract tasks"), L("The local model lists the actions to take and adds them to the vault.")], synAutoTasks]];
  return (
    <div className="syn-auto-scroll">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
        <div style={{ flex: 1 }}>{h(SynSettingsTitle, { title: L("Automations"), lede: L("Syntheo chains local steps after your meetings. Nothing leaves your computer, except a webhook step if you add one.") })}</div>
        <button type="button" className="syn-ui-btn" data-variant="primary" onClick={() => create([])}>{h(SynIcon, { name: I("Plus"), size: 14 })}{L("New automation")}</button>
      </div>
      <h4 style={{ margin: 0, fontSize: 14 }}>{L("Start from a template")}</h4>
      <div className="syn-auto-tpl">
        {tpl.map(([id, trigger, [title, desc], steps]) => (
          <button key={id} type="button" onClick={() => create(steps(), title, trigger)}><b style={{ fontWeight: 500 }}>{title}</b><span className="syn-muted" style={{ fontSize: 12 }}>{desc}</span><span className="syn-auto-pill" style={{ alignSelf: "flex-start" }}>{chain(trigger, steps().map((st) => st.type))}</span></button>
        ))}
      </div>
      <h4 style={{ margin: 0, fontSize: 14 }}>{L("My automations")}</h4>
      <ul className="syn-auto-list">
        {wfs.map((wf) => (
          <li key={wf.id}><button type="button" onClick={() => open(wf.id)}><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontWeight: 500 }}>{wf.title || L("Untitled automation")}</b><span className="syn-muted" style={{ fontSize: 12 }}>{wf.lastRun ? LF("{chain} · last run {relative}", { chain: chain(wf.trigger, wf.steps.map((s) => s.type)), relative: wf.lastRun[0] }) : LF("{chain} · never run", { chain: chain(wf.trigger, wf.steps.map((s) => s.type)) })}</span></span><span className="syn-auto-badge">{synAutoStatus(wf)}</span></button></li>
        ))}
      </ul>
    </div>
  );
};

/**
 * La vue Automatisations. `view` : "editor" (défaut, « Extraire les tâches »
 * ouverte) ou "overview" ; `testing` ouvre « Tester sur une note ».
 * Repères : 1 « Mes automatisations » et +, 2 « Quand », 3 « Ajouter une
 * étape », 4 « Insérer », 5 « Tester ».
 */
export const AutomationEditor = ({ view = "editor", testing = false, markers = true }) => {
  const initial = () => ({ wfs: synAutoSample(), sel: view === "overview" ? null : "w2", search: "", testing });
  const [s, setS] = useState(initial);
  const [showMarkers, setShowMarkers] = useState(markers);
  const labels = synAutoLabels();
  const patch = (p) => setS((prev) => ({ ...prev, ...p }));
  const wf = s.wfs.find((w) => w.id === s.sel);
  const ready = wf ? synAutoWfReady(wf) : false;
  const hs = (n, style) => (showMarkers ? h(SynHotspot, { n, style }) : null);
  // Toute modification enregistre ; elle désactive l'automatisation si elle n'est plus prête.
  const update = (p) => setS((prev) => ({ ...prev, wfs: prev.wfs.map((w) => (w.id === prev.sel ? { ...w, ...p, enabled: (p.enabled === undefined ? w.enabled : p.enabled) && synAutoWfReady({ ...w, ...p }) } : w)) }));
  const create = (steps, title = "", trigger = "note_enhanced") => {
    const id = `w${(synAutoSeq += 1)}`;
    setS((prev) => ({ ...prev, sel: id, testing: false, wfs: [{ id, title, trigger, enabled: false, lastRun: null, steps }, ...prev.wfs] }));
  };
  const q = synNorm(s.search.trim());
  const list = s.wfs.filter((w) => !q || synNorm(w.title || L("Untitled automation")).includes(q));
  return h(
    SynFigure,
    { title: L("Automations"), width: 1000, markers: showMarkers, setMarkers: setShowMarkers, onReset: () => setS(initial()) },
    <div className="syn-auto">
      <nav className="syn-auto-side" aria-label={L("Automations")} style={{ position: "relative" }}>
        {hs(1, { right: 40, top: 12 })}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="syn-icon-btn" aria-label={L("New automation")} title={L("New automation")} onClick={() => create([])}>{h(SynIcon, { name: I("Plus") })}</button>
        </div>
        <label className="syn-set-search">
          {h(SynIcon, { name: I("MagnifyingGlass"), size: 15 })}
          <input type="text" value={s.search} placeholder={L("Search automations...")} aria-label={L("Search automations...")} onChange={(e) => patch({ search: e.target.value })} onKeyDown={(e) => e.key === "Escape" && patch({ search: "" })} />
        </label>
        {list.length ? <p className="syn-muted" style={{ margin: "4px 0 0 10px", fontSize: 12, fontWeight: 500 }}>{L("My automations")}</p> : <p className="syn-muted" style={{ textAlign: "center", fontSize: 13 }}>{L("No automations found")}</p>}
        {list.map((w) => (
          <button key={w.id} type="button" className="syn-auto-item" aria-current={w.id === s.sel ? "page" : undefined} onClick={() => patch({ sel: w.id, testing: false })}>
            {h(SynIcon, { name: I("Lightning"), style: { color: "var(--syn-muted-foreground)" } })}
            <span style={{ minWidth: 0 }}><b>{w.title || L("Untitled automation")}</b><small>{synAutoStatus(w)}</small></span>
          </button>
        ))}
      </nav>
      <div className="syn-auto-main">
        {wf ? (
          <>
            <div className="syn-auto-head">
              <h3>{wf.title.trim() || L("Untitled automation")}</h3>
              <span style={{ position: "relative" }}>
                {hs(5, { left: -10, top: -12 })}
                {/* « Tester » : msgid « Test », msgctxt « automation ». */}
                <button type="button" className="syn-ui-btn" disabled={!ready} aria-pressed={s.testing} title={ready ? undefined : L("Configure every step before testing.")} onClick={() => patch({ testing: true })}>{h(SynIcon, { name: I("Play"), size: 14 })}Tester</button>
              </span>
              {wf.trigger === "manual" ? null : wf.enabled ? (
                <button type="button" className="syn-ui-btn" onClick={() => update({ enabled: false })}>{L("Disable")}</button>
              ) : (
                <button type="button" className="syn-ui-btn" data-variant="primary" disabled={!ready} title={ready ? undefined : L("Add and configure at least one action first.")} onClick={() => update({ enabled: true })}>{h(SynIcon, { name: I("Lightning"), size: 14 })}{L("Save & enable")}</button>
              )}
              {h(SynMenuButton, { label: L("Automation actions"), items: [{ label: L("Delete automation"), onSelect: () => setS((prev) => ({ ...prev, sel: null, testing: false, wfs: prev.wfs.filter((w) => w.id !== prev.sel) })) }] })}
            </div>
            <div className="syn-auto-scroll">
              <p className="syn-muted" style={{ margin: 0 }}>{L("Set the trigger and the actions. The chat on the right can help you shape the automation.")}</p>
              {s.testing && ready ? h(SynAutoTest, { key: wf.id, wf, labels, onClose: () => patch({ testing: false }) }) : null}
              {h(SynAutoBuilder, { wf, labels, update, hs })}
            </div>
          </>
        ) : (
          h(SynAutoOverview, { wfs: s.wfs, labels, create, open: (id) => patch({ sel: id }) })
        )}
      </div>
    </div>,
  );
};
