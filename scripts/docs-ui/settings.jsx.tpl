// <AppSettings section=… focus=…> : l'écran Paramètres. Menu repris de
// apps/desktop/src/sidebar/settings-nav-groups.ts et sidebar/settings.tsx
// (recherche, groupe « Avancé » replié, pastilles d'état des serveurs) ;
// contenu repris de apps/desktop/src/settings/. Chaque section est un
// composant SynSection… défini dans settings-*.jsx.tpl, qui reçoit `focus`
// (bloc encadré « Vous êtes ici »).

const SYN_CSS_SETTINGS = `
.syn-set{display:flex;min-height:520px}
.syn-set-nav{flex:0 0 228px;display:flex;flex-direction:column;gap:14px;border-right:1px solid var(--syn-border);background:var(--syn-muted);padding:14px 12px 12px}
.syn-set-search{display:flex;align-items:center;gap:8px;height:32px;border:1px solid var(--syn-border);border-radius:8px;background:var(--syn-card);padding:0 10px;color:var(--syn-faint)}
.syn-set-search:focus-within{box-shadow:0 0 0 1px var(--syn-ring)}
.syn-set-search input{flex:1;min-width:0;border:0;background:transparent;color:var(--syn-foreground);font:inherit;font-size:14px;outline:none}
.syn-set-group{display:flex;flex-direction:column;gap:1px}
.syn-set-label{display:flex;align-items:center;gap:4px;margin:0;padding:0 8px 4px;border:0;background:none;font:600 11px/1.4 Geist,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--syn-faint);text-align:left}
button.syn-set-label{cursor:pointer}
.syn-set-item{display:flex;align-items:center;gap:10px;width:100%;border:0;border-radius:7px;background:transparent;padding:6px 8px;font:400 14px/1.3 Geist,system-ui,sans-serif;color:var(--syn-foreground);text-align:left;cursor:pointer}
.syn-set-item:hover{background:color-mix(in srgb,var(--syn-foreground) 6%,transparent)}
.syn-set-item svg{color:var(--syn-muted-foreground)}
.syn-set-item[aria-current=page]{background:var(--syn-accent);color:var(--syn-accent-foreground);font-weight:600}
.syn-set-item[aria-current=page] svg{color:var(--syn-accent-foreground)}
.syn-set-foot{margin-top:auto;display:flex;flex-direction:column;gap:4px;border-top:1px solid var(--syn-border);padding:10px 8px 2px;font-size:12px;color:var(--syn-muted-foreground)}
.syn-set-foot span{display:flex;align-items:center;gap:8px}
.syn-set-main{flex:1;min-width:0;padding:36px 48px 48px;background:var(--syn-background)}
.syn-set-page{display:flex;flex-direction:column;gap:26px;max-width:720px}
.syn-set-title{margin:0;font:500 36px/1.1 Newsreader,Georgia,serif}
.syn-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

// Groupes et entrées du menu, dans l'ordre de settings-nav-groups.ts.
const synSettingsGroups = () => [
  {
    label: L("Me"),
    items: [
      ["app", L("Profile"), I("User")],
      ["appearance", L("Appearance"), I("Sun")],
      ["notifications", L("Notifications"), I("Bell")],
    ],
  },
  {
    label: L("My servers"),
    items: [
      ["transcription", L("Transcription"), I("Waveform"), "stt"],
      ["intelligence", L("Synthesis"), I("Sparkle"), "llm"],
    ],
  },
  {
    label: L("Writing"),
    items: [
      ["dictation", L("Dictation"), I("Microphone")],
      ["dictionary", L("Dictionary"), I("BookOpen")],
    ],
  },
  {
    label: L("My meetings"),
    items: [
      ["templates", L("Templates"), I("FileText"), null, true],
      ["meetings", L("Meetings"), I("VideoCamera")],
      ["folders", L("Folders"), I("FolderSimple"), null, true],
      ["contacts", L("Contacts"), I("Users"), null, true],
    ],
  },
  {
    label: L("Advanced"),
    collapsed: true,
    items: [
      ["privacy", L("Privacy"), I("ShieldCheck")],
      ["permissions", L("Permissions"), I("Lock")],
      ["automations", L("Automations"), I("Lightning"), null, true],
      ["developers", L("Developers"), I("Code")],
    ],
  },
];

// Données d'exemple : les deux serveurs répondent.
const synServerLabel = (kind) => (kind === "stt" ? L("Transcription · connected") : L("Synthesis · connected"));

const SynSettingsTitle = ({ title, lede }) => (
  <div>
    <h2 className="syn-set-title">{title}</h2>
    {lede ? <p className="syn-lede">{lede}</p> : null}
  </div>
);

// Sections reproduites ; les autres affichent leur titre seul.
const synSections = () => ({
  app: SynSectionApp,
  transcription: SynSectionTranscription,
  intelligence: SynSectionIntelligence,
  dictation: SynSectionDictation,
  meetings: SynSectionMeetings,
  privacy: SynSectionPrivacy,
  permissions: SynSectionPermissions,
});

const SynSettingsNavGroup = ({ group, active, onPick }) => {
  const forceOpen = group.items.some(([id]) => id === active);
  const [expanded, setExpanded] = useState(false);
  const open = !group.collapsed || expanded || forceOpen;
  return (
    <div className="syn-set-group">
      {group.collapsed ? (
        <button type="button" className="syn-set-label" aria-expanded={open} onClick={() => setExpanded((v) => !v)}>
          {group.label}
          {h(SynIcon, { name: open ? I("CaretDown") : I("CaretRight"), size: 12 })}
        </button>
      ) : (
        <h5 className="syn-set-label">{group.label}</h5>
      )}
      {open
        ? group.items.map(([id, label, icon, server]) => (
            <button
              key={id}
              type="button"
              className="syn-set-item"
              aria-current={id === active ? "page" : undefined}
              onClick={() => onPick(id)}
            >
              {h(SynIcon, { name: icon })}
              <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
              {server ? (
                <span title={synServerLabel(server)} style={{ display: "flex" }}>
                  <i className="syn-pip" aria-hidden="true" />
                  <span className="syn-sr">{synServerLabel(server)}</span>
                </span>
              ) : null}
            </button>
          ))
        : null}
    </div>
  );
};

/**
 * Paramètres de l'app, ouverts sur `section` (identifiant de l'app : app,
 * transcription, intelligence, dictation, meetings, privacy, permissions…).
 * `focus` encadre un bloc de la section (ex. meetings + audio).
 */
export const AppSettings = ({ section = "meetings", focus }) => {
  const [active, setActive] = useState(section);
  const [query, setQuery] = useState("");
  const groups = synSettingsGroups();
  const all = groups.flatMap((g) => g.items);
  const current = all.find(([id]) => id === active) ?? all[0];
  const Section = synSections()[active];
  const q = query.trim().toLowerCase();
  const visible = q
    ? groups
        .map((g) => ({ ...g, collapsed: false, items: g.items.filter(([, label]) => label.toLowerCase().includes(q)) }))
        .filter((g) => g.items.length)
    : groups;
  const reset = () => {
    setActive(section);
    setQuery("");
  };
  return h(
    SynFigure,
    { title: L("Settings"), width: 960, onReset: reset },
      <div className="syn-set">
        <div className="syn-set-nav">
          <label className="syn-set-search">
            {h(SynIcon, { name: I("MagnifyingGlass"), size: 15 })}
            <input
              type="text"
              value={query}
              placeholder={L("Search settings")}
              aria-label={L("Search settings")}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
            />
          </label>
          <nav aria-label={L("Settings")} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {visible.map((group) => (
              h(SynSettingsNavGroup, { key: group.label, group, active, onPick: setActive })
            ))}
          </nav>
          <div className="syn-set-foot" role="status" aria-label={L("Server status")}>
            <span><i className="syn-pip" aria-hidden="true" />{synServerLabel("stt")}</span>
            <span><i className="syn-pip" aria-hidden="true" />{synServerLabel("llm")}</span>
          </div>
        </div>
        <div className="syn-set-main">
          <div className="syn-set-page">
            {Section ? (
              h(Section, { focus: active === section ? focus : undefined })
            ) : (
              <>
                {h(SynSettingsTitle, { title: current[1] })}
                <p className="syn-muted">
                  {current[4]
                    ? "Dans l'app, cette entrée ouvre sa propre vue, décrite dans la page de la documentation qui lui est consacrée."
                    : "Cette section n'est pas reproduite ici : la page de la documentation qui la concerne la décrit."}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
  );
};
