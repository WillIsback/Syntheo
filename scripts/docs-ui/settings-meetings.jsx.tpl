// Paramètres › Réunions : apps/desktop/src/settings/general/index.tsx
// (section « meetings »), meeting-settings.tsx et audio-settings.tsx.
// Plateforme montrée : Linux (lignes de chat de réunion, pas de capture
// d'écran partagé, ligne « Son système » présente).

const SYN_CSS_MEETINGS = `
.syn-level{display:flex;gap:2px;align-items:flex-end;height:14px;margin-top:6px}
.syn-level i{width:4px;border-radius:2px;background:var(--syn-primary)}
.syn-level i[data-off]{background:var(--syn-border)}
`;

const SynLevel = ({ bars }) => (
  <span className="syn-level" aria-hidden="true">
    {[6, 10, 14, 9, 5].map((h, i) => (
      <i key={i} style={{ height: h }} data-off={i >= bars ? "" : undefined} />
    ))}
  </span>
);

// Sorties d'exemple. La sortie choisie auparavant, « Écouteurs Bluetooth »,
// est débranchée : la liste l'affiche en tête tant qu'elle reste choisie.
const SYN_SPEAKER_GONE = "Écouteurs Bluetooth";
const SYN_SPEAKERS = ["Casque USB", "HDMI — Écran externe"];
const SYN_SPEAKER_DEFAULT = "Haut-parleurs intégrés";

const SynSectionMeetings = ({ focus }) => {
  const [mic, setMic] = useState("");
  const [speaker, setSpeaker] = useState(SYN_SPEAKER_GONE);
  const gone = speaker === SYN_SPEAKER_GONE;
  const captured = speaker && !gone ? speaker : SYN_SPEAKER_DEFAULT;
  return (
    <>
      {h(SynSettingsTitle, { title: L("Meetings") })}
      <div className="syn-rows" style={{ borderTop: 0 }}>
        {h(SynSwitchRow, { title: L("Stop when meeting ends"), description: L("Stop listening when your call ends."), initial: true })}
        {h(SynSwitchRow, { title: L("Post recording disclosure in meeting chat"), description: L("Tell participants when listening starts; this does not confirm consent.") })}
        {h(SynSwitchRow, { title: L("Capture meeting chat in the note"), description: L("Save visible chat from supported meetings using Accessibility.") })}
        {h(SynSwitchRow, { title: L("Remind participants about recording"), description: L("Show a reminder when a recording starts."), initial: true })}
        {h(SynSwitchRow, { title: L("Show floating bar"), description: L("Control listening without reopening Syntheo."), initial: true })}
      </div>
      {h(
        SynHere,
        { active: focus === "audio" },
        <h2 className="syn-h2">{L("Audio")}</h2>,
        <div className="syn-rows">
          {h(SynRow, {
            title: L("Microphone"),
            description: L("Choose the microphone that captures your voice."),
            wide: true,
            children: (labels) => (
              <>
                <select className="syn-select" value={mic} onChange={(e) => setMic(e.target.value)} aria-labelledby={labels["aria-labelledby"]} aria-describedby={labels["aria-describedby"]}>
                  <option value="">{L("Current default")}</option>
                  <option value="Micro du casque USB">Micro du casque USB</option>
                </select>
                {h(SynLevel, { bars: 3 })}
              </>
            ),
          })}
          {h(SynRow, {
            title: L("System sound"),
            description: L("Choose the output whose sound Syntheo transcribes: the one where you hear the other participants."),
            wide: true,
            children: (labels) => (
              <>
                <select className="syn-select" value={speaker} onChange={(e) => setSpeaker(e.target.value)} aria-labelledby={labels["aria-labelledby"]} aria-describedby={labels["aria-describedby"]}>
                  <option value="">{L("Current default output")}</option>
                  {gone ? (
                    <option value={SYN_SPEAKER_GONE}>
                      {SYN_SPEAKER_GONE} {L("(Unavailable — using the default output)")}
                    </option>
                  ) : null}
                  {SYN_SPEAKERS.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                {h(SynLevel, { bars: 2 })}
                <p className="syn-muted syn-small" role="status" style={{ margin: "6px 0 0" }}>
                  {L("Captured right now:")} <strong style={{ color: "var(--syn-foreground)", fontWeight: 500 }}>{captured}</strong>
                </p>
              </>
            ),
          })}
        </div>,
      )}
    </>
  );
};
