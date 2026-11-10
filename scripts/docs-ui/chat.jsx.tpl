// <AskNote> : « Demander à la note » (Ctrl+J), le chat ouvert à droite d'une
// note à l'étape Synthèse. Reproduit apps/desktop/src/chat/components/
// toolbar-controls.tsx (historique, « Nouveau chat », « Chat flottant »,
// « Fermer la discussion »), body/empty.tsx (suggestions, « Lancer une
// automatisation », sans modèle : « Ouvrir les paramètres de l'IA »),
// folders/project/next-meeting-suggestion.tsx, input/index.tsx (champ, saisie
// vocale, envoi), les mentions @ de editor-bridge/mention-config.ts
// (dossiers, notes, contacts ; 8 au plus), message/normal.tsx (« Activité »),
// message/tool/edit-summary.tsx et session/components/living-document/
// summary-review.tsx (modification proposée du résumé), la capsule en
// Synthèse (session/components/capsule/, automation-menu.tsx) et la
// notification de automations/launch.tsx. Réponses du modèle : exemples.

const SYN_CSS_CHAT = `
.syn-chat-body{display:flex;height:540px}
.syn-chat-doc{position:relative;flex:1 1 auto;min-width:0;overflow:auto;padding:22px 28px 96px}
.syn-chat-meta{margin:-6px 0 16px;font-size:13px;color:var(--syn-muted-foreground)}
.syn-chat-cap .syn-menu{top:auto!important;bottom:calc(100% + 8px);color:var(--syn-foreground)}
.syn-chat-cap .syn-menu [role=menuitem]{align-items:flex-start}
.syn-chat-review{border:1px solid var(--syn-border);border-radius:14px;background:var(--syn-card);margin:0 0 16px}
.syn-chat-review header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid var(--syn-border);padding:9px 14px}
.syn-chat-review header p{margin:0;font-size:12px;color:var(--syn-muted-foreground)}
.syn-chat-review header p:first-child{font-size:13px;font-weight:500;color:var(--syn-foreground)}
.syn-chat-diff{display:flex;flex-direction:column;gap:6px;padding:12px 14px}
.syn-chat-diff del,.syn-chat-diff ins{display:block;border-left:2px solid;border-radius:0 6px 6px 0;padding:2px 10px;text-decoration:none}
.syn-chat-diff del{border-color:var(--syn-destructive);color:var(--syn-muted-foreground);text-decoration:line-through;background:color-mix(in srgb,var(--syn-destructive) 6%,transparent)}
.syn-chat-diff ins{border-color:var(--syn-primary);background:color-mix(in srgb,var(--syn-accent) 70%,transparent)}
.syn-chat-panel{position:relative;flex:0 0 340px;display:flex;flex-direction:column;border-left:1px solid var(--syn-border);background:var(--syn-background)}
.syn-chat-bar{display:flex;align-items:center;gap:2px;height:44px;padding:0 6px 0 10px}
.syn-chat-bar .syn-icon-btn{border-radius:999px}
.syn-chat-hist{display:flex;align-items:center;gap:4px;width:auto;padding:0 8px}
.syn-chat-msgs{flex:1;overflow:auto;display:flex;flex-direction:column;gap:12px;padding:6px 14px 12px}
.syn-chat-sugg{display:grid;grid-template-columns:24px minmax(0,1fr);align-items:center;gap:6px;width:100%;border:0;border-radius:8px;background:transparent;color:var(--syn-muted-foreground);padding:7px 10px 7px 0;font:400 13.5px/1.3 Geist,system-ui,sans-serif;text-align:left;cursor:pointer}
.syn-chat-sugg:hover{background:var(--syn-muted);color:var(--syn-foreground)}
.syn-chat-sugg span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.syn-chat-sugg svg{justify-self:center}
.syn-chat-group-label{margin:8px 0 2px;font-size:12px;font-weight:500;color:var(--syn-muted-foreground)}
.syn-chat-user{align-self:flex-end;max-width:88%;border-radius:14px;background:var(--syn-muted);padding:7px 11px;font-size:13.5px}
.syn-chat-bot{font-size:13.5px}
.syn-chat-bot p{margin:0 0 6px}
.syn-chat-disc{display:inline-flex;align-items:center;gap:5px;margin-bottom:6px;border:0;background:none;padding:2px 0;font:inherit;font-size:12px;color:var(--syn-muted-foreground);cursor:pointer}
.syn-chat-tool{margin-top:6px;border:1px solid var(--syn-border);border-radius:12px;background:var(--syn-card);font-size:12.5px}
.syn-chat-tool>p{display:flex;align-items:center;gap:6px;margin:0;padding:8px 12px;font-weight:500}
.syn-chat-tool>div{display:flex;justify-content:flex-end;gap:6px;border-top:1px solid var(--syn-border);padding:8px 12px}
.syn-chat-input{position:relative;margin:0 10px 10px;border:1px solid var(--syn-input);border-radius:16px;background:var(--syn-card);padding:8px 8px 6px 12px}
.syn-chat-input input{width:100%;border:0;background:transparent;color:var(--syn-foreground);font:400 13.5px/1.4 Geist,system-ui,sans-serif;outline:none}
.syn-chat-input input::placeholder{color:var(--syn-faint)}
.syn-chat-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.syn-chat-row input{flex:1;min-width:120px}
.syn-chat-chip{border-radius:6px;background:var(--syn-accent);color:var(--syn-accent-foreground);padding:0 6px;font-size:12.5px}
.syn-chat-send{display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:999px;background:var(--syn-primary);color:var(--syn-primary-foreground);cursor:pointer}
.syn-chat-send:disabled{background:var(--syn-muted);color:var(--syn-muted-foreground);cursor:default}
.syn-chat-mentions{position:absolute;left:0;right:0;bottom:calc(100% + 6px);z-index:20;margin:0;padding:4px;list-style:none;border:1px solid var(--syn-border);border-radius:10px;background:var(--syn-popover);box-shadow:var(--syn-shadow-capsule)}
.syn-chat-mentions li{display:flex;align-items:center;gap:8px;border-radius:6px;padding:6px 8px;font-size:13px;cursor:pointer}
.syn-chat-mentions li[aria-selected=true]{background:var(--syn-muted)}
.syn-chat-mentions li span:nth-child(2){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.syn-chat-mentions li span:last-child{margin-left:auto;flex-shrink:0;font-size:12px;color:var(--syn-muted-foreground)}
.syn-chat-beta{border:1px solid color-mix(in srgb,var(--syn-primary) 30%,transparent);border-radius:999px;background:var(--syn-accent);color:var(--syn-accent-foreground);padding:1px 6px;font-size:10px;font-weight:500}
.syn-chat-toast{position:absolute;right:16px;bottom:16px;z-index:30;display:flex;align-items:flex-start;gap:10px;max-width:360px;border:1px solid var(--syn-border);border-radius:12px;background:var(--syn-popover);box-shadow:var(--syn-shadow-capsule);padding:10px 12px;font-size:13px}
.syn-chat-toast small{display:block;margin-top:2px;font-size:12px;color:var(--syn-muted-foreground);word-break:break-all}
`;

const SYN_CHAT_SUMMARY = [
  ["Décisions", ["La bêta est décalée au 21 novembre.", "Le quota du serveur de transcription est vérifié avant jeudi."]],
  ["Actions", ["Camille : prévenir les testeurs (mardi).", "Malik : vérifier le quota du serveur (jeudi)."]],
];
const SYN_CHAT_SHORTER = [["Décisions et actions", ["Bêta décalée au 21 novembre : Camille prévient les testeurs mardi, Malik vérifie le quota du serveur jeudi."]]];
const SYN_CHAT_LONGER = [
  ["Décisions", ["La bêta est décalée au 21 novembre, pour laisser une semaine de tests à l'équipe support.", "Le quota du serveur de transcription est vérifié avant jeudi : la bêta doublera le nombre de sessions simultanées."]],
  ["Actions", ["Camille : prévenir les testeurs du nouveau calendrier (mardi).", "Malik : vérifier le quota du serveur et prévoir une marge (jeudi)."]],
];

// Mentions : même recherche et même ordre que la palette Ctrl+K.
const SYN_CHAT_POOL = [
  { type: "folder", label: "Roadmap", count: 12, keys: "roadmap produit" },
  { type: "folder", label: "Lancement", count: 5, keys: "lancement projets" },
  { type: "session", label: "Point hebdo produit", folder: "Produit/Roadmap", keys: "point hebdo produit" },
  { type: "session", label: "Revue de lancement bêta", folder: "Projets/Lancement", keys: "revue lancement beta bêta" },
  { type: "session", label: "Atelier tarification", folder: "Produit/Roadmap", keys: "atelier tarification lancement" },
  { type: "session", label: "Rétro sprint 44", keys: "retro rétro sprint" },
  { type: "human", label: "Camille Roussel", keys: "camille roussel" },
  { type: "human", label: "Malik Benali", keys: "malik benali" },
];
const SYN_CHAT_MENTION_ICONS = { folder: I("Folder"), session: I("Note"), human: I("User") };

const synChatMentions = (query) => {
  const q = synNorm(query);
  const hits = SYN_CHAT_POOL.filter((p) => !q || synNorm(p.keys + " " + p.label).includes(q));
  const folders = hits.filter((p) => p.type === "folder").slice(0, 8);
  const contacts = hits.filter((p) => p.type === "human").slice(0, Math.max(0, 8 - folders.length));
  const notes = hits.filter((p) => p.type === "session").slice(0, Math.max(0, 8 - folders.length - contacts.length));
  return [...folders, ...notes, ...contacts];
};

// Automatisations prêtes : titre, puis les actions enchaînées (launch.tsx).
const synChatAutomations = () => [
  { title: L("Export as Markdown"), chain: L("Export as Markdown"), detail: "/home/camille/Notes/2026-11-04 Point hebdo produit.md" },
  { title: L("Extract tasks"), chain: `${L("Generate with the local model")} → ${L("Write to the vault")}`, detail: "Note créée : Tâches – Point hebdo produit" },
];

const synChatSuggestions = () => [
  { key: "shorter", icon: I("ArrowsInSimple"), label: L("Make the summary shorter."), prompt: L("Make the current summary noticeably shorter than it is now. Keep every decision, owner, deadline, and open question; cut repetition and secondary detail.") },
  { key: "longer", icon: I("ArrowsOutSimple"), label: L("Make the summary longer."), prompt: L("Make the current summary more detailed than it is now. Add supporting context, rationale, and examples from the transcript without inventing anything.") },
  { key: "actions", icon: I("ListChecks"), label: L("List action items."), prompt: L("What are my action items from this meeting?") },
  { key: "mail", icon: I("Envelope"), label: L("Draft follow-up email."), prompt: L("Draft a follow-up email to the participants") },
  { key: "decisions", icon: I("MagnifyingGlass"), label: L("Find key decisions."), prompt: L("What were the key decisions that have been made?") },
];

const SYN_CHAT_ANSWERS = {
  actions: ["Vos points d'action issus de « Point hebdo produit » :", "1. Prévenir les testeurs du nouveau calendrier de la bêta (avec Camille, mardi).", "2. Relire le message de lancement avant le 21 novembre."],
  mail: ["Objet : Point hebdo produit — décisions", "Bonjour à tous, merci pour ce point. La bêta est décalée au 21 novembre ; Malik vérifie le quota du serveur avant jeudi, Camille prévient les testeurs mardi."],
  decisions: ["Décisions clés :", "— La bêta est décalée au 21 novembre.", "— Le quota du serveur de transcription est vérifié avant jeudi."],
  shorter: ["Je propose un résumé plus court. Il s'affiche à la place du compte rendu : appliquez-le ou refusez-le."],
  longer: ["Je propose un résumé plus détaillé. Il s'affiche à la place du compte rendu : appliquez-le ou refusez-le."],
};

const SynChatSummary = ({ sections }) => (
  <div className="syn-summary">
    {sections.map(([title, items]) => (
      <div key={title}>
        <h4>{title}</h4>
        <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
    ))}
  </div>
);

const SynChatReview = ({ proposal, onReview }) => (
  <section className="syn-chat-review" aria-label={L("Proposed summary edit")}>
    <header>
      <div>
        <p>{L("Proposed edit to the summary")}</p>
        <p>{L("Removed text is struck through, added text is highlighted.")}</p>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="syn-ui-btn" onClick={() => onReview(false)}>{L("Decline")}</button>
        <button type="button" className="syn-ui-btn" onClick={() => onReview(true)}>{L("Apply to summary")}</button>
      </div>
    </header>
    <div className="syn-chat-diff">
      {SYN_CHAT_SUMMARY.flatMap(([, items]) => items).map((text) => (
        <del key={text}><span className="syn-sr">{L("Removed:")}</span>{text}</del>
      ))}
      {proposal.flatMap(([, items]) => items).map((text) => (
        <ins key={text}><span className="syn-sr">{L("Added:")}</span>{text}</ins>
      ))}
    </div>
  </section>
);

const SynChatBot = ({ message, onToggle, onReview }) => (
  <div className="syn-chat-bot">
    <button type="button" className="syn-chat-disc" aria-expanded={message.open} onClick={onToggle}>
      {h(SynIcon, { name: I("Brain"), size: 12 })}
      {L("Activity")}
      {h(SynIcon, { name: message.open ? I("CaretDown") : I("CaretRight"), size: 12 })}
    </button>
    {message.open ? <p className="syn-muted syn-small">Lecture de la note ouverte, puis repérage des passages utiles dans le compte rendu.</p> : null}
    {message.lines.map((line) => <p key={line}>{line}</p>)}
    {message.edit ? (
      <div className="syn-chat-tool">
        <p>
          {h(SynIcon, { name: I("Pencil"), size: 14 })}
          {message.edit === "pending" ? L("Edit summary — waiting for your review") : message.edit === "applied" ? L("Summary updated") : L("Summary edit declined")}
        </p>
        {message.edit === "pending" ? (
          <div>
            <button type="button" className="syn-ui-btn" onClick={() => onReview(false)}>{L("Decline")}</button>
            <button type="button" className="syn-ui-btn" data-variant="primary" onClick={() => onReview(true)}>{L("Apply to summary")}</button>
          </div>
        ) : null}
      </div>
    ) : null}
  </div>
);

const synChatInitial = (open, noModel) => ({ open, noModel, messages: [], draft: "", chips: [], selected: 0, review: null, summary: SYN_CHAT_SUMMARY, toast: null });

/**
 * « Demander à la note » : note à l'étape Synthèse et chat à droite.
 * Repères : 1 « Demander à la note », 2 suggestions, 3 champ (@), 4 « Lancer
 * une automatisation », 5 « Nouveau chat ».
 */
export const AskNote = ({ open = true, noModel = false, markers = true }) => {
  const [s, setS] = useState(() => synChatInitial(open, noModel));
  const [showMarkers, setShowMarkers] = useState(markers);
  const [stageRef, windowRef, scale, scaledHeight] = useSynScale(1080);
  const patch = (p) => setS((prev) => ({ ...prev, ...p }));
  const at = s.draft.lastIndexOf("@");
  const mentions = at >= 0 ? synChatMentions(s.draft.slice(at + 1)) : [];
  const empty = s.messages.length === 0;
  const hs = (n, style) => (showMarkers ? h(SynHotspot, { n, style }) : null);

  const say = (text, chips, key) => {
    const edit = key === "shorter" || key === "longer";
    const lines = SYN_CHAT_ANSWERS[key] ?? [
      chips.length
        ? `D'après ${chips.map((c) => `« ${c} »`).join(" et ")} : la date de lancement a été évoquée deux fois, puis fixée au 21 novembre.`
        : "Dans « Point hebdo produit », la bêta est décalée au 21 novembre et le quota du serveur doit être vérifié avant jeudi.",
    ];
    setS((prev) => ({
      ...prev,
      draft: "",
      chips: [],
      review: edit ? (key === "shorter" ? SYN_CHAT_SHORTER : SYN_CHAT_LONGER) : prev.review,
      messages: [...prev.messages, { role: "user", text, chips }, { role: "bot", lines, open: false, edit: edit ? "pending" : null }],
    }));
  };
  const review = (apply) =>
    setS((prev) => ({
      ...prev,
      summary: apply && prev.review ? prev.review : prev.summary,
      review: null,
      messages: prev.messages.map((m) => (m.edit === "pending" ? { ...m, edit: apply ? "applied" : "declined" } : m)),
    }));
  const pickMention = (item) => patch({ chips: [...s.chips, item.label], draft: s.draft.slice(0, at).trimEnd(), selected: 0 });
  const send = () => {
    if (s.draft.trim() || s.chips.length) say(s.draft.trim(), s.chips, null);
  };
  const onKeyDown = (e) => {
    if (mentions.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      patch({ selected: (s.selected + (e.key === "ArrowDown" ? 1 : -1) + mentions.length) % mentions.length });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (mentions.length) pickMention(mentions[Math.min(s.selected, mentions.length - 1)]);
      else send();
    } else if (e.key === "Escape" && at >= 0) {
      e.preventDefault();
      patch({ draft: s.draft.slice(0, at) });
    }
  };
  const runAutomation = (a) => patch({ toast: { title: LF("“{title}” ran on this note", { title: a.title }), detail: a.detail } });
  const reset = () => setS(synChatInitial(open, noModel));
  const onFigureKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
      e.preventDefault();
      patch({ open: !s.open });
    }
  };

  return (
    <figure className="syn-root syn-figure not-prose" onKeyDown={onFigureKey}>
      {h(SynStyle)}
      <div className="syn-bar" style={{ marginBottom: 0 }}>
        <label className="syn-check">
          <input type="checkbox" checked={s.noModel} onChange={(e) => patch({ noModel: e.target.checked, messages: [], review: null })} />
          Sans modèle connecté
        </label>
      </div>
      {h(SynToolbar, { markers: showMarkers, setMarkers: setShowMarkers, onReset: reset })}
      <div className="syn-stage" ref={stageRef} style={{ height: scaledHeight }}>
        <div className="syn-window" ref={windowRef} style={{ width: 1080, transform: `scale(${scale})` }}>
          <div className="syn-titlebar">
            <strong>Point hebdo produit</strong>
            <span>· Syntheo</span>
          </div>
          <div className="syn-chat-body">
            <div className="syn-chat-doc">
              <p className="syn-title">Point hebdo produit</p>
              <p className="syn-chat-meta"><span className="syn-chip">Produit / Roadmap</span> · mar. 4 nov. · Camille R., Malik B., vous</p>
              {s.review ? h(SynChatReview, { proposal: s.review, onReview: review }) : h(SynChatSummary, { sections: s.summary })}
              <div className="syn-capsule-slot syn-chat-cap" style={{ position: "absolute" }}>
                <div className="syn-capsule" role="group" aria-label={L("Note capsule")}>
                  <ol className="syn-steps" aria-label={L("Note steps")}>
                    {SYN_STAGES.map(([id, kanji, label], index) => (
                      <li key={id} aria-current={id === "synthesis" ? "step" : undefined}>
                        {index > 0 ? <span aria-hidden="true" style={{ opacity: 0.7, fontWeight: 400 }}>·</span> : null}
                        <span><span className="syn-kanji" aria-hidden="true">{kanji}</span>{label}</span>
                      </li>
                    ))}
                  </ol>
                  <span className="syn-sep" aria-hidden="true" />
                  <button type="button" className="syn-btn">{L("Copy")}</button>
                  <button type="button" className="syn-btn" title={`${L("Export")} (Ctrl+P)`}>{L("Export")}</button>
                  {h(SynMenuButton, {
                    label: L("Automations"),
                    buttonClassName: "syn-btn",
                    align: "left",
                    items: [{ heading: L("Run an automation") }, ...synChatAutomations().map((a) => ({ label: a.title, icon: I("Lightning"), onSelect: () => runAutomation(a) }))],
                    children: L("Automations"),
                  })}
                  <span style={{ position: "relative" }}>
                    {hs(1, { left: "50%", top: -30, marginLeft: -11 })}
                    <button type="button" className="syn-btn" data-tone="primary" aria-keyshortcuts="Control+J" onClick={() => patch({ open: !s.open })}>
                      {L("Ask the note")}
                      <kbd aria-hidden="true">Ctrl J</kbd>
                    </button>
                  </span>
                </div>
              </div>
            </div>
            {s.open ? (
              <aside className="syn-chat-panel" aria-label={L("Ask the note")}>
                <div className="syn-chat-bar">
                  <button type="button" className="syn-icon-btn syn-chat-hist" aria-label={L("Chat history")}>
                    {h(SynIcon, { name: I("ClockCounterClockwise") })}
                    {h(SynIcon, { name: I("CaretDown"), size: 14 })}
                  </button>
                  <span style={{ flex: 1 }} />
                  <span style={{ position: "relative" }}>
                    {hs(5, { left: -6, top: -14 })}
                    <button type="button" className="syn-icon-btn" aria-label={L("New chat")} title={L("New chat")} onClick={() => patch({ messages: [], chips: [], draft: "", review: null })}>
                      {h(SynIcon, { name: I("Plus") })}
                    </button>
                  </span>
                  <button type="button" className="syn-icon-btn" aria-label={L("Float chat")} title={L("Float chat")}>{h(SynIcon, { name: I("PictureInPicture") })}</button>
                  <button type="button" className="syn-icon-btn" aria-label={L("Close chat")} title={L("Close chat")} onClick={() => patch({ open: false })}>{h(SynIcon, { name: I("X") })}</button>
                </div>
                <div className="syn-chat-msgs" aria-live="polite">
                  {s.noModel ? (
                    <div>
                      <p style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px", fontWeight: 500 }}>
                        Syntheo AI <span className="syn-chat-beta">{L("Beta")}</span>
                      </p>
                      <p className="syn-muted" style={{ margin: "0 0 8px" }}>{L("Hi, I'm Syntheo AI. Set up a language model and I'll be ready to help.")}</p>
                      <button type="button" className="syn-ui-btn" data-variant="primary" style={{ borderRadius: 999, minHeight: 28, fontSize: 12 }}>
                        {h(SynIcon, { name: I("Sparkle"), size: 12 })}
                        {L("Open AI Settings")}
                      </button>
                    </div>
                  ) : empty ? (
                    <div style={{ position: "relative" }}>
                      {hs(2, { right: 0, top: -4 })}
                      {synChatSuggestions().map((sg) => (
                        <button key={sg.key} type="button" className="syn-chat-sugg" onClick={() => say(sg.prompt, [], sg.key)}>
                          {h(SynIcon, { name: sg.icon })}
                          <span>{sg.label}</span>
                        </button>
                      ))}
                      <button type="button" className="syn-chat-sugg" title={LF("Opens the Next meeting block of the folder {folderPath}.", { folderPath: "Produit/Roadmap" })}>
                        {h(SynIcon, { name: I("ListNumbers") })}
                        <span>{L("Prepare the agenda for the next meeting.")}</span>
                      </button>
                      <div role="group" aria-label={L("Run an automation")} style={{ position: "relative" }}>
                        {hs(4, { right: 0, top: 4 })}
                        <p className="syn-chat-group-label">{L("Run an automation")}</p>
                        {synChatAutomations().map((a) => (
                          <button key={a.title} type="button" className="syn-chat-sugg" title={a.chain} onClick={() => runAutomation(a)}>
                            {h(SynIcon, { name: I("Lightning") })}
                            <span>{a.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    s.messages.map((m, i) =>
                      m.role === "user" ? (
                        <div key={i} className="syn-chat-user">
                          {m.chips.map((c) => <span key={c} className="syn-chat-chip" style={{ marginRight: 4 }}>@{c}</span>)}
                          {m.text}
                        </div>
                      ) : (
                        h(SynChatBot, {
                          key: i,
                          message: m,
                          onReview: review,
                          onToggle: () => patch({ messages: s.messages.map((x, j) => (j === i ? { ...x, open: !x.open } : x)) }),
                        })
                      ),
                    )
                  )}
                </div>
                <div className="syn-chat-input">
                  {hs(3, { left: -12, top: -10 })}
                  {mentions.length ? (
                    <ul className="syn-chat-mentions" role="listbox" aria-label="Propositions de mention">
                      {mentions.map((item, i) => (
                        <li key={item.label} role="option" aria-selected={i === Math.min(s.selected, mentions.length - 1)} onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(item)}>
                          {h(SynIcon, { name: SYN_CHAT_MENTION_ICONS[item.type] })}
                          <span>{item.label}</span>
                          <span>{item.type === "folder" ? LP("{count, plural, one {# meeting} other {# meetings}}", item.count) : item.folder ? synFolderPath(item.folder) : ""}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="syn-chat-row">
                    {s.chips.map((c) => <span key={c} className="syn-chat-chip">@{c}</span>)}
                    <input
                      type="text"
                      aria-label={L("Ask anything")}
                      placeholder={s.chips.length ? "" : L("Ask anything")}
                      value={s.draft}
                      disabled={s.noModel}
                      onChange={(e) => patch({ draft: e.target.value, selected: 0 })}
                      onKeyDown={onKeyDown}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 4 }}>
                    <button type="button" className="syn-icon-btn" aria-label={L("Start voice input")}>{h(SynIcon, { name: I("Microphone") })}</button>
                    <button type="button" className="syn-chat-send" aria-label={L("Send message")} disabled={!s.draft.trim() && !s.chips.length} onClick={send}>
                      {h(SynIcon, { name: I("ArrowUp"), size: 15 })}
                    </button>
                  </div>
                </div>
              </aside>
            ) : null}
          </div>
          {s.toast ? (
            <div className="syn-chat-toast" role="status">
              <span style={{ flex: 1 }}>{s.toast.title}<small>{s.toast.detail}</small></span>
              <button type="button" className="syn-icon-btn" style={{ width: 24, height: 24 }} aria-label={L("Close")} onClick={() => patch({ toast: null })}>
                {h(SynIcon, { name: I("X"), size: 14 })}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </figure>
  );
};
