// Page import-recordings : le menu ••• d'une note vide et la progression d'un
// import audio. Reproduit apps/desktop/src/session/components/outer-header/
// (index.tsx, overflow/index.tsx : entrées du menu, « Téléverser » seulement
// dans une note vide), folder-picker.tsx (bouton du dossier),
// note-input/transcript/screens/empty.tsx (avancement dans la marge
// Transcription), session/components/capsule/import-progress.tsx (état
// « Import » de la capsule, issue 526) et apps/desktop/src/stt/batch-eta.ts
// (estimation fiable après 3 s et 2 %). Échelle de démonstration : une
// seconde vaut une minute d'audio traité.

const SYN_CSS_IMPORT = `
.syn-imp-head{display:flex;justify-content:flex-end;align-items:center;gap:2px;height:44px;padding:0 8px}
.syn-imp-head .syn-icon-btn{border-radius:999px}
.syn-imp-body{display:flex;min-height:330px}
.syn-imp-doc{flex:1;min-width:0;padding:6px 28px 96px}
.syn-imp-margin{flex:0 0 250px;border-left:1px solid var(--syn-border);background:var(--syn-card);padding:18px 16px 96px;font-size:13px;color:var(--syn-muted-foreground)}
.syn-imp-margin h4{margin:0 0 10px;font-size:13px;font-weight:600;color:var(--syn-foreground)}
.syn-imp-margin p{margin:0 0 8px}
.syn-imp-margin b{color:var(--syn-foreground);font-weight:600}
.syn-imp-status{display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:24px;text-align:center}
.syn-imp-status p{margin:0}
.syn-imp-spin{width:36px;height:36px;border:3px solid var(--syn-border);border-top-color:var(--syn-primary);border-radius:999px;animation:syn-imp-spin 900ms linear infinite}
@keyframes syn-imp-spin{to{transform:rotate(360deg)}}
.syn-imp-cap{display:flex;align-items:center;gap:12px;padding:0 8px}
.syn-imp-cap-row{display:flex;align-items:center;gap:8px}
.syn-imp-bar{width:112px;height:4px;border-radius:999px;background:color-mix(in srgb,var(--syn-primary-foreground) 25%,transparent);overflow:hidden}
.syn-imp-bar div{height:100%;border-radius:999px;background:var(--syn-primary-foreground);transition:width 300ms}
.syn-imp-pct{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums}
.syn-imp-est{padding-left:20px;font-size:12px;font-variant-numeric:tabular-nums;color:color-mix(in srgb,var(--syn-primary-foreground) 70%,transparent)}
.syn-imp-cap .syn-btn:disabled{opacity:.5;cursor:default}
.syn-imp-sim{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px 16px;border-top:1px solid var(--syn-border);background:var(--syn-background);font-size:13px}
.syn-imp-hint{flex-basis:100%;margin:0;color:var(--syn-muted-foreground)}
@media (prefers-reduced-motion:reduce){.syn-imp-spin{animation:none}}
`;

const SYN_IMP_TITLE = "Entretien Atelier Brun";
const SYN_IMP_FILE = "entretien-atelier-brun.m4a";
const SYN_IMP_AUDIO_SECONDS = 52 * 60;
const SYN_IMP_SCALE = 60;

// estimateBatchProgress de stt/batch-eta.ts, temps mis à l'échelle de la démo :
// 30 s et 5 % avant d'estimer, débit minoré de 40 % tant qu'aucune
// reconnexion n'est mesurée (la démo n'en a pas).
const synImpEstimate = (elapsed, fraction) => {
  const seconds = elapsed * SYN_IMP_SCALE;
  if (fraction >= 1 || seconds < 30 || fraction < 0.05) return null;
  const rate = (fraction / seconds) * 0.6;
  return { remaining: (1 - fraction) / rate, speed: rate * SYN_IMP_AUDIO_SECONDS };
};

const synImpPercent = (fraction) =>
  new Intl.NumberFormat(SYN_LOCALE, { style: "percent", maximumFractionDigits: 0 }).format(Math.round(fraction * 100) / 100);

/** État « Import » de la capsule (import-progress.tsx). */
const SynImportCapsule = ({ fraction, estimate, onStop }) => {
  const percent = Math.round(fraction * 100);
  let line = L("Estimating…");
  if (estimate) {
    const minutes = Math.round(estimate.remaining / 60);
    const factor = new Intl.NumberFormat(SYN_LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(estimate.speed);
    line = `${estimate.remaining < 60 ? L("< 1 min left") : LF("~{minutes} min left", { minutes })} · ${LF("×{factor}", { factor })}`;
  }
  return (
    <div className="syn-capsule" role="group" aria-label={L("Note capsule")}>
      <ol className="syn-steps" aria-label={L("Note steps")}>
        {SYN_STAGES.map(([id, kanji, label], index) => (
          <li key={id} aria-current={id === "synthesis" ? "step" : undefined}>
            {index > 0 ? <span aria-hidden="true" style={{ opacity: 0.7, fontWeight: 400 }}>·</span> : null}
            <span>
              <span className="syn-kanji" aria-hidden="true">{kanji}</span>
              {label}
            </span>
          </li>
        ))}
      </ol>
      <span className="syn-sep" aria-hidden="true" />
      <div className="syn-imp-cap">
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div className="syn-imp-cap-row">
            <span aria-hidden="true" style={{ width: 12, textAlign: "center" }}>↑</span>
            <span role="status" style={{ fontSize: 13, fontWeight: 600 }}>{L("Import")}</span>
            <div className="syn-imp-bar" role="progressbar" aria-label={L("Import progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <div style={{ width: `${percent}%` }} />
            </div>
            <span className="syn-imp-pct">{synImpPercent(fraction)}</span>
          </div>
          <span className="syn-imp-est">{line}</span>
        </div>
        <button type="button" className="syn-btn" data-tone="primary" disabled={!onStop} onClick={onStop}>{L("Stop")}</button>
      </div>
    </div>
  );
};

/** Avancement dans la marge Transcription (screens/empty.tsx). */
const SynImportMargin = ({ phase, fraction, estimate, onStop }) => {
  const minutes = estimate ? Math.round(estimate.remaining / 60) : 0;
  return (
    <div className="syn-imp-status" role="status">
      <span className="syn-imp-spin" aria-hidden="true" />
      <p style={{ color: "var(--syn-foreground)" }}>{phase === "importing" ? L("Importing audio...") : L("Generating transcript...")}</p>
      {phase === "transcribing" && fraction > 0 ? <p>{LF("{0}% complete", { 0: Math.round(fraction * 100) })}</p> : null}
      {estimate ? <p>{minutes < 1 ? L("Less than a minute remaining") : LF("About {minutes} min remaining", { minutes })}</p> : null}
      {phase === "transcribing" ? (
        <button type="button" className="syn-ui-btn" style={{ marginTop: 6 }} onClick={onStop}>
          {h(SynIcon, { name: I("Square"), size: 12 })}
          {L("Stop transcription")}
        </button>
      ) : null}
    </div>
  );
};

const SYN_IMP_HINT = "Note vide : le menu ••• propose les deux imports.";
const synImpInitial = () => ({ stage: "prepare", phase: "importing", fraction: 0, elapsed: 0, hint: SYN_IMP_HINT });

/**
 * Note vide, menu ••• (« Téléverser un audio », « Téléverser un transcript »)
 * puis import audio : avancement dans la marge et capsule en état « Import ».
 */
export const ImportScreen = ({ markers = true }) => {
  const [state, setState] = useState(synImpInitial);
  const [showMarkers, setShowMarkers] = useState(markers);
  const { stage, phase, fraction, elapsed } = state;
  const patch = (p) => setState((s) => ({ ...s, ...p }));

  useEffect(() => {
    if (stage !== "batch") return undefined;
    if (phase === "importing") {
      const id = setTimeout(() => patch({ phase: "transcribing" }), 1200);
      return () => clearTimeout(id);
    }
    const id = setInterval(
      () =>
        setState((s) => {
          const next = Math.min(1, s.fraction + 0.035);
          return next >= 1
            ? { ...s, stage: "done", fraction: 1, hint: "Transcription terminée : Syntheo rédige le compte rendu si un serveur de synthèse est configuré." }
            : { ...s, fraction: next, elapsed: s.elapsed + 1 };
        }),
      1000,
    );
    return () => clearInterval(id);
  }, [stage, phase]);

  const estimate = stage === "batch" && phase === "transcribing" ? synImpEstimate(elapsed, fraction) : null;
  const stop = () => patch({ stage: "prepare", fraction: 0, elapsed: 0, hint: "Transcription arrêtée : la note redevient vide." });
  const reset = () => {
    setState(synImpInitial());
  };
  const items = [
    { label: L("Meeting info"), icon: I("CalendarBlank"), hint: "›" },
    { label: L("Version history"), icon: I("ClockCounterClockwise") },
    { separator: true },
    ...(stage === "prepare"
      ? [
          { label: L("Upload audio"), icon: I("Waveform"), onSelect: () => patch({ stage: "batch", phase: "importing", fraction: 0, elapsed: 0, hint: `Fichier choisi : ${SYN_IMP_FILE} (52 min).` }) },
          { label: L("Upload transcript"), icon: I("FileText"), onSelect: () => patch({ hint: "« Téléverser un transcript » : choisissez un fichier .vtt ou .srt ; le texte horodaté est ajouté à la note." }) },
          { separator: true },
        ]
      : []),
    { label: L("Open in New Window"), icon: I("AppWindow") },
    { label: L("Always on Top"), icon: I("PushPin") },
    { separator: true },
    { label: L("Lock Note"), icon: I("Lock") },
    { label: L("Delete"), icon: I("Trash") },
  ];

  return h(
    SynFigure,
    { title: SYN_IMP_TITLE, markers: showMarkers, setMarkers: setShowMarkers, onReset: reset },
    <div>
      <div style={{ position: "relative" }}>
      <div className="syn-imp-head">
        <button type="button" className="syn-icon-btn" aria-label={L("Select folder")} title={L("Select folder")}>
          {h(SynIcon, { name: I("Folder") })}
        </button>
        <span style={{ position: "relative", display: "inline-flex" }}>
          {showMarkers ? h(SynHotspot, { n: 1, style: { left: -50, top: 4 } }) : null}
          {h(SynMenuButton, { label: "More", items })}
        </span>
      </div>
      <div className="syn-imp-body">
        <div className="syn-imp-doc">
          <p className="syn-title">{SYN_IMP_TITLE}</p>
          {stage === "prepare" ? <p className="syn-hint">{L("Write freely, Syntheo will complete it.")}</p> : null}
          {stage === "done" ? (
            <div className="syn-summary">
              <h4>Décisions</h4>
              <ul>
                <li>La livraison reste fixée au 2 décembre.</li>
                <li>Hélène relance le transporteur demain.</li>
              </ul>
            </div>
          ) : null}
        </div>
        {stage !== "prepare" ? (
          <aside className="syn-imp-margin" aria-label={L("Transcription")} style={{ position: "relative" }}>
            {showMarkers ? h(SynHotspot, { n: 2, style: { left: -11, top: 14 } }) : null}
            <h4>{L("Transcription")}</h4>
            {stage === "batch" ? (
              h(SynImportMargin, { phase, fraction, estimate, onStop: stop })
            ) : (
              <>
                <p><b>Hélène</b> — On garde la livraison au 2 décembre ?</p>
                <p><b>Vous</b> — Oui, si les échantillons arrivent lundi.</p>
                <p><b>Hélène</b> — Je relance le transporteur demain.</p>
              </>
            )}
          </aside>
        ) : null}
      </div>
      <div className="syn-capsule-slot">
        {showMarkers && stage === "batch" ? h(SynHotspot, { n: 3, style: { left: "50%", top: -30, marginLeft: -11 } }) : null}
        {stage === "batch"
          ? h(SynImportCapsule, { fraction, estimate, onStop: phase === "transcribing" ? stop : undefined })
          : h(SynCapsule, { state: { stage: stage === "done" ? "synthesis" : "prepare", paused: false, micMuted: false, speakerMuted: false, seconds: 0 }, act: {} })}
      </div>
      </div>
      <div className="syn-imp-sim">
        <strong>Simulation :</strong>
        <button type="button" className="syn-ui-btn" onClick={reset}>Revenir à la note vide</button>
        <p className="syn-imp-hint" role="status">{state.hint}</p>
      </div>
    </div>,
  );
};
