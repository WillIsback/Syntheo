// Paramètres › Profil : apps/desktop/src/settings/general/index.tsx
// (section « app »), account-profile.tsx, app-settings.tsx (Linux : pas de
// ligne Dock), main-language.tsx, spoken-languages.tsx,
// single-language-model-hint.tsx, timezone.tsx, searchable-select.tsx et
// storage/. Noms de langues : Intl.DisplayNames, comme language.ts.
// focus : "language" (bloc « Langue et région », affiché en haut de la page).

const SYN_CSS_PROFILE = `
.syn-prof-scroll{max-height:470px;overflow-y:auto;margin-right:-16px;padding-right:16px}
.syn-prof-page{display:flex;flex-direction:column;gap:32px}
.syn-prof-kicker{margin:0;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--syn-faint)}
.syn-prof-field{display:flex;flex-direction:column;gap:8px;font-size:14px}
.syn-prof-avatar{display:grid;place-items:center;width:56px;height:56px;border-radius:999px;background:var(--syn-accent);color:var(--syn-accent-foreground);font-weight:600;font-size:18px}
.syn-prof-combo{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:36px;border:1px solid var(--syn-input);border-radius:8px;background:var(--syn-card);color:var(--syn-foreground);padding:6px 12px;font:400 14px/1.3 Geist,system-ui,sans-serif;text-align:left;cursor:pointer}
.syn-prof-combo span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.syn-prof-pop{position:absolute;z-index:20;top:calc(100% + 4px);left:0;width:100%;min-width:240px;overflow:hidden;border:1px solid var(--syn-border);border-radius:12px;background:var(--syn-popover);box-shadow:var(--syn-shadow-capsule)}
.syn-prof-pop input{width:100%;border:0;border-bottom:1px solid var(--syn-border);background:transparent;color:var(--syn-foreground);padding:9px 12px;font:400 14px/1.3 Geist,system-ui,sans-serif;outline:none}
.syn-prof-list{max-height:200px;overflow-y:auto;padding:4px}
.syn-prof-opt{display:flex;align-items:center;gap:8px;width:100%;border:0;border-radius:6px;background:transparent;color:var(--syn-foreground);padding:7px 9px;font:400 14px/1.3 Geist,system-ui,sans-serif;text-align:left;cursor:pointer}
.syn-prof-opt:hover,.syn-prof-opt[data-active]{background:var(--syn-accent)}
.syn-prof-opt small{margin-left:auto;font:400 10px/1 "Geist Mono",ui-monospace,monospace;color:var(--syn-muted-foreground)}
.syn-prof-empty{padding:8px 10px;font-size:14px;text-align:center;color:var(--syn-muted-foreground)}
.syn-prof-indent{display:flex;flex-direction:column;gap:16px;margin-left:12px;padding:8px 0 0 16px;border-left:2px solid var(--syn-muted)}
.syn-prof-tags{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:38px;border:1px solid var(--syn-border);border-radius:16px;background:var(--syn-card);padding:6px 8px;cursor:text}
.syn-prof-tag{display:inline-flex;align-items:center;gap:4px;border-radius:6px;background:var(--syn-muted);padding:2px 8px;font-size:12px}
.syn-prof-tag button{display:grid;place-items:center;width:14px;height:14px;border:0;background:transparent;color:var(--syn-muted-foreground);padding:0;cursor:pointer}
.syn-prof-tags input{flex:1;min-width:120px;border:0;background:transparent;color:var(--syn-foreground);font:400 14px/1.3 Geist,system-ui,sans-serif;outline:none}
.syn-prof-tags input::placeholder{color:var(--syn-muted-foreground)}
.syn-prof-hint{margin:8px 0 0;font-size:12px;color:var(--syn-muted-foreground)}
.syn-prof-hint button{border:0;background:none;padding:0;font:inherit;color:var(--syn-foreground);text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.syn-prof-demo{display:flex;align-items:center;gap:8px;margin-top:12px;border-top:1px dashed var(--syn-border);padding-top:10px;font-size:12px;color:var(--syn-muted-foreground)}
`;

// language.ts, CORE_TRANSCRIPTION_LANGUAGE_CODES.
const SYN_PROF_LANGS = "ar be bg bn bs ca cs da de el en es et fa fi fr he hi hr hu id it ja kn ko lt lv mk mr ms nl no pl pt ro ru sk sl sr sv ta te th tl tr uk ur vi zh".split(" ");

const synProfLangName = (code) => {
  try {
    return new Intl.DisplayNames([SYN_LOCALE], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
};

// timezone.tsx, extrait de COMMON_TIMEZONES.
const SYN_PROF_ZONES = [
  ["America/New_York", "Eastern Time", "UTC-5"],
  ["America/Sao_Paulo", "Sao Paulo", "UTC-3"],
  ["Europe/London", "London", "UTC+0/+1"],
  ["Europe/Paris", "Paris", "UTC+1/+2"],
  ["Europe/Berlin", "Berlin", "UTC+1/+2"],
  ["Africa/Cairo", "Cairo", "UTC+2"],
  ["Asia/Dubai", "Dubai", "UTC+4"],
  ["Asia/Kolkata", "India", "UTC+5:30"],
  ["Asia/Singapore", "Singapore", "UTC+8"],
  ["Asia/Tokyo", "Tokyo", "UTC+9"],
].map(([value, label, detail]) => ({ value, label, detail }));

/** SearchableSelect : bouton combobox, puis recherche et liste (↑↓, Entrée, Échap). */
const SynProfSelect = ({ value, onChange, options, placeholder, searchPlaceholder, emptyMessage, labelledBy, describedBy }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const buttonRef = useRef(null);
  const listId = useId();
  const q = query.trim().toLocaleLowerCase();
  const shown = options.filter((o) => !q || `${o.label} ${o.detail ?? ""}`.toLocaleLowerCase().includes(q));
  const selected = options.find((o) => o.value === value);
  const close = () => {
    setOpen(false);
    setQuery("");
    buttonRef.current?.focus();
  };
  const pick = (o) => {
    onChange(o.value);
    close();
  };
  const onKeyDown = (e) => {
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      close();
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && shown.length) {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length);
    } else if (e.key === "Enter" && shown[active]) {
      e.preventDefault();
      pick(shown[active]);
    }
  };
  return (
    <div style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        className="syn-prof-combo"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onClick={() => {
          setActive(Math.max(0, options.indexOf(selected)));
          setOpen((v) => !v);
        }}
      >
        <span>{selected ? (selected.detail ? `${selected.label} (${selected.detail})` : selected.label) : placeholder ?? L("Select...")}</span>
        {h(SynIcon, { name: I("CaretDown"), size: 14, style: { opacity: 0.5 } })}
      </button>
      {open ? (
        <div className="syn-prof-pop" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <div className="syn-prof-list" id={listId} role="listbox" aria-labelledby={labelledBy}>
            {shown.length === 0 ? <div className="syn-prof-empty">{emptyMessage ?? L("No results found.")}</div> : null}
            {shown.map((o, i) => (
              <div
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.value === value}
                className="syn-prof-opt"
                data-active={i === active ? "" : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => setActive(i)}
                onClick={() => pick(o)}
              >
                <span style={{ flex: 1 }}>{o.label}</span>
                {o.detail ? <small>{o.detail}</small> : null}
                {o.value === value ? h(SynIcon, { name: I("Check"), size: 14 }) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

/** SpokenLanguagesView : étiquettes, recherche, ↓ et Entrée, Retour arrière retire la dernière. */
const SynProfSpoken = ({ main, value, onChange }) => {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [index, setIndex] = useState(-1);
  const inputRef = useRef(null);
  const listId = useId();
  const q = query.trim().toLocaleLowerCase();
  const found = q ? SYN_PROF_LANGS.filter((c) => c !== main && !value.includes(c) && synProfLangName(c).toLocaleLowerCase().includes(q)) : [];
  const add = (code) => {
    onChange([...value, code]);
    setQuery("");
    setIndex(-1);
  };
  const onKeyDown = (e) => {
    if (e.key === "Backspace" && !query && value.length) {
      e.preventDefault();
      onChange(value.slice(0, -1));
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      return;
    }
    if (!q || !found.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, found.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && index >= 0) {
      e.preventDefault();
      add(found[index]);
    }
  };
  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 500 }}>{L("Additional spoken languages")}</h3>
      <p className="syn-muted" style={{ margin: "0 0 12px", fontSize: 12 }}>{L("Used for transcription and automatic summary language detection.")}</p>
      <div style={{ position: "relative" }}>
        <div className="syn-prof-tags" role="presentation" onClick={() => inputRef.current?.focus()}>
          {value.map((code) => (
            <span key={code} className="syn-prof-tag">
              {synProfLangName(code)}
              <button
                type="button"
                aria-label={`Retirer ${synProfLangName(code)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((c) => c !== code));
                }}
              >
                {h(SynIcon, { name: I("X"), size: 10 })}
              </button>
            </span>
          ))}
          {value.length === 0 ? h(SynIcon, { name: I("MagnifyingGlass"), size: 16, style: { color: "var(--syn-muted-foreground)" } }) : null}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={focused && Boolean(q)}
            aria-controls={listId}
            aria-activedescendant={index >= 0 ? `${listId}-${index}` : undefined}
            aria-label={L("Add spoken language")}
            placeholder={value.length === 0 ? L("Add language") : ""}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(-1);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </div>
        {focused && q ? (
          <div className="syn-prof-pop" id={listId} role="listbox" style={{ borderRadius: 16 }}>
            <div className="syn-prof-list">
              {found.length ? (
                found.map((code, i) => (
                  <div
                    key={code}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={index === i}
                    className="syn-prof-opt"
                    data-active={index === i ? "" : undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => add(code)}
                  >
                    <span style={{ fontWeight: 500 }}>{synProfLangName(code)}</span>
                  </div>
                ))
              ) : (
                <div className="syn-prof-empty">{L("No matching languages found")}</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

/** Bloc « Langue et région ». */
const SynProfLanguage = ({ focus }) => {
  const [main, setMain] = useState("fr");
  const [summaryMain, setSummaryMain] = useState(false);
  const [spoken, setSpoken] = useState(["en"]);
  const [zone, setZone] = useState("Europe/Paris");
  const [mono, setMono] = useState(false);
  const langOptions = [
    { value: "auto", label: L("Automatic detection") },
    ...SYN_PROF_LANGS.map((code) => ({ value: code, label: synProfLangName(code) })),
  ];
  return h(
    SynHere,
    { active: focus === "language" },
    <h2 className="syn-h2" style={{ fontSize: 18 }}>{L("Language & Region")}</h2>,
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="syn-rows" style={{ borderTop: 0 }}>
          {h(SynRow, {
            title: L("Main language"),
            description: L("Default language for transcription and AI responses. Automatic detection lets the transcription model recognize the spoken language, and AI responses follow the meeting language."),
            wide: true,
            children: (labels) =>
              h(SynProfSelect, {
                value: main,
                onChange: (code) => {
                  setMain(code);
                  setSpoken((list) => list.filter((c) => c !== code));
                },
                options: langOptions,
                placeholder: L("Select language"),
                searchPlaceholder: L("Search language..."),
                emptyMessage: L("No matching languages found"),
                labelledBy: labels["aria-labelledby"],
                describedBy: labels["aria-describedby"],
              }),
          })}
        </div>
        {main === "auto" ? null : (
        <div className="syn-prof-indent">
          <div className="syn-rows" style={{ borderTop: 0 }}>
            {h(SynSwitchRow, {
              title: L("Use main language for summaries"),
              description: L("When off, summaries follow the detected meeting language."),
              checked: summaryMain,
              onChange: setSummaryMain,
            })}
          </div>
          <div>
            {h(SynProfSpoken, { main, value: spoken, onChange: setSpoken })}
            {mono && spoken.length ? (
              <p className="syn-prof-hint">
                {L("The live transcription model handles one language at a time. To transcribe several, <0>change models</0>.")
                  .split(/<\/?0>/)
                  .map((part, i) => (i === 1 ? <button key={i} type="button">{part}</button> : part))}
              </p>
            ) : null}
          </div>
        </div>
        )}
      </div>
      <div className="syn-rows" style={{ borderTop: 0 }}>
        {h(SynRow, {
          title: L("Timezone"),
          description: L("Show the timeline in your preferred timezone."),
          wide: true,
          children: (labels) =>
            h(SynProfSelect, {
              value: zone,
              onChange: setZone,
              options: SYN_PROF_ZONES,
              placeholder: L("Select timezone"),
              searchPlaceholder: L("Search timezone..."),
              labelledBy: labels["aria-labelledby"],
              describedBy: labels["aria-describedby"],
            }),
        })}
      </div>
    </div>,
    focus === "language" ? (
      <label className="syn-check syn-prof-demo">
        <input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} />
        Démonstration : simuler un modèle de transcription qui ne gère qu'une langue
      </label>
    ) : null,
  );
};

const SynProfIdentity = () => (
  <form className="syn-prof-field" style={{ gap: 16 }} onSubmit={(e) => e.preventDefault()}>
    <h3 className="syn-prof-kicker">{L("Identity")}</h3>
    <span className="syn-prof-avatar" aria-hidden="true">CR</span>
    <label className="syn-prof-field">
      {L("Name")}
      <input className="syn-input" type="text" defaultValue="Camille Rousseau" />
    </label>
    <label className="syn-prof-field">
      {L("Job Title")}
      <input className="syn-input" type="text" defaultValue="Cheffe de produit" />
    </label>
    <label className="syn-prof-field">
      {L("Email")}
      <input className="syn-input" type="email" defaultValue="camille.rousseau@exemple.fr" />
      <span className="syn-muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
        {L("Syntheo uses it to recognize you among the participants of your meetings, so you are not counted twice. It stays on this device.")}
      </span>
    </label>
  </form>
);

// Profil : identité, démarrage et mises à jour, langue et région, stockage.
const SynSectionApp = ({ focus }) => {
  const scrollRef = useRef(null);
  const langRef = useRef(null);
  useEffect(() => {
    // Le bloc demandé s'affiche en haut de la zone, sans faire défiler la page de la doc.
    if (focus === "language" && scrollRef.current && langRef.current) {
      scrollRef.current.scrollTop = langRef.current.offsetTop - scrollRef.current.offsetTop - 16;
    }
  }, [focus]);
  return (
    <div className="syn-prof-scroll" ref={scrollRef}>
      <div className="syn-prof-page">
        {h(SynSettingsTitle, {
          title: L("Profile"),
          lede: L("This information stays on your computer. It is used to recognize you in transcripts and to sign your meeting notes."),
        })}
        {h(SynProfIdentity)}
        <div className="syn-rows" style={{ borderTop: 0 }}>
          {h(SynSwitchRow, { title: L("Start Syntheo at login"), description: L("Have Syntheo ready when you sign in."), initial: true })}
          <div style={{ padding: "12px 0" }}>
            <button type="button" className="syn-ui-btn">{L("Show release notes")}</button>
          </div>
          {h(SynSwitchRow, { title: L("Show tray icon"), initial: true })}
        </div>
        <div ref={langRef}>{h(SynProfLanguage, { focus })}</div>
        <div>
          <h2 className="syn-h2" style={{ fontSize: 18 }}>{L("Storage")}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" className="syn-ui-btn" style={{ justifyContent: "flex-start", gap: 10, padding: "8px 12px", textAlign: "left" }}>
              {h(SynIcon, { name: I("FolderSimple"), style: { color: "var(--syn-muted-foreground)" } })}
              <span>
                <span style={{ display: "block", fontSize: 14 }}>{L("Export location")}</span>
                <span className="syn-muted" style={{ display: "block", fontSize: 12, fontWeight: 400 }}>~/Téléchargements</span>
              </span>
            </button>
            <button type="button" className="syn-ui-btn">{L("Choose folder")}</button>
            <p className="syn-muted" style={{ margin: 0, padding: "0 8px", fontSize: 12 }}>{L("Save PDF, text, Markdown, and Org exports to this folder.")}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
