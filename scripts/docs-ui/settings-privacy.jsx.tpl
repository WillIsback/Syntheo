// Paramètres › Confidentialité : apps/desktop/src/settings/privacy/index.tsx
// (un seul réglage, « Verrouiller l'application », grisé quand le système
// n'offre pas d'authentification de l'appareil). focus : "lock".
// Paramètres › Autorisations : apps/desktop/src/settings/general/permissions.tsx,
// branche Linux et Windows (AudioPermissions runtimeCapabilities : la flèche
// relance un vrai test de la source, sans ouvrir les réglages du système).
// focus : "audio". L'« Emplacement d'export » (settings/general/storage/) est
// dans Profil, pas ici.

const SYN_CSS_PRIVACY = `
.syn-priv-demo{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0;border:1px dashed var(--syn-border);border-radius:10px;padding:8px 12px;font-size:12px;color:var(--syn-muted-foreground)}
.syn-priv-demo .syn-select{width:auto;min-height:28px;padding:2px 8px;font-size:12px}
.syn-perm-group h3{margin:0 0 12px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--syn-muted-foreground)}
.syn-perm-list{display:flex;flex-direction:column;gap:16px}
.syn-perm{display:flex;align-items:center;justify-content:space-between;gap:16px}
.syn-perm-title{display:flex;align-items:center;gap:8px;margin:0 0 4px;font-size:14px;font-weight:500}
.syn-perm[data-ok=false] .syn-perm-title{color:var(--syn-destructive)}
.syn-perm-desc{margin:0;font-size:12px;color:var(--syn-muted-foreground)}
.syn-perm-btn{display:grid;place-items:center;width:32px;height:32px;flex-shrink:0;border:0;border-radius:8px;background:var(--syn-primary);color:var(--syn-primary-foreground);cursor:pointer}
.syn-perm-btn[data-ok=true]{background:transparent;color:var(--syn-primary);cursor:default}
.syn-perm-btn:disabled:not([data-ok=true]){opacity:.6;cursor:default}
@keyframes syn-perm-spin{to{transform:rotate(360deg)}}
`;

/** Réglage propre à la doc : le système montré par la reproduction. */
const SynPrivDemo = ({ value, onChange }) => {
  const id = useId();
  return (
    <p className="syn-priv-demo">
      <label htmlFor={id}>Démo · système montré</label>
      <select id={id} className="syn-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="linux">Linux</option>
        <option value="windows">Windows</option>
      </select>
      <span>Linux n'offre pas d'authentification de l'appareil : le réglage y reste grisé.</span>
    </p>
  );
};

const SynSectionPrivacy = ({ focus }) => {
  const [os, setOs] = useState("linux");
  const [locked, setLocked] = useState(false);
  const available = os === "windows";
  const description = available
    ? L("Require Windows Hello face, PIN, or password when opening Syntheo.")
    : L("Device authentication is not available on this computer.");
  return (
    <>
      {h(SynSettingsTitle, { title: L("Privacy") })}
      {h(
        SynHere,
        { active: focus === "lock" },
        <div className="syn-rows" style={{ borderTop: 0 }}>
          {h(SynRow, {
            title: L("Lock app"),
            description,
            children: (labels) =>
              h(SynSwitch, {
                checked: locked && available,
                disabled: !available,
                onChange: setLocked,
                labelledBy: labels["aria-labelledby"],
                describedBy: labels["aria-describedby"],
              }),
          })}
        </div>,
      )}
      {h(SynPrivDemo, {
        value: os,
        onChange: (next) => {
          setOs(next);
          setLocked(false);
        },
      })}
    </>
  );
};

/** PermissionRow, variante runtimeCapability (Linux et Windows). */
const SynPermRow = ({ title, description, status, onRetry }) => {
  const ok = status === "authorized";
  const pending = status === "pending";
  const denied = status === "denied";
  return (
    <div className="syn-perm" data-ok={ok}>
      <div style={{ flex: 1 }}>
        <h4 className="syn-perm-title">
          {ok ? null : h(SynIcon, { name: I("WarningCircle") })}
          {title}
        </h4>
        <p className="syn-perm-desc">{description}</p>
      </div>
      <button
        type="button"
        className="syn-perm-btn"
        data-ok={ok}
        disabled={ok || pending}
        aria-label={denied ? `${L("Try again")}: ${title}` : title}
        onClick={onRetry}
      >
        {ok
          ? h(SynIcon, { name: I("Check") })
          : pending
            ? h(SynIcon, { name: I("CircleNotch"), style: { animation: "syn-perm-spin 1s linear infinite" } })
            : h(SynIcon, { name: I("ArrowRight"), size: 20 })}
      </button>
    </div>
  );
};

const SynSectionPermissions = ({ focus }) => {
  // Exemple : le test de l'audio système a échoué ; la flèche le relance.
  const [system, setSystem] = useState("denied");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const retry = () => {
    setSystem("pending");
    timer.current = setTimeout(() => setSystem("authorized"), 900);
  };
  return (
    <>
      {h(SynSettingsTitle, { title: L("Permissions") })}
      {h(
        SynHere,
        { active: focus === "audio" },
        <div className="syn-perm-group">
          <h3>{L("Audio")}</h3>
          <div className="syn-perm-list">
            {h(SynPermRow, { title: L("Microphone"), description: L("Record your voice in meetings and calls."), status: "authorized" })}
            {h(SynPermRow, { title: L("System audio"), description: L("Record other participants in meetings."), status: system, onRetry: retry })}
          </div>
        </div>,
      )}
    </>
  );
};
