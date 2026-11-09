// Reproductions interactives de Syntheo pour la documentation Mintlify.
// Modèle de docs/snippets/app.gen.jsx : les blocs @TOKENS, @LABELS, @ICONS et
// @VERSION sont remplis par scripts/sync-docs-ui.mjs depuis les sources de
// l'app (tokens.css, messages.po, Hugeicons). Libellés : L(msgid anglais de messages.po).
// Mintlify fournit useState, useEffect et useRef sans import ; un snippet ne
// peut importer ni un autre snippet ni du JSON, d'où un seul fichier.

const SYN_VERSION = /*@VERSION*/ "";
const SYN_LIGHT = /*@TOKENS_LIGHT*/ {};
const SYN_DARK = /*@TOKENS_DARK*/ {};
const SYN_LABELS = /*@LABELS*/ {};
const SYN_ICONS = /*@ICONS*/ {};

const L = (id) => SYN_LABELS[id] ?? id;

const synVars = (tokens) =>
  Object.entries(tokens)
    .map(([name, value]) => `--syn-${name}:${value};`)
    .join("");

const SYN_CSS = `
.syn-root{${synVars(SYN_LIGHT)}font-family:Geist,system-ui,sans-serif;color:var(--syn-foreground);font-size:14px;line-height:1.55}
html.dark .syn-root{${synVars(SYN_DARK)}}
.syn-root *{box-sizing:border-box}
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
.syn-body{display:flex;min-height:340px}
.syn-doc{flex:1 1 auto;min-width:0;padding:22px 28px 92px}
.syn-title{margin:0 0 14px;font:500 24px/1.2 Newsreader,Georgia,serif;color:var(--syn-foreground)}
.syn-fiche{display:grid;grid-template-columns:110px minmax(0,1fr);gap:7px 12px;margin:0 0 16px;font-size:13.5px}
.syn-fiche dt{color:var(--syn-muted-foreground)}
.syn-fiche dd{margin:0}
.syn-chip{display:inline-block;background:var(--syn-accent);color:var(--syn-accent-foreground);border-radius:6px;padding:1px 8px}
.syn-hint{margin:0;color:var(--syn-muted-foreground)}
.syn-notes{margin:0;padding-left:18px;color:var(--syn-user-ink)}
.syn-margin{flex:0 0 230px;border-left:1px solid var(--syn-border);background:var(--syn-card);padding:18px 14px 92px;font-size:13px;color:var(--syn-muted-foreground)}
.syn-margin h4{margin:0 0 8px;font-size:13px;font-weight:600;color:var(--syn-foreground)}
.syn-margin p{margin:0 0 8px}
.syn-margin b{color:var(--syn-foreground);font-weight:600}
.syn-alert{margin-top:8px;border:1px solid var(--syn-alert-border);background:var(--syn-alert);color:var(--syn-alert-foreground);border-radius:8px;padding:8px}
.syn-summary h4{margin:0 0 6px;font:500 17px/1.3 Newsreader,Georgia,serif;color:var(--syn-foreground)}
.syn-summary ul{margin:0 0 12px;padding-left:18px}
.syn-seal{position:absolute;right:26px;bottom:78px;transform:rotate(-8deg);border:2px solid var(--syn-seal);color:var(--syn-seal);border-radius:6px;padding:2px 6px;font:500 20px/1 "Noto Serif JP",serif;opacity:.8}
.syn-capsule-slot{position:absolute;left:50%;bottom:14px;transform:translateX(-50%)}
.syn-title{position:relative}
.syn-sep{display:inline-block}
.syn-capsule{display:flex;align-items:center;gap:6px;padding:6px;border-radius:999px;background:var(--syn-primary);color:var(--syn-primary-foreground);box-shadow:var(--syn-shadow-capsule);white-space:nowrap;font-size:14px}
.syn-steps{display:flex;align-items:center;gap:6px;margin:0;padding:0 10px 0 8px;list-style:none;font-size:13px;opacity:1}
.syn-steps li{display:flex;align-items:center;gap:6px;margin:0;color:color-mix(in srgb,var(--syn-primary-foreground) 70%,transparent)}
.syn-steps li[aria-current]{color:var(--syn-primary-foreground);font-weight:600}
.syn-kanji{font:500 11px/1 "Noto Serif JP",serif;opacity:.6;margin-right:4px}
.syn-sep{width:1px;height:20px;background:color-mix(in srgb,var(--syn-primary-foreground) 30%,transparent)}
.syn-btn{display:inline-flex;align-items:center;border:0;border-radius:999px;padding:7px 14px;font:inherit;color:inherit;background:transparent;cursor:pointer}
.syn-btn:hover{background:color-mix(in srgb,var(--syn-primary-foreground) 10%,transparent)}
.syn-btn[data-tone=primary]{background:var(--syn-primary-foreground);color:var(--syn-primary);font-weight:600}
.syn-btn[data-tone=recording]{background:var(--syn-recording);color:var(--syn-background);font-weight:600}
.syn-btn:focus-visible,.syn-toggle:focus-visible{outline:2px solid var(--syn-primary-foreground);outline-offset:2px}
.syn-btn kbd{margin-left:6px;font:inherit;font-size:11px;font-weight:400;opacity:.6;background:none;border:0;padding:0;box-shadow:none;color:inherit}
.syn-live{display:flex;align-items:center;gap:8px;padding:0 8px}
.syn-dot{width:8px;height:8px;border-radius:999px;background:var(--syn-recording)}
.syn-timer{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums}
.syn-timer[data-paused]{opacity:.7}
.syn-meter{display:flex;align-items:center;gap:2px;height:20px}
.syn-meter i{display:block;width:2px;height:100%;border-radius:999px;background:var(--syn-primary-foreground);transform-origin:center}
.syn-meter[data-animated] i{animation:syn-level 900ms ease-in-out infinite alternate}
.syn-meter[data-animated] i:nth-child(2){animation-delay:-300ms}.syn-meter[data-animated] i:nth-child(3){animation-delay:-600ms}.syn-meter[data-animated] i:nth-child(4){animation-delay:-150ms}.syn-meter[data-animated] i:nth-child(5){animation-delay:-450ms}
.syn-meter:not([data-animated]) i{opacity:.7}
@keyframes syn-level{from{transform:scaleY(.25)}to{transform:scaleY(1)}}
@media (prefers-reduced-motion:reduce){.syn-meter[data-animated] i{animation:none}}
.syn-toggle{display:grid;place-items:center;width:32px;height:32px;flex-shrink:0;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer}
.syn-toggle:hover{background:color-mix(in srgb,var(--syn-primary-foreground) 10%,transparent)}
.syn-toggle[aria-pressed=true]{background:var(--syn-recording);color:var(--syn-background)}
.syn-paused{font-size:13px;font-weight:600}
.syn-hs{position:absolute;width:22px;height:22px;border-radius:999px;background:var(--syn-recording);color:var(--syn-background);font:600 12px/22px Geist,system-ui,sans-serif;text-align:center;box-shadow:0 0 0 3px color-mix(in srgb,var(--syn-recording) 25%,transparent);pointer-events:none}
.syn-path{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:16px 0;border:1px solid var(--syn-border);border-radius:12px;background:var(--syn-card);padding:12px 14px}
.syn-path ol{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0;padding:0;list-style:none}
.syn-path li{display:flex;gap:6px;align-items:center;margin:0}
.syn-path li span{background:var(--syn-muted);border-radius:6px;padding:2px 8px}
.syn-path li[aria-current] span{background:var(--syn-accent);color:var(--syn-accent-foreground);font-weight:500}
.syn-kbd{display:inline-flex;gap:3px;align-items:center;vertical-align:baseline}
.syn-kbd kbd{display:inline-block;min-width:18px;padding:0 6px;border:1px solid var(--syn-input);border-bottom-width:2px;border-radius:5px;background:var(--syn-card);font:500 12px/18px Geist,system-ui,sans-serif;color:var(--syn-foreground);text-align:center}
`;

const SynStyle = () => <style>{SYN_CSS}</style>;

const SynIcon = ({ name, size = 16 }) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    dangerouslySetInnerHTML={{ __html: SYN_ICONS[name] ?? "" }}
  />
);

const synElapsed = (total) => {
  const s = Math.max(0, Math.floor(total));
  const pad = (v) => String(v).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

const SYN_STAGES = [
  ["prepare", "備", L("Prepare")],
  ["listen", "聴", L("Listen")],
  ["synthesis", "結", L("Synthesis")],
];

// Même structure que apps/desktop/src/session/components/capsule/index.tsx.
const SynMarker = ({ n }) => (
  <span className="syn-hs" aria-hidden="true" style={{ left: "50%", top: -30, marginLeft: -11 }}>{n}</span>
);

const SynCapsule = ({ state, act, markers = false }) => {
  const { stage, paused, micMuted, speakerMuted, seconds } = state;
  return (
    <div className="syn-capsule" role="group" aria-label={L("Note capsule")}>
      <ol className="syn-steps" aria-label={L("Note steps")} style={{ position: "relative" }}>
        {markers ? <SynMarker n={1} /> : null}
        {SYN_STAGES.map(([id, kanji, label], index) => (
          <li key={id} aria-current={id === stage ? "step" : undefined}>
            {index > 0 ? <span aria-hidden="true" style={{ opacity: 0.7, fontWeight: 400 }}>·</span> : null}
            <span>
              <span className="syn-kanji" aria-hidden="true">{kanji}</span>
              {label}
            </span>
          </li>
        ))}
      </ol>
      <span className="syn-sep" aria-hidden="true" style={{ position: "relative" }}>
        {markers ? <SynMarker n={2} /> : null}
      </span>
      {stage === "prepare" ? (
        <>
          <button type="button" className="syn-btn" onClick={act.reset}>{L("Cancel")}</button>
          <button type="button" className="syn-btn" data-tone="recording" aria-keyshortcuts="Control+Shift+N" onClick={act.start}>
            {L("Begin listening")}
            <kbd aria-hidden="true">Ctrl {L("Shift")} N</kbd>
          </button>
        </>
      ) : null}
      {stage === "listen" ? (
        <>
          <span className="syn-live">
            {paused ? (
              <>
                <SynIcon name="Pause" size={14} />
                <span role="status" className="syn-paused">{L("Paused")}</span>
              </>
            ) : (
              <span className="syn-dot" aria-hidden="true" />
            )}
            <span role="timer" aria-label={L("Listening time")} className="syn-timer" data-paused={paused ? "" : undefined}>
              {synElapsed(seconds)}
            </span>
            {paused ? null : (
              <span className="syn-meter" aria-hidden="true" data-animated={micMuted && speakerMuted ? undefined : ""}>
                {[0.45, 0.75, 1, 0.75, 0.45].map((w, i) => (
                  <i key={i} style={micMuted && speakerMuted ? { transform: `scaleY(${w * 0.5})` } : undefined} />
                ))}
              </span>
            )}
          </span>
          {paused ? null : (
            <>
              <button
                type="button"
                className="syn-toggle"
                aria-label={L("Mute the microphone")}
                aria-pressed={micMuted}
                aria-keyshortcuts="Control+Shift+M"
                title={`${micMuted ? L("Unmute the microphone") : L("Mute the microphone")} (Ctrl+${L("Shift")}+M)`}
                onClick={act.toggleMic}
              >
                <SynIcon name={micMuted ? "MicrophoneSlash" : "Microphone"} />
              </button>
              <button
                type="button"
                className="syn-toggle"
                aria-label={L("Mute system audio")}
                aria-pressed={speakerMuted}
                aria-keyshortcuts="Control+Shift+S"
                title={`${speakerMuted ? L("Unmute system audio") : L("Mute system audio")} (Ctrl+${L("Shift")}+S)`}
                onClick={act.toggleSpeaker}
              >
                <SynIcon name={speakerMuted ? "SpeakerX" : "SpeakerHigh"} />
              </button>
            </>
          )}
          {paused ? (
            <button type="button" className="syn-btn" data-tone="recording" aria-label={L("Resume listening")} onClick={act.resume}>
              {L("Resume listening")}
            </button>
          ) : (
            <button type="button" className="syn-btn" aria-label={L("Pause listening")} onClick={act.pause}>
              {L("Put on pause")}
            </button>
          )}
          <button type="button" className="syn-btn" data-tone="primary" onClick={act.finish}>{L("Finish")}</button>
        </>
      ) : null}
      {stage === "synthesis" ? (
        <>
          <button type="button" className="syn-btn">{L("Copy")}</button>
          <button type="button" className="syn-btn" title={`${L("Export")} (Ctrl+P)`} aria-keyshortcuts="Control+P">{L("Export")}</button>
          <button type="button" className="syn-btn" data-tone="primary" aria-keyshortcuts="Control+J">
            {L("Ask the note")}
            <kbd aria-hidden="true">Ctrl J</kbd>
          </button>
        </>
      ) : null}
    </div>
  );
};

// L'écran est mis en page à sa largeur réelle puis réduit pour tenir dans la
// colonne de la doc, comme une capture d'écran vivante.
const SYN_WINDOW_WIDTH = 860;

const useSynScale = () => {
  const stageRef = useRef(null);
  const windowRef = useRef(null);
  const [box, setBox] = useState({ scale: 1, height: undefined });
  useEffect(() => {
    const stage = stageRef.current;
    const win = windowRef.current;
    if (!stage || !win || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const scale = Math.min(1, stage.clientWidth / SYN_WINDOW_WIDTH);
      setBox({ scale, height: Math.ceil(win.offsetHeight * scale) });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(win);
    measure();
    return () => observer.disconnect();
  }, []);
  return [stageRef, windowRef, box.scale, box.height];
};

const synInitial = (stage) => ({
  stage: SYN_STAGES.some(([id]) => id === stage) ? stage : "prepare",
  paused: false,
  micMuted: false,
  speakerMuted: false,
  seconds: stage === "listen" ? 768 : 0,
});

const useSynSession = (initialStage) => {
  const [state, setState] = useState(() => synInitial(initialStage));
  const running = state.stage === "listen" && !state.paused;
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setState((s) => ({ ...s, seconds: s.seconds + 1 })), 1000);
    return () => clearInterval(id);
  }, [running]);
  const patch = (p) => setState((s) => ({ ...s, ...p }));
  const act = {
    start: () => patch({ stage: "listen", paused: false, seconds: 0 }),
    pause: () => patch({ paused: true }),
    resume: () => patch({ paused: false }),
    finish: () => patch({ stage: "synthesis", paused: false }),
    toggleMic: () => setState((s) => ({ ...s, micMuted: !s.micMuted })),
    toggleSpeaker: () => setState((s) => ({ ...s, speakerMuted: !s.speakerMuted })),
    reset: () => setState(synInitial(initialStage)),
  };
  return [state, act];
};

const SynToolbar = ({ markers, setMarkers, onReset }) => (
  <div className="syn-bar">
    <span className="syn-badge">
      <SynIcon name="Play" size={14} />
      Reproduction interactive · Syntheo {SYN_VERSION}
    </span>
    <span className="syn-bar-actions">
      {setMarkers ? (
        <label className="syn-check">
          <input type="checkbox" checked={markers} onChange={(e) => setMarkers(e.target.checked)} />
          Afficher les repères
        </label>
      ) : null}
      <button type="button" className="syn-link" onClick={onReset}>Recommencer</button>
    </span>
  </div>
);

/**
 * Fenêtre d'une note avec sa capsule. `stage` : prepare | listen | synthesis.
 * Repères : 1 étapes, 2 actions de la capsule, 3 contenu de la note.
 */
export const AppScreen = ({ stage = "prepare", title = "Point hebdo produit", markers = true }) => {
  const [state, act] = useSynSession(stage);
  const [showMarkers, setShowMarkers] = useState(markers);
  const bothMuted = state.micMuted && state.speakerMuted;
  const [stageRef, windowRef, scale, scaledHeight] = useSynScale();
  return (
    <figure className="syn-root syn-figure not-prose">
      <SynStyle />
      <SynToolbar markers={showMarkers} setMarkers={setShowMarkers} onReset={act.reset} />
      <div className="syn-stage" ref={stageRef} style={{ height: scaledHeight }}>
      <div className="syn-window" ref={windowRef} style={{ width: SYN_WINDOW_WIDTH, transform: `scale(${scale})` }}>
        <div className="syn-titlebar">
          <strong>{title}</strong>
          <span>· Syntheo</span>
        </div>
        <div className="syn-body">
          <div className="syn-doc">
            <p className="syn-title">
              {showMarkers ? <span className="syn-hs" aria-hidden="true" style={{ left: -26, top: 2 }}>3</span> : null}
              {title}
            </p>
            {state.stage === "prepare" ? (
              <>
                <dl className="syn-fiche">
                  <dt>{L("Folder")}</dt>
                  <dd><span className="syn-chip">Produit · Roadmap</span></dd>
                  <dt>{L("Type")}</dt>
                  <dd>Point projet / Sprint</dd>
                  <dt>{L("Participants")}</dt>
                  <dd>Camille R., Malik B.</dd>
                  <dt>{L("Listening")}</dt>
                  <dd>{L("Mic")} · {L("Computer audio")}</dd>
                </dl>
                <p className="syn-hint">{L("Write freely, Syntheo will complete it.")}</p>
              </>
            ) : null}
            {state.stage === "listen" ? (
              <ul className="syn-notes">
                <li>bêta : décaler au 21 ?</li>
                <li>vérifier le quota du serveur de transcription</li>
              </ul>
            ) : null}
            {state.stage === "synthesis" ? (
              <div className="syn-summary">
                <h4>Décisions</h4>
                <ul>
                  <li>La bêta est décalée au 21 novembre.</li>
                  <li>Malik vérifie le quota du serveur de transcription avant jeudi.</li>
                </ul>
                <h4>Actions</h4>
                <ul>
                  <li>Camille prévient les testeurs mardi.</li>
                </ul>
                <span className="syn-seal" aria-hidden="true">記</span>
              </div>
            ) : null}
          </div>
          {state.stage === "listen" ? (
            <aside className="syn-margin" aria-label={L("Transcription")}>
              <h4>{L("Transcription")}</h4>
              <p><b>Vous</b> — on peut décaler la bêta d'une semaine ?</p>
              <p><b>Camille</b> — oui, le 21 ça me va.</p>
              {bothMuted ? (
                <p className="syn-alert" role="status">{L("The microphone and system audio are muted: nothing is being transcribed.")}</p>
              ) : null}
            </aside>
          ) : null}
        </div>
        <div className="syn-capsule-slot">
          <SynCapsule state={state} act={act} markers={showMarkers} />
        </div>
      </div>
      </div>
    </figure>
  );
};

/** La capsule seule, sur fond neutre. */
export const Capsule = ({ stage = "prepare" }) => {
  const [state, act] = useSynSession(stage);
  return (
    <figure className="syn-root syn-figure not-prose">
      <SynStyle />
      <SynToolbar onReset={act.reset} />
      <div style={{ display: "flex", justifyContent: "center", padding: "18px 0", overflowX: "auto" }}>
        <SynCapsule state={state} act={act} />
      </div>
    </figure>
  );
};

/** Chemin dans l'app : <SettingsPath steps={["Paramètres", "Mes réunions", "Réunions", "Audio"]} />. */
export const SettingsPath = ({ steps = [] }) => (
  <nav className="syn-root syn-path not-prose" aria-label="Chemin dans l'application">
    <style>{SYN_CSS}</style>
    <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="none" dangerouslySetInnerHTML={{ __html: SYN_ICONS.Location }} />
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
