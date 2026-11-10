// Paramètres › Dictée : apps/desktop/src/settings/dictation.tsx et
// dictation-shortcut.tsx ; phases de apps/desktop/src/dictation/state.ts.
// Plateforme montrée : Linux (section repliée « Sur Linux (Wayland ou X11) »).
// Valeurs par défaut de settings/schema.ts : dictée désactivée, raccourci
// Ctrl Alt Espace, maintien (pas de mode mains libres), pas d'aperçu en direct.
// Démonstration : dans « Essayer », le raccourci configuré lance une dictée
// simulée (écoute, transcription, insertion d'une phrase d'exemple).

const SYN_CSS_DICTATION_SETTINGS = `
.syn-dset-kbd{display:inline-flex;gap:4px;align-items:center}
.syn-dset-kbd kbd{border:1px solid var(--syn-input);border-bottom-width:2px;border-radius:6px;background:var(--syn-card);padding:1px 6px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--syn-foreground)}
.syn-dset-shortcut[aria-pressed=true]{border-color:var(--syn-primary);box-shadow:0 0 0 3px var(--syn-accent)}
.syn-dset-link{border:0;background:none;padding:0;font:inherit;color:var(--syn-primary);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.syn-dset-box{border:1px solid var(--syn-border);border-radius:10px;padding:16px}
.syn-dset-box p{margin:0;font-size:14px}
.syn-dset-details summary{cursor:pointer;font-size:14px;color:var(--syn-muted-foreground)}
.syn-dset-details summary:hover{color:var(--syn-foreground)}
.syn-dset-details p{margin:10px 0 0;font-size:14px;color:var(--syn-muted-foreground)}
.syn-dset-try{display:flex;flex-direction:column;gap:12px}
.syn-dset-try h3{margin:0;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--syn-faint)}
.syn-dset-field{display:flex;align-items:flex-start;gap:10px;border:1px dashed var(--syn-input);border-radius:10px;padding:14px;color:var(--syn-muted-foreground)}
.syn-dset-field svg{margin-top:4px}
.syn-dset-field textarea{flex:1;min-height:64px;border:0;background:transparent;color:var(--syn-foreground);font:400 14px/1.5 Geist,system-ui,sans-serif;resize:vertical;outline:none;padding:0}
.syn-dset-field textarea::placeholder{color:var(--syn-faint)}
.syn-dset-field:focus-within{border-color:var(--syn-ring)}
.syn-dset-last{display:flex;flex-direction:column;gap:12px;align-items:flex-start}
.syn-dset-last h3{margin:0;font-size:14px;font-weight:500}
.syn-dset-last p{align-self:stretch;margin:0;border:1px solid var(--syn-border);border-radius:10px;padding:16px;font-size:14px;white-space:pre-wrap}
`;

const SYN_DICTATION_SAMPLE = "Bonjour Camille, je vous envoie le compte rendu de jeudi avant midi.";
const SYN_DICTATION_SHORTCUT = "Control+Alt+Space";

// Libellés des touches de dictation-shortcut.tsx (Windows et Linux).
const synDictationKeyLabel = (key) =>
  ({ Control: "Ctrl", Alt: "Alt", Shift: "Shift", Super: "Super", Meta: "Super", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" })[key] ??
  key.replace(/^(Key|Digit)/, "");

// Combinaison d'un événement clavier, au format du réglage (Control+Alt+Space).
const synDictationCombo = (e) =>
  [e.ctrlKey && "Control", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super", e.code].filter(Boolean).join("+");

const SYN_DICTATION_MODIFIERS = ["Control", "Alt", "Meta", "Shift", "Fn", "OS"];

const SynDictationKeys = ({ shortcut }) => (
  <span className="syn-dset-kbd">
    {shortcut.split("+").map((key) => (
      <kbd key={key}>{synDictationKeyLabel(key)}</kbd>
    ))}
  </span>
);

/** Bouton du raccourci : clic, puis nouvelle combinaison ; Échap annule. */
const SynDictationShortcut = ({ shortcut, onChange }) => {
  const [recording, setRecording] = useState(false);
  return (
    <div className="syn-row">
      <div className="syn-row-text">
        <span className="syn-row-title" id="syn-dset-shortcut" style={{ display: "block" }}>{L("Dictation shortcut")}</span>
        <p className="syn-row-desc">{L("Click the shortcut to record a new key combination. Press Escape to cancel.")}</p>
      </div>
      <button
        type="button"
        className="syn-ui-btn syn-dset-shortcut"
        aria-labelledby="syn-dset-shortcut"
        aria-pressed={recording}
        onClick={() => setRecording((v) => !v)}
        onBlur={() => setRecording(false)}
        onKeyDown={(e) => {
          if (!recording) return;
          e.stopPropagation();
          if (e.key === "Tab") return setRecording(false);
          e.preventDefault();
          if (e.key === "Escape") return setRecording(false);
          if (e.repeat || SYN_DICTATION_MODIFIERS.includes(e.key)) return;
          onChange(synDictationCombo(e));
          setRecording(false);
        }}
      >
        {recording ? L("Press shortcut…") : h(SynDictationKeys, { shortcut })}
      </button>
    </div>
  );
};

const synDictationStatus = (phase) =>
  phase === "recording" ? L("Listening…") : phase === "transcribing" ? L("Transcribing…") : L("Ready to dictate");

const SynSectionDictation = ({ focus }) => {
  const [enabled, setEnabled] = useState(false);
  const [shortcut, setShortcut] = useState(SYN_DICTATION_SHORTCUT);
  const [handsFree, setHandsFree] = useState(false);
  const [live, setLive] = useState(false);
  const [mic, setMic] = useState("");
  const [phase, setPhase] = useState("idle");
  const [text, setText] = useState("");
  const [last, setLast] = useState("");
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const cancel = () => {
    clearTimeout(timer.current);
    setPhase("idle");
  };
  const finish = () => {
    setPhase("transcribing");
    timer.current = setTimeout(() => {
      setPhase("idle");
      setText((t) => (t ? `${t} ${SYN_DICTATION_SAMPLE}` : SYN_DICTATION_SAMPLE));
      setLast(SYN_DICTATION_SAMPLE);
      setCopied(false);
    }, 1100);
  };
  // Raccourci tapé dans « Essayer » : maintien (relâcher termine) ou mains
  // libres (seconde pression). Échap annule, comme sous Windows et X11.
  const onTryKeyDown = (e) => {
    if (!enabled) return;
    if (e.key === "Escape" && phase === "recording") {
      e.preventDefault();
      return cancel();
    }
    if (e.repeat || synDictationCombo(e) !== shortcut) return;
    e.preventDefault();
    if (phase === "idle") setPhase("recording");
    else if (phase === "recording" && handsFree) finish();
  };
  const onTryKeyUp = (e) => {
    if (handsFree || phase !== "recording") return;
    const parts = shortcut.split("+");
    if (parts.includes(e.code) || SYN_DICTATION_MODIFIERS.some((m) => e.key === m && parts.includes(m === "Meta" ? "Super" : m))) finish();
  };

  const switchRow = (title, description, checked, onChange) =>
    h(SynSwitchRow, { title, description, checked, onChange });

  return (
    <>
      {h(SynSettingsTitle, {
        title: L("Dictation"),
        lede: L("Speak into any text field, in any app. The text is inserted when you finish."),
      })}
      <div className="syn-rows" style={{ borderTop: 0 }}>
        {switchRow(L("Enable dictation"), L("Keep Syntheo running to use your shortcut in other apps."), enabled, (v) => {
          if (!v) {
            cancel();
            setLast("");
          }
          setEnabled(v);
        })}
        {h(SynDictationShortcut, { shortcut, onChange: setShortcut })}
        {switchRow(
          L("Hands-free dictation"),
          handsFree
            ? L("Press your shortcut to start, then press it again to finish.")
            : L("Hold your shortcut while speaking, then release it to finish."),
          handsFree,
          setHandsFree,
        )}
        {h(SynRow, {
          title: L("Microphone"),
          description: (
            <>
              {L("The one that captures your voice.")}{" "}
              <button type="button" className="syn-dset-link">{L("System permissions")}</button>
            </>
          ),
          wide: true,
          children: (labels) => (
            <select className="syn-select" value={mic} onChange={(e) => setMic(e.target.value)} aria-labelledby={labels["aria-labelledby"]}>
              <option value="">{L("Current default")}</option>
              <option value="Micro du casque USB">Micro du casque USB</option>
              <option value="Micro interne">Micro interne</option>
            </select>
          ),
        })}
        {switchRow(L("Live transcript preview"), L("Words appear in a small bubble while you speak. Text is inserted when you finish."), live, setLive)}
        {h(SynRow, {
          title: L("Language and vocabulary"),
          description: (
            <>
              {L("Words specific to you go in your")}{" "}
              <button type="button" className="syn-dset-link">{L("dictionary")}</button>
            </>
          ),
          children: () => <button type="button" className="syn-ui-btn">{L("Transcription server ›")}</button>,
        })}
      </div>

      <details className="syn-dset-details">
        <summary>{L("On Linux (Wayland or X11)")}</summary>
        <p>{L("On Wayland, approve the shortcuts in your desktop's prompt. Use Control + Alt + Escape to cancel. On X11, press Escape to cancel. The target app must expose an editable accessibility field.")}</p>
      </details>

      {enabled ? (
        <div className="syn-dset-box" role="status">
          <p>{synDictationStatus(phase)}</p>
          {phase !== "idle" ? (
            <button type="button" className="syn-ui-btn" style={{ marginTop: 8 }} onClick={cancel}>{L("Cancel dictation")}</button>
          ) : null}
        </div>
      ) : null}

      {h(
        SynHere,
        { active: focus === "try" },
        <section className="syn-dset-try">
          <h3>{L("Try it")}</h3>
          <label className="syn-dset-field">
            {h(SynIcon, { name: I("Microphone"), size: 18 })}
            <textarea
              aria-label={L("Try dictation")}
              placeholder={L("Click here, then use your dictation shortcut.")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onTryKeyDown}
              onKeyUp={onTryKeyUp}
            />
          </label>
          <p className="syn-muted" style={{ margin: 0, fontSize: 13 }}>
            {L("Dictation uses your microphone, transcription provider, languages, and dictionary. Audio is never written to disk; it only passes through memory. Your last transcript stays in memory until dictation is disabled or Syntheo closes.")}
          </p>
        </section>,
      )}

      {last ? (
        <div className="syn-dset-last">
          <h3>{L("Last dictation")}</h3>
          <p>{last}</p>
          <button type="button" className="syn-ui-btn" onClick={() => setCopied(true)}>
            {copied ? L("Copied") : L("Copy last dictation")}
          </button>
        </div>
      ) : null}
    </>
  );
};
