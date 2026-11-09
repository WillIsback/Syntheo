// <Troubleshooter> : vérificateur guidé de la page Dépannage. Le guide
// (symptômes, points à vérifier) est une aide de la doc ; il ouvre les vrais
// écrans, reproduits ailleurs : <AppSettings> (Transcription, Synthèse,
// Autorisations, Réunions › Audio), <AppScreen> (capsule en écoute) et une note
// en écoute dont la transcription s'interrompt (apps/desktop/src/stt/
// live-transcript-interrupted.ts : message de pause et de reprise, bandeau
// « Transcription interrompue »).
// <DataFlows> : schéma de la page Données et confidentialité (ce qui sort du
// poste, selon l'activité). Illustration de doc, pas un écran de l'app.

const SYN_CSS_TROUBLESHOOTING = `
.syn-trb{margin:20px 0;display:flex;flex-direction:column;gap:12px}
.syn-trb-guide{border:1px solid var(--syn-border);border-radius:14px;background:var(--syn-card);padding:14px 16px}
.syn-trb-guide>p{margin:0 0 8px;font-weight:600}
.syn-trb-syms{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px;margin-bottom:12px}
.syn-trb-sym,.syn-trb-seg{display:flex;align-items:center;gap:8px;border:1px solid var(--syn-border);border-radius:10px;background:var(--syn-background);color:var(--syn-foreground);padding:8px 10px;font:400 13px/1.3 Geist,system-ui,sans-serif;text-align:left;cursor:pointer}
.syn-trb-sym[aria-checked=true],.syn-trb-seg[aria-selected=true],.syn-trb-seg[aria-pressed=true],.syn-trb-seg[aria-checked=true]{border-color:var(--syn-primary);background:var(--syn-accent);color:var(--syn-accent-foreground);font-weight:500}
.syn-trb-seg{display:inline-flex;border-radius:999px;padding:4px 12px}
.syn-trb-list{margin:0;padding-left:20px;font-size:13.5px}
.syn-trb-list li{margin:3px 0}
.syn-trb-list code{font-size:12px}
.syn-trb .syn-figure,.syn-trb .syn-path{margin:0}
.syn-trb-live{margin:8px 0 0;border-radius:8px;padding:8px 10px;font-size:12.5px;border:1px solid var(--syn-alert-border);background:var(--syn-alert);color:var(--syn-alert-foreground)}
.syn-trb-live[data-ok]{border-color:var(--syn-border);background:var(--syn-accent);color:var(--syn-accent-foreground)}
.syn-flow{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:14px;margin:12px 0}
.syn-flow-box{border:1px solid var(--syn-border);border-radius:12px;background:var(--syn-card);padding:12px 14px;font-size:13px}
.syn-flow-box ul{margin:6px 0;padding-left:18px}
.syn-flow-dest{display:flex;align-items:center;gap:8px;margin-bottom:8px;border:1px solid var(--syn-border);border-radius:10px;background:var(--syn-background);padding:7px 10px;font-size:13px}
.syn-flow-dest[data-on]{border:2px solid var(--syn-primary);background:var(--syn-accent);color:var(--syn-accent-foreground)}
.syn-flow-dest small{display:block;font-size:12px;opacity:.8}
.syn-flow dl{display:grid;grid-template-columns:130px minmax(0,1fr);gap:6px 12px;margin:0}
.syn-flow dt{color:var(--syn-muted-foreground)}
.syn-flow dd{margin:0}
@media (max-width:640px){.syn-flow{grid-template-columns:1fr}}
`;

const SYN_TRB_SYMPTOMS = [
  ["server", I("Waveform"), "Le serveur de transcription ou de synthèse est injoignable"],
  ["stops", I("Warning"), "La transcription s'arrête pendant la réunion"],
  ["sound", I("SpeakerHigh"), "Il manque du son : microphone ou audio système"],
  ["summary", I("FileText"), "Aucun compte rendu n'apparaît"],
];

/**
 * Note en écoute. `failure` : la transcription s'interrompt (cause simulée) ;
 * sinon, seule la capsule compte (son système coupé au départ).
 */
const SynTrbLiveNote = ({ failure }) => {
  const [cause, setCause] = useState("offline");
  const [resumed, setResumed] = useState(false);
  const [state, act] = useSynSession("listen");
  useEffect(() => {
    if (!failure) act.toggleSpeaker();
  }, []);
  const message = resumed
    ? L("Live transcription resumed.")
    : cause === "offline"
      ? LF("Live transcription paused: {cause}. No audio is kept: this passage will be missing from the transcription. Reconnecting…", { cause: L("you are offline") })
      : LF("Live transcription paused: {cause}. No audio is kept: this passage will be missing from the transcription. Check the transcription server settings.", {
          cause: LF("{providerName} rejected your API key", { providerName: "OpenAI" }),
        });
  return (
    <>
      {failure ? (
        <div role="group" aria-label="Cause simulée" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 13 }}>
          <span className="syn-muted">Cause simulée :</span>
          {[["offline", "Hors ligne"], ["key", L("Key refused")]].map(([id, label]) => (
            <button key={id} type="button" className="syn-trb-seg" aria-pressed={cause === id} onClick={() => { setCause(id); setResumed(false); }}>{label}</button>
          ))}
          {cause === "offline" && !resumed ? <button type="button" className="syn-trb-seg" onClick={() => setResumed(true)}>Rétablir le réseau</button> : null}
        </div>
      ) : null}
      {h(
        SynFigure,
        { title: "Revue de lancement bêta", onReset: () => { setCause("offline"); setResumed(false); act.reset(); } },
        <div className="syn-body">
          <div className="syn-doc">
            <p className="syn-title">Revue de lancement bêta</p>
            <ul className="syn-notes"><li>valider la date du 21</li><li>quota serveur de transcription ?</li></ul>
          </div>
          <aside className="syn-margin" aria-label={L("Transcription")} style={{ flexBasis: 300 }}>
            {failure ? <p className="syn-alert" role="status" style={{ marginTop: 0 }}>{LF("Transcription interrupted {gaps}", { gaps: "14:32–14:35" })}</p> : null}
            <h4>{L("Transcription")}</h4>
            <p><b>Laura</b> — on garde le 21 pour la bêta ?</p>
            <p><b>Vous</b> — oui, si le quota du serveur tient.</p>
            <p><b>Malik</b> — je regarde ça avant jeudi.</p>
            {failure ? <p className="syn-trb-live" role="status" data-ok={resumed ? "" : undefined}>{message}</p> : null}
            {state.micMuted && state.speakerMuted ? <p className="syn-alert" role="status">{L("The microphone and system audio are muted: nothing is being transcribed.")}</p> : null}
          </aside>
        </div>,
        <div className="syn-capsule-slot">{h(SynCapsule, { state, act })}</div>,
      )}
    </>
  );
};

/**
 * Vérificateur guidé : choisissez un symptôme, suivez les points à vérifier
 * dans l'écran de l'app ouvert en dessous. `symptom` : server | stops | sound | summary.
 */
export const Troubleshooter = ({ symptom = "server" }) => {
  const [sym, setSym] = useState(symptom);
  const [step, setStep] = useState(0);
  const settings = L("Settings");
  const soundSteps = [
    [L("Permissions"), [settings, L("Advanced"), L("Permissions")], () => h(AppSettings, { key: "perm", section: "permissions", focus: "audio" })],
    [L("Meetings"), [settings, L("My meetings"), L("Meetings"), L("Audio")], () => h(AppSettings, { key: "meet", section: "meetings", focus: "audio" })],
    [L("Note capsule"), ["Note de réunion", L("Listen"), L("Note capsule")], () => h(SynTrbLiveNote, { key: "cap", failure: false })],
  ];
  let path = [settings, L("My servers"), L("Transcription")];
  let screen = h(AppSettings, { key: "stt", section: "transcription", focus: "server" });
  let checks = null;
  if (sym === "server") {
    checks = [
      <>Cliquez sur « {L("Test connection")} » dans la carte du serveur. La pastille d'état indique « {L("Unreachable")} », « {L("Key refused")} » ou « {L("Invalid address")} », et le message dit quoi vérifier. Dans la reproduction, changez le port de l'adresse pour voir un échec.</>,
      <>Le serveur tourne : <code>curl http://localhost:8000/v1/models</code>.</>,
      <>L'URL de base se termine en général par <code>/v1</code>, sans identifiant ni <code>?…</code>.</>,
      <>Réponse 401 ou 403 : « {L("Key refused")} ». Vérifiez la clé dans « {L("Advanced")} ».</>,
      <>Aucun pare-feu, VPN ou proxy ne bloque le port.</>,
    ];
  } else if (sym === "stops") {
    path = ["Note de réunion", L("Listen"), L("Transcription")];
    screen = h(SynTrbLiveNote, { key: "live", failure: true });
    checks = [
      <>En bas de la marge de transcription, le message donne la cause probable.</>,
      <>Coupure réseau ou panne : Syntheo se reconnecte seul, puis affiche « {L("Live transcription resumed.")} ».</>,
      <>Clé ou réglages refusés : pas de nouvelle tentative. Corrigez le serveur dans les paramètres « {L("Transcription")} », puis relancez l'écoute.</>,
      <>L'audio n'est pas conservé : le bandeau en haut de la marge indique les périodes manquantes.</>,
    ];
  } else if (sym === "sound") {
    path = soundSteps[step][1];
    screen = soundSteps[step][2]();
    checks = [
      [<>« {L("Microphone")} » et « {L("System audio")} » : une ligne en rouge signifie que le test réel de la source a échoué. Corrigez la cause, puis cliquez sur la flèche pour relancer le test.</>],
      [<>Choisissez sous « {L("System sound")} » la sortie où vous entendez les autres participants. « {L("Captured right now:")} » donne la sortie réellement captée.</>],
      [<>Une source coupée a son icône barrée sur fond rouge. Rétablissez-la d'un clic, ou avec Ctrl + {L("Shift")} + M (micro) et Ctrl + {L("Shift")} + S (son système).</>],
    ][step];
  } else {
    path = [settings, L("My servers"), L("Synthesis")];
    screen = h(AppSettings, { key: "llm", section: "intelligence", focus: "model" });
    checks = [
      <>Un compte rendu nécessite un serveur de synthèse : sa pastille doit indiquer « Connecté ».</>,
      <>Choisissez un modèle sous « {L("Model")} ». Le vôtre n'y est pas ? « {L("Enter another name")} ».</>,
      <>Serveur injoignable : reprenez le premier symptôme.</>,
    ];
  }
  return (
    <div className="syn-root syn-trb not-prose">
      {h(SynStyle)}
      <section className="syn-trb-guide" aria-label="Vérificateur guidé">
        <p>Quel est le symptôme ?</p>
        <div className="syn-trb-syms" role="radiogroup" aria-label="Symptôme">
          {SYN_TRB_SYMPTOMS.map(([id, icon, label]) => (
            <button key={id} type="button" role="radio" className="syn-trb-sym" aria-checked={sym === id} onClick={() => { setSym(id); setStep(0); }}>
              {h(SynIcon, { name: icon })}
              <span>{label}</span>
            </button>
          ))}
        </div>
        {sym === "sound" ? (
          <div role="tablist" aria-label="Étapes" style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {soundSteps.map(([label], i) => (
              <button key={label} type="button" role="tab" className="syn-trb-seg" aria-selected={step === i} onClick={() => setStep(i)}>{i + 1}. {label}</button>
            ))}
          </div>
        ) : null}
        <p className="syn-muted syn-small" style={{ margin: "0 0 4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>À vérifier</p>
        <ol className="syn-trb-list" aria-live="polite">{checks.map((c, i) => <li key={`${sym}-${step}-${i}`}>{c}</li>)}</ol>
      </section>
      {h(SettingsPath, { steps: path })}
      {screen}
    </div>
  );
};

const SYN_FLOW_DESTS = [
  ["stt", "Votre serveur de transcription"],
  ["llm", "Votre serveur de synthèse"],
  ["hooks", "Les adresses de vos webhooks"],
  ["auto", "L'adresse de l'étape webhook"],
];
const SYN_FLOW_ACTS = [
  ["listen", "Écoute d'une réunion", "stt", "L'audio de la capture : micro et son système.", "Pendant la transcription"],
  ["dictation", "Dictée", "stt", "L'audio de la dictée, produit en mémoire.", "Pendant la transcription"],
  ["import", "Import d'un fichier audio", "stt", "L'audio du fichier, lu à son emplacement d'origine, sans copie.", "Pendant la transcription"],
  ["summary", "Compte rendu, chat", "llm", "Le texte utile à la tâche : transcription, notes, consignes du modèle de compte rendu, question du chat.", "Compte rendu, chat, « Proposer des sections », fil rouge et ordre du jour d'un dossier, étape « Générer » d'une automatisation"],
  ["webhooks", "Webhooks des Paramètres", "hooks", "Les événements de réunion (note, résumés, participants, transcription).", "À chaque événement, si vous avez ajouté un point de terminaison"],
  ["auto", "Étape webhook d'une automatisation", "auto", "Le contenu que vous y placez.", "Quand l'automatisation s'exécute"],
];

/** Schéma « Ce qui sort de votre poste » : choisissez une activité. */
export const DataFlows = ({ activity = "listen" }) => {
  const [act, setAct] = useState(activity);
  const [muted, setMuted] = useState(false);
  const current = SYN_FLOW_ACTS.find(([id]) => id === act) ?? SYN_FLOW_ACTS[0];
  const [, , dest, what, when] = current;
  return (
    <figure className="syn-root syn-figure not-prose">
      {h(SynStyle)}
      <div className="syn-bar">
        <span className="syn-badge">{h(SynIcon, { name: I("ShieldCheck"), size: 14 })}Schéma interactif · Syntheo {SYN_VERSION}</span>
        <span className="syn-bar-actions">Choisissez une activité.</span>
      </div>
      <div role="radiogroup" aria-label="Activité" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {SYN_FLOW_ACTS.map(([id, label]) => (
          <button key={id} type="button" role="radio" className="syn-trb-seg" aria-checked={act === id} onClick={() => setAct(id)}>{label}</button>
        ))}
      </div>
      <div className="syn-flow">
        <div className="syn-flow-box">
          <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>{h(SynIcon, { name: I("Desktop") })}Votre poste</strong>
          <ul>
            <li><code>app.db</code> : transcriptions, notes, comptes rendus, contacts, dossiers, automatisations, réglages</li>
            <li>Index de recherche</li>
            <li>Journaux techniques (contenu masqué)</li>
            <li>Clés API : trousseau du système</li>
            <li>Exports : dossier choisi</li>
          </ul>
          <p style={{ margin: 0 }}><strong>Audio : nulle part.</strong> Il vit en mémoire le temps d'être envoyé, puis disparaît.</p>
        </div>
        <div>
          {SYN_FLOW_DESTS.map(([id, name]) => (
            <div key={id} className="syn-flow-dest" data-on={id === dest ? "" : undefined}>
              {h(SynIcon, { name: id === dest ? I("ArrowRight") : I("X"), size: 14 })}
              <span><strong style={{ fontWeight: 500 }}>{name}</strong><small>{id === dest ? "Reçoit des données maintenant" : "Aucun envoi pour cette activité"}</small></span>
            </div>
          ))}
          <p className="syn-muted" style={{ margin: 0, fontSize: 13 }}><strong>Éditeur de Syntheo</strong> : rien. Pas de compte, pas de statistiques d'usage, pas de rapport d'erreur, pas de vérification de mise à jour.</p>
        </div>
      </div>
      <div className="syn-flow-box syn-flow" aria-live="polite" style={{ display: "block", margin: 0 }}>
        <dl>
          <dt>Destination</dt><dd>{SYN_FLOW_DESTS.find(([id]) => id === dest)[1]}</dd>
          <dt>Ce qui est envoyé</dt><dd>{act === "listen" && muted ? "Du silence à la place du micro : ce qu'il capte ne quitte pas votre poste. Le son système reste envoyé." : what}</dd>
          <dt>Quand</dt><dd>{when}</dd>
        </dl>
        {act === "listen" ? (
          <label className="syn-check" style={{ marginTop: 10, fontSize: 13 }}>
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
            {L("Mute the microphone")} dans la capsule (Ctrl + {L("Shift")} + M)
          </label>
        ) : null}
      </div>
    </figure>
  );
};
