// Reproductions interactives de Syntheo pour la documentation Mintlify.
// Modèles de docs/snippets/*.gen.jsx : les blocs @TOKENS, @LABELS, @ICONS,
// @CSS_PARTS et @VERSION sont remplis par scripts/sync-docs-ui.mjs depuis les
// sources de l'app (tokens.css, messages.po, Hugeicons de packages/ui) ;
// @LOCALE est la langue de la sortie (fr-FR, ou en-US pour docs/snippets/en/).
// Libellés : L(msgid anglais de messages.po, entre guillemets), LP(msgid, n) pour un pluriel,
// LF(msgid, { nom: valeur }) pour une variable. Icônes : I("Folder"), le nom
// de packages/ui/src/components/icons-*.tsx.
// Mintlify fournit React et ses hooks sans import ; un snippet ne peut
// importer ni un autre snippet ni du JSON, d'où des fichiers autonomes.
// Feuilles de style propres à un modèle : const SYN_CSS_NOM = `…` (préfixe
// .syn-), ajoutées automatiquement à {h(SynStyle)}.

const SYN_VERSION = /*@VERSION*/ "";
const SYN_LOCALE = /*@LOCALE*/ "";
const SYN_LIGHT = /*@TOKENS_LIGHT*/ {};
const SYN_DARK = /*@TOKENS_DARK*/ {};
const SYN_LABELS = /*@LABELS*/ {};
const SYN_ICONS = /*@ICONS*/ {};

// Formate un message ICU simple de messages.po : {nom} et
// {n, plural, one {…} other {…}}.
const synFormat = (message, values = {}) =>
  message
    .replace(
      /\{(\w+), plural, ((?:[^{}]|\{[^{}]*\})*)\}/g,
      (_, key, cases) => {
        const n = Number(values[key]);
        const pick = (name) => cases.match(new RegExp(`(?:^|\\s)${name} \\{([^{}]*)\\}`));
        const chosen = (n === 0 && pick("=0")) || (n === 1 && pick("one")) || pick("other");
        return chosen ? chosen[1].replace(/#/g, String(n)) : "";
      },
    )
    .replace(/\{(\w+)\}/g, (all, key) => (key in values ? String(values[key]) : all));

const L = (id) => SYN_LABELS[id] ?? id;
const LP = (id, n, values = {}) => synFormat(L(id), { ...values, 0: n, count: n });
const LF = (id, values) => synFormat(L(id), values);
const I = (name) => name;

// Composants internes : h(SynIcon, { name: I("X") }), h(SynFigure, { … }, <div>…</div>),
// jamais de balise JSX à leur nom. Mintlify découpe le snippet selon les imports de
// la page et ne résout une balise JSX que dans son propre morceau : un
// composant partagé entre deux imports y serait introuvable. Le générateur
// refuse donc toute balise <Syn…>.
const h = (type, props, ...children) => React.createElement(type, props, ...children);

const synVars = (tokens) =>
  Object.entries(tokens)
    .map(([name, value]) => `--syn-${name}:${value};`)
    .join("");

const SYN_CSS = `
.syn-root{${synVars(SYN_LIGHT)}font-family:Geist,system-ui,sans-serif;color:var(--syn-foreground);font-size:14px;line-height:1.55}
html.dark .syn-root{${synVars(SYN_DARK)}}
.syn-root *{box-sizing:border-box}
.syn-root :is(h1,h2,h3,h4,h5,p,ul,ol,dl){font-family:inherit;letter-spacing:normal}
.syn-root :is(button,input,select,textarea,[tabindex]):focus-visible{outline:2px solid var(--syn-ring);outline-offset:2px}
.syn-figure{margin:20px 0;border:1px solid var(--syn-border);border-radius:14px;background:var(--syn-muted);padding:12px}
.syn-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:10px;font-size:13px;color:var(--syn-muted-foreground)}
.syn-badge{display:inline-flex;gap:6px;align-items:center;background:var(--syn-accent);color:var(--syn-accent-foreground);border-radius:999px;padding:3px 10px;font-weight:500}
.syn-bar-actions{margin-left:auto;display:flex;gap:12px;align-items:center}
.syn-link{border:0;background:none;padding:4px 2px;font:inherit;color:var(--syn-primary);cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.syn-check{display:inline-flex;gap:6px;align-items:center;cursor:pointer;color:var(--syn-foreground)}
.syn-check input{accent-color:var(--syn-primary);width:16px;height:16px;margin:0}
.syn-stage{position:relative;width:100%;overflow:hidden}
.syn-window{transform-origin:top left;position:relative;border:1px solid var(--syn-input);border-radius:10px;background:var(--syn-background);overflow:hidden}
.syn-titlebar{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--syn-border);background:var(--syn-muted);font-size:12px;color:var(--syn-muted-foreground)}
.syn-titlebar strong{color:var(--syn-foreground);font-weight:500}
.syn-hs{position:absolute;z-index:5;width:22px;height:22px;border-radius:999px;background:var(--syn-recording);color:var(--syn-background);font:600 12px/22px Geist,system-ui,sans-serif;text-align:center;box-shadow:0 0 0 3px color-mix(in srgb,var(--syn-recording) 25%,transparent);pointer-events:none}
.syn-here{position:relative;border:2px solid var(--syn-primary);border-radius:12px;padding:14px 16px;box-shadow:0 0 0 5px color-mix(in srgb,var(--syn-primary) 14%,transparent)}
.syn-here-tag{position:absolute;top:-11px;right:14px;background:var(--syn-primary);color:var(--syn-primary-foreground);font-size:11px;font-weight:600;border-radius:999px;padding:2px 9px}
.syn-path{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:16px 0;border:1px solid var(--syn-border);border-radius:12px;background:var(--syn-card);padding:12px 14px}
.syn-path ol{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0;padding:0;list-style:none}
.syn-path li{display:flex;gap:6px;align-items:center;margin:0}
.syn-path li span{background:var(--syn-muted);border-radius:6px;padding:2px 8px}
.syn-path li[aria-current] span{background:var(--syn-accent);color:var(--syn-accent-foreground);font-weight:500}
.syn-kbd{display:inline-flex;gap:3px;align-items:center;vertical-align:baseline}
.syn-kbd kbd{display:inline-block;min-width:18px;padding:0 6px;border:1px solid var(--syn-input);border-bottom-width:2px;border-radius:5px;background:var(--syn-card);font:500 12px/18px Geist,system-ui,sans-serif;color:var(--syn-foreground);text-align:center}
.syn-h1{margin:0;font:500 30px/1.15 Newsreader,Georgia,serif;color:var(--syn-foreground)}
.syn-lede{margin:6px 0 0;color:var(--syn-muted-foreground)}
.syn-h2{margin:0 0 12px;font-size:17px;font-weight:600}
.syn-muted{color:var(--syn-muted-foreground)}
.syn-small{font-size:12px}
.syn-ui-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:34px;border:1px solid var(--syn-input);border-radius:8px;background:var(--syn-card);color:var(--syn-foreground);padding:6px 12px;font:500 13px/1.2 Geist,system-ui,sans-serif;cursor:pointer}
.syn-ui-btn:hover{background:var(--syn-muted)}
.syn-ui-btn[data-variant=primary]{background:var(--syn-primary);border-color:var(--syn-primary);color:var(--syn-primary-foreground)}
.syn-ui-btn[data-variant=ghost]{border-color:transparent;background:transparent}
.syn-ui-btn[data-variant=ghost]:hover{background:var(--syn-muted)}
.syn-ui-btn[data-variant=danger]{color:var(--syn-destructive)}
.syn-ui-btn:disabled{opacity:.5;cursor:default}
.syn-icon-btn{display:grid;place-items:center;width:30px;height:30px;border:0;border-radius:7px;background:transparent;color:var(--syn-muted-foreground);cursor:pointer}
.syn-icon-btn:hover,.syn-icon-btn[aria-expanded=true]{background:var(--syn-muted);color:var(--syn-foreground)}
.syn-input,.syn-select{width:100%;min-height:36px;border:1px solid var(--syn-input);border-radius:8px;background:var(--syn-card);color:var(--syn-foreground);padding:6px 10px;font:400 13px/1.3 Geist,system-ui,sans-serif}
.syn-input::placeholder{color:var(--syn-faint)}
.syn-switch{position:relative;flex-shrink:0;width:36px;height:20px;border:0;border-radius:999px;background:var(--syn-input);cursor:pointer;padding:0}
.syn-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:999px;background:var(--syn-card);transition:transform 150ms}
.syn-switch[aria-checked=true]{background:var(--syn-primary)}
.syn-switch[aria-checked=true]::after{transform:translateX(16px)}
.syn-rows{display:flex;flex-direction:column;border-top:1px solid var(--syn-border)}
.syn-row{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 0;border-bottom:1px solid var(--syn-border)}
.syn-row-text{min-width:0;flex:1}
.syn-row-title{margin:0;font-size:15px;font-weight:500}
.syn-row-desc{margin:2px 0 0;font-size:13px;color:var(--syn-muted-foreground)}
.syn-row-control{flex:0 0 240px;min-width:0}
.syn-menu{position:absolute;z-index:20;min-width:220px;margin:0;padding:4px;list-style:none;border:1px solid var(--syn-border);border-radius:10px;background:var(--syn-popover);box-shadow:var(--syn-shadow-capsule)}
.syn-menu [role=menuitem]{display:flex;align-items:center;gap:8px;width:100%;border:0;border-radius:6px;background:transparent;color:var(--syn-foreground);padding:7px 9px;font:400 13px/1.3 Geist,system-ui,sans-serif;text-align:left;cursor:pointer}
.syn-menu [role=menuitem]:hover,.syn-menu [role=menuitem]:focus-visible{background:var(--syn-muted);outline:none}
.syn-menu [role=menuitem][aria-disabled=true]{opacity:.5;cursor:default}
.syn-menu [role=menuitem] .syn-menu-hint{margin-left:auto;font-size:11px;color:var(--syn-muted-foreground)}
.syn-menu [role=separator]{height:1px;margin:4px 6px;background:var(--syn-border)}
.syn-menu-label{padding:6px 9px 2px;font-size:11px;font-weight:600;color:var(--syn-faint);text-transform:uppercase;letter-spacing:.06em}
.syn-chip{display:inline-flex;align-items:center;gap:4px;background:var(--syn-accent);color:var(--syn-accent-foreground);border-radius:6px;padding:1px 8px;font-size:13px}
.syn-pip{display:inline-block;width:7px;height:7px;flex-shrink:0;border-radius:999px;background:var(--syn-primary)}
.syn-pip[data-tone=ko]{background:var(--syn-destructive)}
.syn-pip[data-tone=idle]{background:transparent;border:1px solid var(--syn-faint)}
.syn-dialog{position:absolute;z-index:30;left:50%;top:14%;transform:translateX(-50%);width:min(520px,90%);border:1px solid var(--syn-border);border-radius:16px;background:var(--syn-popover);box-shadow:var(--syn-shadow-capsule)}
.syn-scrim{position:absolute;inset:0;z-index:25;background:color-mix(in srgb,var(--syn-background) 45%,transparent)}
@media (prefers-reduced-motion:reduce){.syn-root *{transition:none!important;animation:none!important}}
`;

const synCssParts = () => /*@CSS_PARTS*/ [];

const SynStyle = () => <style>{SYN_CSS + synCssParts().join("")}</style>;

const SynIcon = ({ name, size = 16, style }) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    style={Object.assign({ flexShrink: 0 }, style)}
    dangerouslySetInnerHTML={{ __html: SYN_ICONS[name] ?? "" }}
  />
);

/** Repère numéroté posé sur l'écran (pastille rouge), repris dans le texte. */
const SynHotspot = ({ n, style }) => (
  <span className="syn-hs" aria-hidden="true" style={style}>{n}</span>
);

/** Encadré « Vous êtes ici » : la section que décrit la page. */
const SynHere = ({ active = true, children, style }) =>
  active ? (
    <div className="syn-here" style={style}>
      <span className="syn-here-tag">Vous êtes ici</span>
      {children}
    </div>
  ) : (
    <div style={style}>{children}</div>
  );

const SynToolbar = ({ markers, setMarkers, onReset }) => (
  <div className="syn-bar">
    <span className="syn-badge">
      {h(SynIcon, { name: I("Play"), size: 14 })}
      Reproduction interactive · Syntheo {SYN_VERSION}
    </span>
    <span className="syn-bar-actions">
      {setMarkers ? (
        <label className="syn-check">
          <input type="checkbox" checked={markers} onChange={(e) => setMarkers(e.target.checked)} />
          Afficher les repères
        </label>
      ) : null}
      {onReset ? <button type="button" className="syn-link" onClick={onReset}>Recommencer</button> : null}
    </span>
  </div>
);

// L'écran est mis en page à sa largeur réelle puis réduit pour tenir dans la
// colonne de la doc, comme une capture d'écran vivante.
const SYN_WINDOW_WIDTH = 860;

const useSynScale = (width = SYN_WINDOW_WIDTH) => {
  const stageRef = useRef(null);
  const windowRef = useRef(null);
  const [box, setBox] = useState({ scale: 1, height: undefined });
  useEffect(() => {
    const stage = stageRef.current;
    const win = windowRef.current;
    if (!stage || !win || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const scale = Math.min(1, stage.clientWidth / width);
      setBox({ scale, height: Math.ceil(win.offsetHeight * scale) });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(win);
    measure();
    return () => observer.disconnect();
  }, [width]);
  return [stageRef, windowRef, box.scale, box.height];
};

/**
 * Cadre commun : badge, repères, « Recommencer », puis une fenêtre de l'app
 * mise à l'échelle. `title` absent : pas de barre de titre. `bare` : pas de
 * fenêtre (contenu posé sur le fond, ex. bureau, pastille).
 */
const SynFigure = ({ title, width = SYN_WINDOW_WIDTH, markers, setMarkers, onReset, bare = false, children }) => {
  const [stageRef, windowRef, scale, height] = useSynScale(width);
  return (
    <figure className="syn-root syn-figure not-prose">
      {h(SynStyle)}
      {h(SynToolbar, { markers, setMarkers, onReset })}
      <div className="syn-stage" ref={stageRef} style={{ height }}>
        <div
          className={bare ? undefined : "syn-window"}
          ref={windowRef}
          style={{ width, transform: `scale(${scale})`, transformOrigin: "top left", position: "relative" }}
        >
          {title ? (
            <div className="syn-titlebar">
              <strong>{title}</strong>
              <span>· Syntheo</span>
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </figure>
  );
};

/** Interrupteur accessible (role="switch"), comme @syntheo/ui Switch. */
const SynSwitch = ({ checked, onChange, label, labelledBy, describedBy, disabled }) => (
  <button
    type="button"
    role="switch"
    className="syn-switch"
    aria-checked={checked}
    aria-label={label}
    aria-labelledby={labelledBy}
    aria-describedby={describedBy}
    disabled={disabled}
    onClick={() => onChange && onChange(!checked)}
  />
);

/** Ligne de réglage « libellé à gauche, réglage à droite » (settings/setting-row.tsx). */
const SynRow = ({ title, description, children, wide = false }) => {
  const id = useId();
  return (
    <div className="syn-row">
      <div className="syn-row-text">
        <h3 className="syn-row-title" id={`${id}-t`}>{title}</h3>
        {description ? <p className="syn-row-desc" id={`${id}-d`}>{description}</p> : null}
      </div>
      <div className="syn-row-control" style={wide ? { flexBasis: 300 } : { flexBasis: "auto" }}>
        {children({ "aria-labelledby": `${id}-t`, "aria-describedby": description ? `${id}-d` : undefined })}
      </div>
    </div>
  );
};

/** Ligne avec interrupteur (SettingSwitchRow). */
const SynSwitchRow = ({ title, description, checked, onChange, initial = false }) => {
  const [local, setLocal] = useState(initial);
  const value = checked ?? local;
  return h(SynRow, {
    title,
    description,
    children: (labels) =>
      h(SynSwitch, {
        checked: value,
        onChange: onChange ?? setLocal,
        labelledBy: labels["aria-labelledby"],
        describedBy: labels["aria-describedby"],
      }),
  });
};

/**
 * Menu déroulant au clavier : Entrée/Espace/↓ ouvre, ↑↓ parcourt, Échap
 * ferme et rend le focus au bouton. items : [{ label, icon, hint, onSelect,
 * disabled } | { separator: true } | { heading }].
 */
const SynMenuButton = ({ label, icon = I("DotsThree"), items, align = "right", buttonClassName = "syn-icon-btn", children }) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  useEffect(() => {
    if (open) menuRef.current?.querySelector('[role=menuitem]:not([aria-disabled=true])')?.focus();
  }, [open]);
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const onKeyDown = (e) => {
    const list = [...(menuRef.current?.querySelectorAll('[role=menuitem]:not([aria-disabled=true])') ?? [])];
    const index = list.indexOf(document.activeElement);
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (index + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
      list[next]?.focus();
    }
  };
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        aria-label={children ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children ?? h(SynIcon, { name: icon })}
      </button>
      {open ? (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="syn-menu"
          style={{ top: "calc(100% + 4px)", [align]: 0 }}
          onKeyDown={onKeyDown}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget) && e.relatedTarget !== buttonRef.current) setOpen(false);
          }}
        >
          {items.map((item, index) =>
            item.separator ? (
              <li key={index} role="separator" />
            ) : item.heading ? (
              <li key={index} role="presentation" className="syn-menu-label">{item.heading}</li>
            ) : (
              <li key={index} role="none">
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={item.disabled ? true : undefined}
                  onClick={() => {
                    if (item.disabled) return;
                    close();
                    item.onSelect?.();
                  }}
                >
                  {item.icon ? h(SynIcon, { name: item.icon }) : null}
                  <span>{item.label}</span>
                  {item.hint ? <span className="syn-menu-hint">{item.hint}</span> : null}
                </button>
              </li>
            ),
          )}
        </ul>
      ) : null}
    </span>
  );
};

/** Chemin dans l'app : <SettingsPath steps={["Paramètres", "Mes réunions", "Réunions", "Audio"]} />. */
export const SettingsPath = ({ steps = [] }) => (
  <nav className="syn-root syn-path not-prose" aria-label="Chemin dans l'application">
    <style>{SYN_CSS}</style>
    {h(SynIcon, { name: I("Location"), size: 18 })}
    <ol>
      {steps.map((step, index) => (
        <li key={step} aria-current={index === steps.length - 1 ? "location" : undefined}>
          {index > 0 ? <span aria-hidden="true" style={{ background: "none", padding: 0 }}>›</span> : null}
          <span>{step}</span>
        </li>
      ))}
    </ol>
  </nav>
);

/** Raccourci clavier : <Kbd keys="Ctrl+Maj+N" />. */
export const Kbd = ({ keys = "" }) => (
  <span className="syn-root syn-kbd">
    <style>{SYN_CSS}</style>
    {keys.split("+").map((key, index) => (
      <span key={index} style={{ display: "contents" }}>
        {index > 0 ? <span aria-hidden="true">+</span> : null}
        <kbd>{key}</kbd>
      </span>
    ))}
  </span>
);
