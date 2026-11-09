// Fichier généré par scripts/sync-docs-ui.mjs depuis scripts/docs-ui/app.jsx.tpl : ne pas modifier.
// Reproductions interactives de Syntheo pour la documentation Mintlify.
// Modèle de docs/snippets/app.gen.jsx : les blocs @TOKENS, @LABELS, @ICONS et
// @VERSION sont remplis par scripts/sync-docs-ui.mjs depuis les sources de
// l'app (tokens.css, messages.po, Hugeicons). Libellés : L(msgid anglais de messages.po).
// Mintlify fournit useState, useEffect et useRef sans import ; un snippet ne
// peut importer ni un autre snippet ni du JSON, d'où un seul fichier.

const SYN_VERSION = "0.7.0";
const SYN_LIGHT = {
  "background": "hsl(50 43% 97%)",
  "foreground": "hsl(100 8% 15%)",
  "card": "hsl(48 100% 99%)",
  "muted": "hsl(53 22% 92%)",
  "muted-foreground": "hsl(95 6% 36%)",
  "accent": "hsl(105 25% 91%)",
  "accent-foreground": "hsl(146 39% 24%)",
  "border": "hsl(55 18% 87%)",
  "input": "hsl(55 14% 82%)",
  "primary": "hsl(142 36% 30%)",
  "primary-foreground": "hsl(50 43% 97%)",
  "recording": "hsl(357 54% 51%)",
  "seal": "hsl(357 54% 51%)",
  "user-ink": "hsl(142 36% 30%)",
  "alert": "hsl(7 68% 95%)",
  "alert-foreground": "hsl(357 53% 42%)",
  "alert-border": "hsl(4 58% 86%)",
  "shadow-capsule": "0 8px 28px rgba(38, 42, 36, 0.18)"
};
const SYN_DARK = {
  "background": "hsl(105 7% 11%)",
  "foreground": "hsl(46 25% 90%)",
  "card": "hsl(103 10% 14%)",
  "muted": "hsl(105 9% 18%)",
  "muted-foreground": "hsl(86 8% 65%)",
  "accent": "hsl(141 22% 18%)",
  "accent-foreground": "hsl(140 36% 72%)",
  "border": "hsl(105 7% 21%)",
  "input": "hsl(102 8% 25%)",
  "primary": "hsl(142 34% 62%)",
  "primary-foreground": "hsl(143 32% 11%)",
  "recording": "hsl(4 72% 64%)",
  "seal": "hsl(4 72% 64%)",
  "user-ink": "hsl(142 34% 62%)",
  "alert": "hsl(358 35% 17%)",
  "alert-foreground": "hsl(4 77% 75%)",
  "alert-border": "hsl(359 36% 26%)",
  "shadow-capsule": "0 8px 28px rgba(0, 0, 0, 0.5)"
};
const SYN_LABELS = {
  "Ask the note": "Demander à la note",
  "Begin listening": "Commencer l'écoute",
  "Cancel": "Annuler",
  "Computer audio": "Son de l'ordinateur",
  "Copy": "Copier",
  "Export": "Exporter",
  "Finish": "Terminer",
  "Folder": "Dossier",
  "Listen": "Écouter",
  "Listening": "Écoute",
  "Listening time": "Durée d'écoute",
  "Mic": "Micro",
  "Mute system audio": "Couper le son système",
  "Mute the microphone": "Couper le micro",
  "Note capsule": "Capsule de la note",
  "Note steps": "Étapes de la note",
  "Participants": "Participants",
  "Pause listening": "Mettre en pause l'écoute",
  "Paused": "En pause",
  "Prepare": "Préparer",
  "Put on pause": "Mettre en pause",
  "Resume listening": "Reprendre l'écoute",
  "Shift": "Maj",
  "Synthesis": "Synthèse",
  "The microphone and system audio are muted: nothing is being transcribed.": "Le micro et le son système sont coupés : plus rien n'est transcrit.",
  "Transcription": "Transcription",
  "Type": "Type",
  "Unmute system audio": "Rétablir le son système",
  "Unmute the microphone": "Rétablir le micro",
  "Write freely, Syntheo will complete it.": "Écrivez librement, Syntheo complétera."
};
const SYN_ICONS = {
  "Microphone": "<path d=\"M7 6.5C7 4.01472 9.01472 2 11.5 2C13.9853 2 16 4.01472 16 6.5V11.5C16 13.9853 13.9853 16 11.5 16C9.01472 16 7 13.9853 7 11.5V6.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M11.5 19H11.0828C7.57267 19 4.57706 16.4623 4 13M11.5 19H11.9172C15.4273 19 18.4229 16.4623 19 13M11.5 19V22\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "MicrophoneSlash": "<path d=\"M8.1572 4.1572C8.94761 2.86349 10.373 2 12 2C14.4853 2 16.5 4.01472 16.5 6.5V11.5C16.5 11.8111 16.4684 12.1149 16.4083 12.4083M7.5 7.5V11.5C7.5 13.9853 9.51472 16 12 16C13.1154 16 14.136 15.5942 14.9222 14.9222\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M2 2L22 22\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12 19H11.5828C8.07267 19 5.07706 16.4623 4.5 13M12 19H12.4172C14.2325 19 15.9102 18.3213 17.1869 17.1869M12 19V22M19.5 13C19.3878 13.6733 19.1841 14.3116 18.903 14.903\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "SpeakerHigh": "<path d=\"M14 14.8135V9.18646C14 6.04126 14 4.46866 13.0747 4.0773C12.1494 3.68593 11.0603 4.79793 8.88232 7.02192C7.75439 8.17365 7.11085 8.42869 5.50604 8.42869C4.10257 8.42869 3.40084 8.42869 2.89675 8.77262C1.85035 9.48655 2.00852 10.882 2.00852 12C2.00852 13.118 1.85035 14.5134 2.89675 15.2274C3.40084 15.5713 4.10257 15.5713 5.50604 15.5713C7.11085 15.5713 7.75439 15.8264 8.88232 16.9781C11.0603 19.2021 12.1494 20.3141 13.0747 19.9227C14 19.5313 14 17.9587 14 14.8135Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M17 9C17.6254 9.81968 18 10.8634 18 12C18 13.1366 17.6254 14.1803 17 15\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M20 7C21.2508 8.36613 22 10.1057 22 12C22 13.8943 21.2508 15.6339 20 17\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "SpeakerX": "<path d=\"M14 14.8135V9.18646C14 6.04126 14 4.46866 13.0747 4.0773C12.1494 3.68593 11.0603 4.79793 8.88232 7.02192C7.75439 8.17365 7.11085 8.42869 5.50604 8.42869C4.10257 8.42869 3.40084 8.42869 2.89675 8.77262C1.85035 9.48655 2.00852 10.882 2.00852 12C2.00852 13.118 1.85035 14.5134 2.89675 15.2274C3.40084 15.5713 4.10257 15.5713 5.50604 15.5713C7.11085 15.5713 7.75439 15.8264 8.88232 16.9781C11.0603 19.2021 12.1494 20.3141 13.0747 19.9227C14 19.5313 14 17.9587 14 14.8135Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M18 10L22 14M18 14L22 10\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/>",
  "Pause": "<path d=\"M4 7C4 5.58579 4 4.87868 4.43934 4.43934C4.87868 4 5.58579 4 7 4C8.41421 4 9.12132 4 9.56066 4.43934C10 4.87868 10 5.58579 10 7V17C10 18.4142 10 19.1213 9.56066 19.5607C9.12132 20 8.41421 20 7 20C5.58579 20 4.87868 20 4.43934 19.5607C4 19.1213 4 18.4142 4 17V7Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M14 7C14 5.58579 14 4.87868 14.4393 4.43934C14.8787 4 15.5858 4 17 4C18.4142 4 19.1213 4 19.5607 4.43934C20 4.87868 20 5.58579 20 7V17C20 18.4142 20 19.1213 19.5607 19.5607C19.1213 20 18.4142 20 17 20C15.5858 20 14.8787 20 14.4393 19.5607C14 19.1213 14 18.4142 14 17V7Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/>",
  "Play": "<path d=\"M18.8906 12.846C18.5371 14.189 16.8667 15.138 13.5257 17.0361C10.296 18.8709 8.6812 19.7884 7.37983 19.4196C6.8418 19.2671 6.35159 18.9776 5.95624 18.5787C5 17.6139 5 15.7426 5 12C5 8.2574 5 6.3861 5.95624 5.42132C6.35159 5.02245 6.8418 4.73288 7.37983 4.58042C8.6812 4.21165 10.296 5.12907 13.5257 6.96393C16.8667 8.86197 18.5371 9.811 18.8906 11.154C19.0365 11.7084 19.0365 12.2916 18.8906 12.846Z\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>",
  "Location": "<path d=\"M13.6177 21.367C13.1841 21.773 12.6044 22 12.0011 22C11.3978 22 10.8182 21.773 10.3845 21.367C6.41302 17.626 1.09076 13.4469 3.68627 7.37966C5.08963 4.09916 8.45834 2 12.0011 2C15.5439 2 18.9126 4.09916 20.316 7.37966C22.9082 13.4393 17.599 17.6389 13.6177 21.367Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M15.5 11C15.5 12.933 13.933 14.5 12 14.5C10.067 14.5 8.5 12.933 8.5 11C8.5 9.067 10.067 7.5 12 7.5C13.933 7.5 15.5 9.067 15.5 11Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/>"
};

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
