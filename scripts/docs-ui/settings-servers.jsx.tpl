// Paramètres › Transcription et › Synthèse : apps/desktop/src/settings/ai/
// stt/index.tsx + stt/server-card.tsx, llm/index.tsx + llm/server-card.tsx,
// shared/server-card.tsx (carte, pastille d'état, bannière d'échec, modèles en
// boutons radio, « Aide »), shared/server-address.tsx (adresse enregistrée au
// fil de la saisie, test automatique, « Avancé » : clé, réinitialisation) et
// shared/server-connection.ts (états). Le serveur est simulé : un port connu
// répond, un autre port ne répond pas.
// focus : "server" (la carte), "protocol", "model" ou "effort" (Synthèse).

const SYN_CSS_SERVERS = `
.syn-srv-card{display:flex;flex-direction:column;gap:14px;border:1px solid var(--syn-border);border-radius:14px;background:var(--syn-card);padding:18px 20px}
.syn-srv-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:14px}
.syn-srv-head h3{margin:0;font-size:14px;font-weight:600}
.syn-srv-chip{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:2px 10px;font-size:13px;font-weight:500;background:var(--syn-muted);color:var(--syn-muted-foreground)}
.syn-srv-chip[data-tone=good]{background:var(--syn-accent);color:var(--syn-accent-foreground)}
.syn-srv-chip[data-tone=bad]{background:var(--syn-alert);color:var(--syn-alert-foreground)}
.syn-srv-chip i{width:7px;height:7px;border-radius:999px;background:currentColor}
@keyframes syn-srv-spin{to{transform:rotate(360deg)}}
.syn-srv-banner{border:1px solid var(--syn-alert-border);border-radius:10px;background:var(--syn-alert);color:var(--syn-alert-foreground);padding:10px 14px;font-size:14px}
.syn-srv-field{display:flex;flex-direction:column;gap:6px}
.syn-srv-label{font-size:13px;font-weight:500;color:var(--syn-muted-foreground)}
.syn-srv-input{width:100%;min-height:36px;border:1px solid var(--syn-input);border-radius:10px;background:var(--syn-card);color:var(--syn-foreground);padding:8px 12px;font:400 14px/1.3 "Geist Mono",ui-monospace,monospace}
.syn-srv-input::placeholder{color:var(--syn-faint)}
.syn-srv-error{margin:0;font-size:13px;color:var(--syn-destructive)}
.syn-srv-root details>summary{cursor:pointer;font-size:14px;color:var(--syn-muted-foreground)}
.syn-srv-root details>summary:hover{color:var(--syn-foreground)}
.syn-srv-more{display:flex;flex-direction:column;gap:12px;margin-top:10px}
.syn-srv-help{display:flex;flex-direction:column;gap:8px;margin-top:10px;font-size:14px;color:var(--syn-muted-foreground)}
.syn-srv-help p{margin:0}
.syn-srv-protos{display:flex;flex-wrap:wrap;gap:6px}
.syn-srv-proto{border:1px solid var(--syn-border);border-radius:6px;background:transparent;color:var(--syn-muted-foreground);padding:2px 10px;font:400 13px/1.5 Geist,system-ui,sans-serif;cursor:pointer}
.syn-srv-proto:hover{background:var(--syn-muted)}
.syn-srv-proto[aria-checked=true]{border-color:var(--syn-primary);background:var(--syn-accent);color:var(--syn-accent-foreground);font-weight:500}
.syn-srv-models{display:flex;flex-direction:column;gap:6px}
.syn-srv-model{display:flex;align-items:center;gap:12px;width:100%;border:1px solid var(--syn-border);border-radius:10px;background:var(--syn-background);color:var(--syn-foreground);padding:9px 12px;text-align:left;font:inherit;cursor:pointer}
.syn-srv-model:hover{background:var(--syn-muted)}
.syn-srv-model[aria-checked=true]{border-color:var(--syn-primary);background:var(--syn-accent)}
.syn-srv-ring{display:grid;place-items:center;flex-shrink:0;width:16px;height:16px;border:1.5px solid var(--syn-input);border-radius:999px}
.syn-srv-model[aria-checked=true] .syn-srv-ring{border-color:var(--syn-primary)}
.syn-srv-model[aria-checked=true] .syn-srv-ring::after{content:"";width:8px;height:8px;border-radius:999px;background:var(--syn-primary)}
.syn-srv-id{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 13.5px/1.3 "Geist Mono",ui-monospace,monospace}
.syn-srv-hint{margin-left:auto;flex-shrink:0;font-size:12px;color:var(--syn-muted-foreground)}
.syn-srv-foot{margin:0;font-size:13px;color:var(--syn-muted-foreground)}
.syn-srv-seg{display:inline-flex;overflow:hidden;border:1px solid var(--syn-input);border-radius:8px}
.syn-srv-seg button{border:0;background:var(--syn-card);color:var(--syn-foreground);padding:6px 12px;font:400 13px/1.3 Geist,system-ui,sans-serif;cursor:pointer}
.syn-srv-seg button+button{border-left:1px solid var(--syn-input)}
.syn-srv-seg button:hover{background:var(--syn-muted)}
.syn-srv-seg button[aria-pressed=true]{background:var(--syn-primary);color:var(--syn-primary-foreground);font-weight:600}
`;

// Le message de refus du HTTP vient de packages/provider-validation (en
// français dans le code, hors messages.po).
const SYN_SRV_HTTPS = "Utilisez HTTPS : le HTTP n'est accepté que sur cette machine ou un réseau privé.";
const SYN_SRV_OPENAI_PH = "http://localhost:8000/v1";
const SYN_SRV_NEMO_PH = "http://localhost:9000";
const SYN_SRV_STT_MODELS = ["mistralai/Voxtral-Mini-4B-Realtime-2602", "Systran/faster-whisper-large-v3"];
// stt/model-selection.ts, NEMO_SPEECH_DEFAULT_MODEL.
const SYN_SRV_NEMO_MODELS = ["nemotron-3.5-asr-streaming-0.6b"];
const SYN_SRV_LLM_MODELS = { 11434: ["qwen3:14b", "mistral-small3.2:24b", "gemma3:12b"], 1234: ["qwen/qwen3-14b", "google/gemma-3-12b"] };

const synSrvParse = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

// Hôtes privés acceptés en HTTP (provider-validation).
const synSrvPrivate = (host) => {
  const h = host.replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "::1" || /\.local$/.test(h) || /\.ts\.net$/.test(h)) return true;
  const m = h.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
};

const synSrvHost = (value) => {
  const url = synSrvParse(value);
  return url ? `${url.host}${url.pathname === "/" ? "" : url.pathname}` : value;
};

// Réponse simulée du serveur : ports usuels de la page ai-setup.
const synSrvProbe = (kind, value) => {
  const url = synSrvParse(value);
  const port = url ? url.port || (url.protocol === "https:" ? "443" : "80") : "";
  if (kind === "stt") {
    if (port === "9000") return { ok: true, protocol: "nvidia", latency: 24, models: [] };
    if (["8000", "443"].includes(port)) return { ok: true, protocol: "openai", latency: 38, models: SYN_SRV_STT_MODELS };
  } else {
    if (SYN_SRV_LLM_MODELS[port]) return { ok: true, latency: 41, models: SYN_SRV_LLM_MODELS[port] };
    if (["8000", "8080", "30000", "443"].includes(port)) return { ok: true, latency: 41, models: ["Qwen/Qwen3-14B-AWQ"] };
  }
  return { ok: false };
};

/**
 * Adresse, clé et connexion d'un serveur. `initial` : { url, result } ; la
 * saisie est enregistrée après une courte pause, puis testée (comme
 * useServerConnection, requête lancée dès qu'une adresse existe).
 */
const useSynServer = (kind, initial, placeholder) => {
  const [draft, setDraft] = useState(initial.url);
  const [saved, setSaved] = useState(initial.url);
  const [key, setKey] = useState("");
  const [urlError, setUrlError] = useState(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(initial.result);
  const timers = useRef({});
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);
  const test = (value = saved) => {
    if (!value) return;
    clearTimeout(timers.current.test);
    setTesting(true);
    timers.current.test = setTimeout(() => {
      setTesting(false);
      setResult(synSrvProbe(kind, value));
    }, 700);
  };
  const save = (value) => {
    const next = value.trim();
    if (next) {
      const url = synSrvParse(next);
      if (!url || !["http:", "https:"].includes(url.protocol) || !url.hostname) {
        setUrlError(LF("Enter a full address, for example {placeholder}.", { placeholder }));
        return;
      }
      if (url.protocol === "http:" && !synSrvPrivate(url.hostname)) {
        setUrlError(SYN_SRV_HTTPS);
        return;
      }
    }
    setUrlError(null);
    if (next === saved) return;
    setSaved(next);
    setResult(null);
    if (next) {
      test(next);
    } else {
      clearTimeout(timers.current.test);
      setTesting(false);
    }
  };
  const onDraft = (value) => {
    setDraft(value);
    clearTimeout(timers.current.save);
    timers.current.save = setTimeout(() => save(value), 500);
  };
  const reset = () => {
    Object.values(timers.current).forEach(clearTimeout);
    setDraft("");
    setSaved("");
    setKey("");
    setUrlError(null);
    setTesting(false);
    setResult(null);
  };
  const state = !saved ? "unconfigured" : testing ? "testing" : !result ? "untested" : result.ok ? "connected" : "failed";
  return { draft, saved, key, setKey, urlError, result, state, onDraft, test: () => test(), reset, setSaved, setDraft, setResult };
};

const SynSrvChip = ({ server, connectedLabel }) => {
  const { state, result } = server;
  const chip = (tone, label, busy) => (
    <span role="status" className="syn-srv-chip" data-tone={tone}>
      {busy ? h(SynIcon, { name: I("CircleNotch"), size: 14, style: { animation: "syn-srv-spin 1s linear infinite" } }) : <i aria-hidden="true" />}
      {label}
    </span>
  );
  if (state === "unconfigured") return chip("wait", L("No server yet"));
  if (state === "untested") return chip("wait", L("Not tested"));
  if (state === "testing") return chip("wait", L("Testing…"), true);
  if (state === "connected") return chip("good", connectedLabel ?? LF("Connected · {0} ms", { 0: result.latency }));
  return chip("bad", L("Unreachable"));
};

const SynSrvAddress = ({ server, label }) => {
  const id = useId();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <div className="syn-srv-field">
        <label className="syn-srv-label" htmlFor={`${id}-url`}>{label}</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id={`${id}-url`}
            className="syn-srv-input"
            value={server.draft}
            placeholder={server.placeholder}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={Boolean(server.urlError)}
            onChange={(e) => server.onDraft(e.target.value)}
          />
          <button type="button" className="syn-ui-btn" style={{ flexShrink: 0 }} disabled={server.state === "testing" || !server.saved} onClick={server.test}>
            {server.state === "testing" ? h(SynIcon, { name: I("CircleNotch"), size: 14, style: { animation: "syn-srv-spin 1s linear infinite" } }) : null}
            {L("Test connection")}
          </button>
        </div>
        {server.urlError ? <p role="alert" className="syn-srv-error">{server.urlError}</p> : null}
      </div>
      <details>
        <summary>{L("Advanced")}</summary>
        <div className="syn-srv-more">
          <div className="syn-srv-field">
            <label className="syn-srv-label" htmlFor={`${id}-key`}>{L("API key (optional)")}</label>
            <input
              id={`${id}-key`}
              type="password"
              className="syn-srv-input"
              value={server.key}
              placeholder={L("Leave empty if the server has no authentication")}
              autoComplete="off"
              onChange={(e) => server.setKey(e.target.value)}
            />
          </div>
          {server.saved || server.key ? (
            confirm ? (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 14 }}>
                <span>{L("Forget this server's address and key?")}</span>
                <button type="button" className="syn-ui-btn" style={{ color: "var(--syn-alert-foreground)" }} onClick={() => { server.reset(); setConfirm(false); }}>{L("Reset")}</button>
                <button type="button" className="syn-ui-btn" data-variant="ghost" onClick={() => setConfirm(false)}>{L("Cancel")}</button>
              </div>
            ) : (
              <button type="button" className="syn-ui-btn" data-variant="ghost" style={{ alignSelf: "flex-start", paddingLeft: 0, color: "var(--syn-alert-foreground)", background: "transparent" }} onClick={() => setConfirm(true)}>
                {L("Reset this server…")}
              </button>
            )
          ) : null}
        </div>
      </details>
    </>
  );
};

// ServerFailureBanner, cas « unreachable » (le seul que simule la doc).
const SynSrvBanner = ({ server }) =>
  server.state === "failed" ? (
    <div role="alert" className="syn-srv-banner">
      {LF("The server did not answer at {host}. Check that it is running and that you are on the right network (VPN, Tailscale), then test again.", { host: synSrvHost(server.saved) })}
    </div>
  ) : null;

/** ModelRadioList : un clic choisit, « Saisir un autre nom » ouvre un champ libre. */
const SynSrvModels = ({ models, value, onChange, footer }) => {
  const labelId = useId();
  const known = models.some((m) => m.id === value);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState(known ? "" : value);
  const showCustom = custom || (Boolean(value) && !known) || models.length === 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span id={labelId} className="syn-srv-label">{L("Model")}</span>
      {models.length ? (
        <div role="radiogroup" aria-labelledby={labelId} className="syn-srv-models">
          {models.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={m.id === value}
              className="syn-srv-model"
              onClick={() => {
                setCustom(false);
                setDraft("");
                onChange(m.id);
              }}
            >
              <span aria-hidden="true" className="syn-srv-ring" />
              <span className="syn-srv-id">{m.id}</span>
              {m.hint ? <span className="syn-srv-hint">{m.hint}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {showCustom ? (
        <input
          aria-label={L("Model name")}
          className="syn-srv-input"
          value={draft}
          placeholder={L("Model name served by your server")}
          onChange={(e) => {
            setCustom(true);
            setDraft(e.target.value);
            onChange(e.target.value.trim());
          }}
        />
      ) : null}
      <p className="syn-srv-foot">
        {footer}
        {!showCustom ? (
          <>
            {footer ? " " : null}
            <button type="button" className="syn-link" style={{ padding: 0 }} onClick={() => setCustom(true)}>{L("Enter another name")}</button>
          </>
        ) : null}
      </p>
    </div>
  );
};

const SynSrvHelp = ({ lines }) => (
  <details>
    <summary>{L("Help")}</summary>
    <div className="syn-srv-help">
      {lines.map((line) => <p key={line}>{line}</p>)}
    </div>
  </details>
);

const SynSrvBlock = ({ on, children }) => h(SynHere, { active: on }, children);

// Données d'exemple : vLLM avec Voxtral Realtime sur le protocole OpenAI ;
// aucune adresse pour NeMo-Speech.cpp (chaque protocole garde la sienne).
const SynSectionTranscription = ({ focus }) => {
  const [protocol, setProtocol] = useState("openai");
  const openai = useSynServer("stt", { url: "http://localhost:8000/v1", result: { ok: true, protocol: "openai", latency: 38, models: SYN_SRV_STT_MODELS } }, SYN_SRV_OPENAI_PH);
  const nvidia = useSynServer("stt", { url: "", result: null }, SYN_SRV_NEMO_PH);
  const [chosen, setChosen] = useState({ openai: SYN_SRV_STT_MODELS[0], nvidia: SYN_SRV_NEMO_MODELS[0] });
  const server = { ...(protocol === "nvidia" ? nvidia : openai), placeholder: protocol === "nvidia" ? SYN_SRV_NEMO_PH : SYN_SRV_OPENAI_PH };
  const protocols = {
    openai: { label: L("OpenAI compatible (realtime and batch)"), hint: L("vLLM, speaches, faster-whisper-server") },
    nvidia: { label: L("NVIDIA NeMo-Speech.cpp"), hint: L("Nemotron") },
  };
  const connected = server.state === "connected";
  const detected = connected ? server.result.protocol : null;
  const models =
    protocol === "nvidia"
      ? SYN_SRV_NEMO_MODELS.map((id) => ({ id }))
      : connected
        ? server.result.models.map((id) => ({ id }))
        : [];
  const model = chosen[protocol] || (protocol === "openai" && connected && detected === "openai" ? server.result.models[0] : "");
  // « Utiliser ce protocole » recopie l'adresse vers le protocole détecté.
  const adopt = () => {
    const target = detected === "nvidia" ? nvidia : openai;
    target.setDraft(server.saved);
    target.setSaved(server.saved);
    target.setResult(server.result);
    setProtocol(detected);
  };
  const labelId = useId();
  return (
    <div className="syn-srv-root" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {h(SynSettingsTitle, { title: L("Transcription"), lede: L("The server that turns speech into text during your meetings. Audio is never written to disk.") })}
      {h(
        SynSrvBlock,
        { on: focus === "server" },
        <section className="syn-srv-card" aria-label={L("My server")}>
          <div className="syn-srv-head">
            <h3>{L("My server")}</h3>
            {h(SynSrvChip, { server })}
          </div>
          {h(SynSrvBanner, { server })}
          {h(SynSrvAddress, { key: protocol, server, label: L("Server address") })}
          {h(
            SynSrvBlock,
            { on: focus === "protocol" },
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span id={labelId} className="syn-srv-label">
                {L("Protocol")}
                {detected === protocol ? <span style={{ color: "var(--syn-accent-foreground)" }}> · {L("detected automatically")}</span> : null}
              </span>
              <div role="radiogroup" aria-labelledby={labelId} className="syn-srv-protos">
                {["openai", "nvidia"].map((id) => (
                  <button key={id} type="button" role="radio" aria-checked={id === protocol} title={protocols[id].hint} className="syn-srv-proto" onClick={() => setProtocol(id)}>
                    {protocols[id].label}
                  </button>
                ))}
              </div>
              {detected && detected !== protocol ? (
                <p className="syn-srv-foot">
                  {LF("This server answers as {detectedLabel}.", { detectedLabel: protocols[detected].label })}{" "}
                  <button type="button" className="syn-link" style={{ padding: 0 }} onClick={adopt}>{L("Use this protocol")}</button>
                </p>
              ) : null}
            </div>,
          )}
          {server.saved
            ? h(
                SynSrvBlock,
                { on: focus === "model" },
                h(SynSrvModels, {
                  key: `${protocol}-${models.length}`,
                  models,
                  value: model,
                  onChange: (next) => setChosen((c) => ({ ...c, [protocol]: next })),
                  footer:
                    protocol === "nvidia"
                      ? L("The server transcribes with the model it loaded, whatever the model chosen here.")
                      : connected
                        ? undefined
                        : L("Test the connection to list the models served."),
                }),
              )
            : null}
          {h(SynSrvHelp, {
            lines: [
              L("OpenAI: a server that speaks the OpenAI speech protocol (vLLM, speaches, faster-whisper-server), for example http://localhost:8000/v1. Live transcription uses /v1/realtime, imported files /v1/audio/transcriptions."),
              L("NVIDIA NeMo-Speech.cpp: your nemo-speech serve server, for example http://localhost:9000. Live transcription and imported files use its realtime WebSocket. NVIDIA's hosted gRPC endpoint is not supported."),
              L("The API key is optional for servers without authentication. It is kept in your system keychain."),
            ],
          })}
        </section>,
      )}
    </div>
  );
};

// Données d'exemple : Ollama sur ce poste.
const SynSectionIntelligence = ({ focus }) => {
  const server = { ...useSynServer("llm", { url: "http://localhost:11434/v1", result: { ok: true, latency: 41, models: SYN_SRV_LLM_MODELS[11434] } }, SYN_SRV_OPENAI_PH), placeholder: SYN_SRV_OPENAI_PH };
  const [chosen, setChosen] = useState(SYN_SRV_LLM_MODELS[11434][0]);
  const [effort, setEffort] = useState("default");
  const connected = server.state === "connected";
  const models = connected ? server.result.models : [];
  const efforts = [["default", L("Auto")], ["low", L("Low")], ["medium", L("Medium")], ["high", L("High")]];
  return (
    <div className="syn-srv-root" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {h(SynSettingsTitle, { title: L("Synthesis"), lede: L("The language model that writes your meeting notes and answers when you ask a note a question.") })}
      {h(
        SynSrvBlock,
        { on: focus === "server" || focus === "model" },
        <section className="syn-srv-card" aria-label={L("My server")}>
          <div className="syn-srv-head">
            <h3>{L("My server")}</h3>
            {h(SynSrvChip, { server, connectedLabel: connected && models.length ? LF("Connected · {0} models available", { 0: models.length }) : undefined })}
          </div>
          {h(SynSrvBanner, { server })}
          {h(SynSrvAddress, { server, label: L("Server address (OpenAI-compatible: vLLM, Ollama, llama.cpp, LM Studio)") })}
          {server.saved
            ? h(SynSrvModels, {
                key: models.join(),
                models: models.map((id) => ({ id })),
                value: models.includes(chosen) || !connected ? chosen : models[0] ?? "",
                onChange: (next) => {
                  setChosen(next);
                  // L'effort dépend du modèle : il revient à « Auto ».
                  setEffort("default");
                },
                footer: connected ? undefined : L("Test the connection to list the models served."),
              })
            : null}
          {h(SynSrvHelp, {
            lines: [L("Only on-premise OpenAI-compatible servers are supported (vLLM, Ollama, llama.cpp server, LM Studio…). The address usually ends with /v1, for example http://localhost:8000/v1.")],
          })}
        </section>,
      )}
      {h(
        SynSrvBlock,
        { on: focus === "effort" },
        <div className="syn-rows" style={{ borderTop: 0 }}>
          {h(SynRow, {
            title: L("Reasoning effort"),
            description: L("More effort gives finer summaries, but slower. Auto leaves it to the server."),
            children: () => (
              <div role="group" aria-label={L("Reasoning effort")} className="syn-srv-seg">
                {efforts.map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={effort === value} onClick={() => setEffort(value)}>{label}</button>
                ))}
              </div>
            ),
          })}
        </div>,
      )}
    </div>
  );
};
