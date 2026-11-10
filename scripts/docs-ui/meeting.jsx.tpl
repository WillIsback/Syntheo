// Lot 1 (issue 512) : meetings.mdx.

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
      {h(SynStyle)}
      {h(SynToolbar, { markers: showMarkers, setMarkers: setShowMarkers, onReset: act.reset })}
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
          {h(SynCapsule, { state, act, markers: showMarkers })}
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
      {h(SynStyle)}
      {h(SynToolbar, { onReset: act.reset })}
      <div style={{ display: "flex", justifyContent: "center", padding: "18px 0", overflowX: "auto" }}>
        {h(SynCapsule, { state, act })}
      </div>
    </figure>
  );
};
