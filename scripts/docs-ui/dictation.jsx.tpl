// Page dictation : le panneau flottant de dictée au-dessus d'une autre
// application. Reproduit apps/desktop/src/meeting-float/overlay/bar.tsx
// (DictationOverlay, StopControl, TranscriptList), overlay/dictation.tsx
// (texte et états vides de la bulle), overlay/layout.ts (dimensions) et
// apps/desktop/src/dictation/panel.ts (bulle ouverte quand « Voir le texte en
// direct » est activé, bascule toujours visible). L'application de
// messagerie et le simulateur de raccourci sont propres à la doc.

const SYN_CSS_DICTATION = `
.syn-dic-desk{position:relative;height:430px;padding:22px 26px;background:color-mix(in srgb,var(--syn-muted) 70%,var(--syn-background))}
.syn-dic-app{max-width:560px;margin:0 auto;border:1px solid var(--syn-border);border-radius:10px;background:var(--syn-card);overflow:hidden;box-shadow:0 2px 10px color-mix(in srgb,var(--syn-foreground) 8%,transparent)}
.syn-dic-app-bar{display:flex;gap:8px;align-items:center;padding:7px 12px;border-bottom:1px solid var(--syn-border);font-size:12px;color:var(--syn-muted-foreground)}
.syn-dic-app-bar strong{color:var(--syn-foreground);font-weight:500}
.syn-dic-app dl{display:grid;grid-template-columns:60px 1fr;gap:6px 10px;margin:0;padding:12px 14px;border-bottom:1px solid var(--syn-border);font-size:13px}
.syn-dic-app dt{color:var(--syn-muted-foreground)}
.syn-dic-app dd{margin:0}
.syn-dic-app textarea{display:block;width:100%;min-height:150px;border:0;background:transparent;color:var(--syn-foreground);font:400 14px/1.55 Geist,system-ui,sans-serif;padding:12px 14px;resize:none;outline:none}
.syn-dic-app textarea:focus-visible{box-shadow:inset 0 0 0 2px var(--syn-ring)}
.syn-dic-slot{position:absolute;left:50%;bottom:22px;transform:translateX(-50%)}
.syn-dic-panel{position:relative;display:flex;flex-direction:column;border-radius:14px;background:color-mix(in srgb,var(--syn-card) 86%,transparent);box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--syn-foreground) 14%,transparent),var(--syn-shadow-capsule);overflow:hidden}
.syn-dic-panel[data-expanded]{width:360px;border-radius:21px}
.syn-dic-text{height:116px;overflow-y:auto;padding:12px 16px 0;margin:0;font-size:15px;line-height:24px;color:var(--syn-foreground);white-space:pre-wrap;overflow-wrap:break-word}
.syn-dic-text span{opacity:.6}
.syn-dic-controls{display:flex;align-items:center;justify-content:flex-end;height:38px;padding:0 4px}
.syn-dic-stop{display:grid;place-items:center;width:62px;height:30px;border:0;border-radius:10px;background:color-mix(in srgb,var(--syn-foreground) 8%,transparent);color:var(--syn-recording);font:500 12px/1 Geist,system-ui,sans-serif;cursor:pointer}
.syn-dic-stop:hover:not(:disabled){background:color-mix(in srgb,var(--syn-recording) 18%,transparent)}
.syn-dic-stop:disabled{cursor:default}
.syn-dic-toggle{display:grid;place-items:center;width:30px;height:30px;border:0;border-radius:10px;background:transparent;color:var(--syn-foreground);cursor:pointer}
.syn-dic-toggle:hover{background:color-mix(in srgb,var(--syn-foreground) 8%,transparent)}
.syn-dic-sticks{display:flex;gap:2px;align-items:center;height:20px}
.syn-dic-sticks i{display:block;width:3px;border-radius:2px;background:currentColor;transition:height 160ms}
.syn-dic-sim{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;padding:12px 16px;border-top:1px solid var(--syn-border);background:var(--syn-background);font-size:13px}
.syn-dic-sim .syn-ui-btn[data-active]{background:var(--syn-recording);border-color:var(--syn-recording);color:var(--syn-background)}
.syn-dic-hint{flex-basis:100%;margin:0;color:var(--syn-muted-foreground)}
`;

const SYN_DIC_WORDS = SYN_DICTATION_SAMPLE.split(" ");

const SynDictationSticks = ({ tick, active }) => (
  <span className="syn-dic-sticks" aria-hidden="true">
    {[8, 14, 18, 12, 7].map((base, i) => (
      <i key={i} style={{ height: active ? Math.max(4, Math.round(base * (0.45 + ((tick + i * 2) % 5) * 0.17))) : 4 }} />
    ))}
  </span>
);

/** Panneau flottant (DictationOverlay) : bulle de texte en haut, commandes en bas. */
const SynDictationPanel = ({ phase, words, tick, preview, expanded, onFinish, onToggle, markers }) => {
  const shown = SYN_DIC_WORDS.slice(0, words);
  const transcribing = phase === "transcribing";
  const text = transcribing ? shown.join(" ") : shown.slice(0, -1).join(" ");
  const partial = transcribing ? "" : shown[shown.length - 1] ?? "";
  const empty = !preview
    ? L("Enable Live transcript preview in Settings → Dictation to see words as you speak.")
    : transcribing
      ? L("Finishing…")
      : L("Listening…");
  return (
    <div className="syn-dic-slot">
      {markers ? h(SynHotspot, { n: 1, style: { left: -30, bottom: 8 } }) : null}
      {markers && expanded ? h(SynHotspot, { n: 2, style: { left: -30, top: 12 } }) : null}
    <div className="syn-dic-panel" data-expanded={expanded ? "" : undefined}>
      {expanded ? (
        <p className="syn-dic-text" aria-live="polite" aria-atomic="false">
          {preview && (text || partial) ? (
            <>
              {text}
              {text && partial ? " " : ""}
              <span>{partial}</span>
            </>
          ) : (
            <span>{empty}</span>
          )}
        </p>
      ) : null}
      <div className="syn-dic-controls">
        <button type="button" className="syn-dic-stop" aria-label="Finish dictation" disabled={transcribing} onClick={onFinish}>
          {transcribing ? <span role="status">{L("Finishing…")}</span> : h(SynDictationSticks, { tick, active: phase === "recording" })}
        </button>
        <button type="button" className="syn-dic-toggle" aria-label={expanded ? "Collapse live transcript" : "Expand live transcript"} onClick={onToggle}>
          {h(SynIcon, { name: expanded ? I("ArrowsInSimple") : I("ArrowsOutSimple"), size: 14 })}
        </button>
      </div>
    </div>
    </div>
  );
};

const synDictationInitial = () => ({ phase: "idle", words: 0, tick: 0, expanded: true, body: "" });

/**
 * Dictée dans une autre application : le panneau flottant et un simulateur
 * du raccourci (maintenir, ou mode mains libres). `preview` : « Voir le
 * texte en direct » activé au départ.
 */
export const DictationScreen = ({ preview = true, markers = true }) => {
  const [state, setState] = useState(synDictationInitial);
  const [live, setLive] = useState(preview);
  const [handsFree, setHandsFree] = useState(false);
  const [showMarkers, setShowMarkers] = useState(markers);
  const timer = useRef(null);
  const { phase } = state;
  const recording = phase === "recording";

  useEffect(() => {
    if (!recording) return undefined;
    const id = setInterval(
      () => setState((s) => ({ ...s, tick: s.tick + 1, words: Math.min(SYN_DIC_WORDS.length, s.words + 1) })),
      380,
    );
    return () => clearInterval(id);
  }, [recording]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const start = () => setState((s) => (s.phase === "idle" ? { ...s, phase: "recording", words: 0, expanded: live } : s));
  const finish = () => {
    setState((s) => (s.phase === "recording" ? { ...s, phase: "transcribing", words: SYN_DIC_WORDS.length } : s));
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => setState((s) => (s.phase === "transcribing" ? { ...s, phase: "idle", body: s.body ? `${s.body} ${SYN_DICTATION_SAMPLE}` : SYN_DICTATION_SAMPLE } : s)),
      1100,
    );
  };
  const cancel = () => setState((s) => (s.phase === "recording" ? { ...s, phase: "idle", words: 0 } : s));
  const reset = () => {
    clearTimeout(timer.current);
    setState(synDictationInitial());
    setLive(preview);
    setHandsFree(false);
  };

  const hold = !handsFree;
  const pressLabel =
    phase === "transcribing"
      ? L("Transcribing…")
      : hold
        ? recording
          ? "Relâchez pour terminer"
          : "Maintenir le raccourci"
        : recording
          ? "Appuyer à nouveau pour terminer"
          : "Appuyer sur le raccourci";
  const pressProps = hold
    ? {
        onPointerDown: start,
        onPointerUp: finish,
        onPointerLeave: () => recording && finish(),
        onKeyDown: (e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            start();
          }
        },
        onKeyUp: (e) => {
          if (e.key === " " || e.key === "Enter") finish();
        },
      }
    : { onClick: () => (recording ? finish() : start()) };

  return h(
    SynFigure,
    { bare: true, markers: showMarkers, setMarkers: setShowMarkers, onReset: reset },
    <div
      onKeyDown={(e) => {
        if (e.key === "Escape" && recording) {
          e.preventDefault();
          cancel();
        }
      }}
    >
      <div className="syn-dic-desk">
        <div className="syn-dic-app">
          <div className="syn-dic-app-bar">
            <strong>Nouveau message</strong>
            <span>· Messagerie</span>
          </div>
          <dl>
            <dt>À</dt>
            <dd>Camille R.</dd>
            <dt>Objet</dt>
            <dd>Compte rendu de jeudi</dd>
          </dl>
          <textarea
            aria-label="Corps du message (application d'exemple)"
            placeholder="Le texte dicté s'insère ici, au curseur."
            value={state.body}
            onChange={(e) => {
              const body = e.target.value;
              setState((s) => ({ ...s, body }));
            }}
          />
        </div>
        {phase !== "idle"
          ? h(SynDictationPanel, {
              phase,
              words: state.words,
              tick: state.tick,
              preview: live,
              expanded: state.expanded,
              markers: showMarkers,
              onFinish: finish,
              onToggle: () => setState((s) => ({ ...s, expanded: !s.expanded })),
            })
          : null}
      </div>
      <div className="syn-dic-sim">
        <strong>Simulation :</strong>
        <button
          type="button"
          className="syn-ui-btn"
          data-active={recording ? "" : undefined}
          disabled={phase === "transcribing"}
          aria-pressed={hold ? undefined : recording}
          onPointerDown={pressProps.onPointerDown}
          onPointerUp={pressProps.onPointerUp}
          onPointerLeave={pressProps.onPointerLeave}
          onKeyDown={pressProps.onKeyDown}
          onKeyUp={pressProps.onKeyUp}
          onClick={pressProps.onClick}
        >
          {h(SynIcon, { name: I("Microphone"), size: 14 })}
          {pressLabel}
        </button>
        <label className="syn-check">
          <input type="checkbox" checked={handsFree} disabled={phase !== "idle"} onChange={(e) => setHandsFree(e.target.checked)} />
          {L("Hands-free dictation")}
        </label>
        <label className="syn-check">
          <input type="checkbox" checked={live} disabled={phase !== "idle"} onChange={(e) => setLive(e.target.checked)} />
          {L("Live transcript preview")}
        </label>
        <p className="syn-dic-hint" role="status">
          {phase === "transcribing"
            ? "Le texte est inséré quand la transcription est terminée."
            : recording
              ? hold
                ? "Parlez en maintenant le bouton, puis relâchez-le. Échap annule."
                : "Parlez, puis appuyez à nouveau ou cliquez sur le panneau. Échap annule."
              : hold
                ? "Par défaut, maintenez le raccourci pendant que vous parlez."
                : "Mode mains libres : une pression démarre, la suivante termine."}
        </p>
      </div>
    </div>,
  );
};
