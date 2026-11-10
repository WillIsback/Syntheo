// Page automatic-capture : la notification « Êtes-vous en réunion ? » et la
// pastille flottante d'écoute. Reproduit apps/desktop/src/stt/detect-events.ts
// (titre, bouton « Oui », pied « Ignorer … ? », 15 secondes),
// stt/meeting-apps.ts (getIgnoreAppsFooterText), la notification native de
// crates/notification-linux (en haut à droite, croix, barre de temps) et
// apps/desktop/src/meeting-float/overlay/bar.tsx (MeetingPill,
// RecordingControls, MicrophoneToggle, PausedControls) avec les dimensions
// de overlay/layout.ts. L'application de visio et le simulateur sont propres
// à la doc.

const SYN_CSS_AUTOCAPTURE = `
.syn-ac-desk{position:relative;height:440px;padding:20px 24px;background:color-mix(in srgb,var(--syn-muted) 70%,var(--syn-background));overflow:hidden}
.syn-ac-call{width:470px;border:1px solid var(--syn-border);border-radius:10px;background:var(--syn-card);overflow:hidden}
.syn-ac-call-bar{display:flex;gap:8px;padding:7px 12px;border-bottom:1px solid var(--syn-border);font-size:12px;color:var(--syn-muted-foreground)}
.syn-ac-call-bar strong{color:var(--syn-foreground);font-weight:500}
.syn-ac-tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px}
.syn-ac-tiles div{display:grid;place-items:end start;height:120px;border-radius:8px;background:var(--syn-muted);padding:8px;font-size:12px;color:var(--syn-muted-foreground)}
.syn-ac-notif{position:absolute;top:15px;right:24px;width:330px;border:1px solid var(--syn-border);border-radius:14px;background:var(--syn-popover);box-shadow:var(--syn-shadow-capsule);overflow:hidden}
.syn-ac-close{position:absolute;top:6px;left:6px;display:grid;place-items:center;width:20px;height:20px;border:0;border-radius:999px;background:var(--syn-muted);color:var(--syn-muted-foreground);font:14px/1 Geist,system-ui,sans-serif;cursor:pointer;padding:0}
.syn-ac-main{display:flex;align-items:center;gap:10px;padding:14px 12px 10px 32px}
.syn-ac-main strong{flex:1;font-size:14px;font-weight:600}
.syn-ac-foot{display:flex;align-items:center;gap:8px;padding:8px 12px 10px 32px;border-top:1px solid var(--syn-border);font-size:13px;color:var(--syn-muted-foreground)}
.syn-ac-foot span{flex:1}
.syn-ac-appicon{display:grid;place-items:center;width:26px;height:26px;border-radius:7px;background:var(--syn-accent);color:var(--syn-accent-foreground)}
.syn-ac-progress{height:3px;background:var(--syn-primary);transition:width 1s linear}
.syn-ac-pill-slot{position:absolute;left:50%;bottom:22px;transform:translateX(-50%)}
.syn-ac-pill{display:flex;align-items:center;height:38px;padding:0 4px;border-radius:14px;background:color-mix(in srgb,var(--syn-card) 82%,transparent);box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--syn-foreground) 14%,transparent),var(--syn-shadow-capsule);color:var(--syn-foreground);white-space:nowrap;font:600 12px/1 Geist,system-ui,sans-serif}
.syn-ac-pill button{display:flex;align-items:center;justify-content:center;gap:5px;flex-shrink:0;height:30px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:0}
.syn-ac-pill button:hover{background:color-mix(in srgb,var(--syn-foreground) 8%,transparent)}
.syn-ac-dot{display:block;width:8px;height:8px;border-radius:999px;background:var(--syn-recording);animation:syn-ac-pulse 2s ease-in-out infinite}
@keyframes syn-ac-pulse{50%{opacity:.5}}
.syn-ac-slot{display:flex;flex-shrink:0;justify-content:center;align-items:center}
.syn-ac-sticks{display:flex;gap:2px;align-items:center;height:16px}
.syn-ac-sticks i{display:block;width:2px;border-radius:2px;background:var(--syn-recording);transition:height 300ms}
.syn-ac-pill button.syn-ac-mic[aria-pressed=true]{background:var(--syn-recording);color:var(--syn-background)}
.syn-ac-pill button.syn-ac-finish{margin-left:2px;background:color-mix(in srgb,var(--syn-foreground) 8%,transparent);color:var(--syn-recording)}
.syn-ac-pill button.syn-ac-finish:hover{background:color-mix(in srgb,var(--syn-recording) 18%,transparent)}
.syn-ac-square{display:block;width:9px;height:9px;border-radius:2px;background:currentColor}
.syn-ac-sim{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px 16px;border-top:1px solid var(--syn-border);background:var(--syn-background);font-size:13px}
.syn-ac-hint{flex-basis:100%;margin:0;color:var(--syn-muted-foreground)}
@media (prefers-reduced-motion:reduce){.syn-ac-dot{animation:none}}
`;

const SYN_AC_APP = "Visio";
const SYN_AC_NOTIF_SECONDS = 15;

const synAcDuration = (s) => {
  const pad = (v) => String(v).padStart(2, "0");
  const hours = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return hours > 0 ? `${hours}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

/** Notification native « Êtes-vous en réunion ? » (Linux, en haut à droite). */
const SynAcNotification = ({ remaining, onAccept, onIgnore, onDismiss, markers }) => (
  <div className="syn-ac-notif" role="alertdialog" aria-label={L("Are you in a meeting?")}>
    <button type="button" className="syn-ac-close" aria-label="Fermer la notification" onClick={onDismiss}>
      <span aria-hidden="true">×</span>
    </button>
    {markers ? h(SynHotspot, { n: 1, style: { right: 64, top: 16 } }) : null}
    {markers ? h(SynHotspot, { n: 2, style: { right: 64, top: 62 } }) : null}
    <div className="syn-ac-main">
      <span className="syn-ac-appicon" aria-hidden="true">{h(SynIcon, { name: I("Microphone"), size: 15 })}</span>
      <strong>{L("Are you in a meeting?")}</strong>
      <button type="button" className="syn-ui-btn" data-variant="primary" onClick={onAccept}>{L("Yes")}</button>
    </div>
    <div className="syn-ac-foot">
      {h(SynIcon, { name: I("VideoCamera"), size: 14 })}
      <span>{LF("Ignore {firstName}?", { firstName: SYN_AC_APP })}</span>
      <button type="button" className="syn-ui-btn" onClick={onIgnore}>{L("Yes")}</button>
    </div>
    <div aria-hidden="true">
      <div className="syn-ac-progress" style={{ width: `${(remaining / SYN_AC_NOTIF_SECONDS) * 100}%` }} />
    </div>
  </div>
);

/** Pastille d'écoute (MeetingPill) : 294 px en écoute, 232 px en pause. */
const SynAcPill = ({ state, act, markers }) => {
  const { paused, error, micMuted, elapsed } = state;
  const duration = synAcDuration(elapsed);
  const notice = L("Recording needs attention");
  return (
    <div className="syn-ac-pill-slot">
      {markers && !paused ? h(SynHotspot, { n: 3, style: { left: 30, top: -28 } }) : null}
      {markers && !paused ? h(SynHotspot, { n: 4, style: { left: 103, top: -28 } }) : null}
      {markers ? h(SynHotspot, { n: 5, style: { right: 70, top: -28 } }) : null}
      <div className="syn-ac-pill" role="group" aria-label="Barre flottante de Syntheo" style={{ width: paused ? 232 : 294 }}>
        {paused ? (
          <div style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center", gap: 4 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 4px" }}>
              {h(SynIcon, { name: I("Pause"), size: 12 })}
              <span role="status">{L("Paused")}</span>
            </span>
            <button
              type="button"
              aria-label={L("Resume listening")}
              onClick={act.resume}
              style={{ padding: "0 8px", gap: 4, background: "color-mix(in srgb,var(--syn-recording) 18%,transparent)", color: "var(--syn-recording)" }}
            >
              {h(SynIcon, { name: I("Play"), size: 10 })}
              {L("Resume")}
            </button>
            <button
              type="button"
              aria-label={L("Finish the meeting")}
              onClick={act.finish}
              style={{ padding: "0 8px", gap: 4, fontWeight: 400, background: "color-mix(in srgb,var(--syn-foreground) 8%,transparent)" }}
            >
              <span className="syn-ac-square" aria-hidden="true" style={{ width: 8, height: 8 }} />
              {L("Finish")}
            </button>
          </div>
        ) : (
          <>
            <span className="syn-ac-slot" aria-hidden="true" style={{ width: 22 }}>
              <span className="syn-ac-dot" />
            </span>
            <button
              type="button"
              aria-label={LF("{duration}, back to the note", { duration })}
              title={L("Back to the note")}
              onClick={act.openNote}
              style={{ width: elapsed >= 3600 ? 54 : 38, fontVariantNumeric: "tabular-nums" }}
            >
              {duration}
            </button>
            <span className="syn-ac-slot" style={{ width: 28, color: "var(--syn-recording)" }}>
              {error ? (
                <span role="img" aria-label={notice} style={{ display: "flex" }}>{h(SynIcon, { name: I("WarningCircle"), size: 16 })}</span>
              ) : (
                <span className="syn-ac-sticks" aria-hidden="true">
                  {[0.5, 0.8, 1, 0.7, 0.45].map((w, i) => (
                    <i key={i} style={{ height: micMuted ? 3 : Math.max(3, Math.round(16 * w * (0.55 + ((elapsed + i * 3) % 4) * 0.15))) }} />
                  ))}
                </span>
              )}
            </span>
            <span className="syn-ac-slot" aria-hidden="true" style={{ width: 9 }}>
              <span style={{ display: "block", width: 1, height: 18, background: "color-mix(in srgb,var(--syn-foreground) 14%,transparent)" }} />
            </span>
            <span className="syn-ac-slot" style={{ width: 32, justifyContent: "flex-start" }}>
              <button
                type="button"
                className="syn-ac-mic"
                aria-label={L("Mute the microphone")}
                aria-pressed={micMuted}
                title={micMuted ? L("Unmute the microphone") : L("Mute the microphone")}
                onClick={act.toggleMic}
                style={{ width: 30 }}
              >
                {h(SynIcon, { name: micMuted ? I("MicrophoneSlash") : I("Microphone"), size: 14 })}
              </button>
            </span>
            <button type="button" aria-label={L("Pause listening")} onClick={act.pause} style={{ width: 70 }}>
              {h(SynIcon, { name: I("Pause"), size: 12 })}
              {L("Pause")}
            </button>
            <button
              type="button"
              className="syn-ac-finish"
              aria-label={L("Finish the meeting")}
              title={error ? LF("{notice}. Open Syntheo to retry or change devices.", { notice }) : undefined}
              onClick={act.finish}
              style={{ width: 85 }}
            >
              <span className="syn-ac-square" aria-hidden="true" />
              {L("Finish")}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const SYN_AC_HINT_START = "Visio utilise le micro depuis un moment : Syntheo vous le signale.";
const synAcInitial = () => ({ stage: "notified", remaining: SYN_AC_NOTIF_SECONDS, elapsed: 0, paused: false, error: false, micMuted: false, hint: SYN_AC_HINT_START });

/**
 * Bureau pendant un appel : la notification de détection, puis la pastille
 * flottante (durée, niveau, micro, Pause, Terminer ; « En pause » ; alerte).
 */
export const AutoCaptureScreen = ({ markers = true }) => {
  const [state, setState] = useState(synAcInitial);
  const [showMarkers, setShowMarkers] = useState(markers);
  const { stage, paused } = state;
  const patch = (p) => setState((s) => ({ ...s, ...p }));

  useEffect(() => {
    if (stage !== "notified") return undefined;
    const id = setInterval(
      () =>
        setState((s) =>
          s.remaining <= 1
            ? { ...s, stage: "idle", remaining: 0, hint: "La notification a disparu sans démarrer d'écoute." }
            : { ...s, remaining: s.remaining - 1 },
        ),
      1000,
    );
    return () => clearInterval(id);
  }, [stage]);
  useEffect(() => {
    if (stage !== "listening" || paused) return undefined;
    const id = setInterval(() => setState((s) => ({ ...s, elapsed: s.elapsed + 1 })), 1000);
    return () => clearInterval(id);
  }, [stage, paused]);

  const act = {
    openNote: () => patch({ hint: "« Revenir à la note » : la note en cours repasse au premier plan." }),
    toggleMic: () => setState((s) => ({ ...s, micMuted: !s.micMuted, hint: s.micMuted ? "Micro rétabli." : "Micro coupé : votre voix n'est plus captée ; le bouton passe au rouge." })),
    pause: () => patch({ paused: true, hint: "Écoute en pause : rien n'est capté jusqu'à « Reprendre »." }),
    resume: () => patch({ paused: false, hint: "Écoute reprise." }),
    finish: () => patch({ stage: "done", paused: false, hint: "Réunion terminée : la pastille disparaît et la note passe à la synthèse." }),
  };
  const listening = stage === "listening";

  return h(
    SynFigure,
    { bare: true, markers: showMarkers, setMarkers: setShowMarkers, onReset: () => setState(synAcInitial()) },
    <div>
      <div className="syn-ac-desk" role="group" aria-label="Bureau pendant un appel">
        <div className="syn-ac-call" aria-hidden="true">
          <div className="syn-ac-call-bar">
            <strong>{SYN_AC_APP}</strong>
            <span>· Point hebdo produit</span>
          </div>
          <div className="syn-ac-tiles">
            <div>Camille R.</div>
            <div>Vous</div>
          </div>
        </div>
        {stage === "notified"
          ? h(SynAcNotification, {
              remaining: state.remaining,
              markers: showMarkers,
              onAccept: () => patch({ stage: "listening", elapsed: 0, paused: false, error: false, micMuted: false, hint: "Une note s'ouvre et l'écoute démarre ; la pastille apparaît en bas au centre." }),
              onIgnore: () => patch({ stage: "idle", hint: `${SYN_AC_APP} rejoint « ${L("Exclude apps from detection")} » : plus de notification pour cette application.` }),
              onDismiss: () => patch({ stage: "idle", hint: "Notification fermée : aucune écoute ne démarre." }),
            })
          : null}
        {listening ? h(SynAcPill, { state, act, markers: showMarkers }) : null}
      </div>
      <div className="syn-ac-sim">
        <strong>Simulation :</strong>
        <button type="button" className="syn-ui-btn" onClick={() => setState(synAcInitial())}>Rejouer la détection</button>
        <button
          type="button"
          className="syn-ui-btn"
          disabled={!listening}
          aria-pressed={state.error}
          onClick={() => setState((s) => ({ ...s, error: !s.error, hint: s.error ? "Capture rétablie." : "Alerte : le niveau laisse place à un avertissement. Ouvrez Syntheo pour réessayer ou changer d'appareil." }))}
        >
          Simuler une alerte
        </button>
        <button
          type="button"
          className="syn-ui-btn"
          disabled={!listening}
          onClick={() => patch({ stage: "done", paused: false, hint: `« ${L("Stop when meeting ends")} » : ${SYN_AC_APP} libère le micro, l'écoute s'arrête.` })}
        >
          {SYN_AC_APP} libère le micro
        </button>
        <p className="syn-ac-hint" role="status">{state.hint}</p>
      </div>
    </div>,
  );
};
