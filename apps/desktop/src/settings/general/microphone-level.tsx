import { useLingui } from "@lingui/react/macro";
import { Channel } from "@tauri-apps/api/core";
import {
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { commands as listenerCommands } from "@syntheo/plugin-transcription";

import { useListener } from "~/stt/contexts";

// Niveau du micro choisi (issue 419) ou de la sortie capturée comme son
// système (issue 450), à côté de leur sélecteur. Hors écoute, le mètre natif
// du plugin de transcription ouvre le périphérique et ne renvoie qu'un niveau
// entre 0 et 1 : aucun échantillon ne quitte Rust, rien n'est enregistré. Il
// ne tourne que si la ligne est à l'écran et la fenêtre visible, et s'arrête
// au démontage. Pendant une écoute, le périphérique appartient à la capture :
// on affiche son niveau à elle, sans le rouvrir.

type LevelKind = "microphone" | "speaker";

async function startMonitor(
  kind: LevelKind,
  owner: string,
  device: string | null,
  levels: Channel<number | null>,
) {
  if (kind === "microphone") {
    return await listenerCommands.startMicrophoneLevelMonitor(
      owner,
      device,
      levels,
    );
  }
  return await listenerCommands.startSpeakerLevelMonitor(owner, device, levels);
}

async function stopMonitor(kind: LevelKind, owner: string) {
  if (kind === "microphone") {
    return await listenerCommands.stopMicrophoneLevelMonitor(owner);
  }
  return await listenerCommands.stopSpeakerLevelMonitor(owner);
}

let nextOwner = 0;

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function useDocumentVisible() {
  return useSyncExternalStore(
    subscribeToVisibility,
    () => document.visibilityState !== "hidden",
    () => true,
  );
}

function useOnScreen(ref: RefObject<HTMLElement | null>) {
  const [onScreen, setOnScreen] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setOnScreen(entry?.isIntersecting ?? false);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return onScreen;
}

type MonitorState = { level: number; unavailable: boolean };

const IDLE: MonitorState = { level: 0, unavailable: false };

function useLevelMonitor(
  kind: LevelKind,
  device: string,
  enabled: boolean,
): MonitorState {
  const [state, setState] = useState<MonitorState>(IDLE);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    nextOwner += 1;
    const owner = `settings-${kind}-level-${nextOwner}`;
    let stopped = false;
    const levels = new Channel<number | null>();
    levels.onmessage = (level) => {
      if (!stopped) {
        setState({
          level: Math.max(0, Math.min(1, level ?? 0)),
          unavailable: false,
        });
      }
    };

    const stop = () => {
      stopMonitor(kind, owner).catch((error) =>
        console.error(`[settings] ${kind} level stop failed`, error),
      );
    };

    startMonitor(kind, owner, device || null, levels)
      .then((result) => {
        if (stopped) {
          // La page est partie pendant l'ouverture : on referme le périphérique.
          stop();
          return;
        }
        if (result.status === "error") {
          setState({ level: 0, unavailable: true });
        }
      })
      .catch(() => {
        if (!stopped) {
          setState({ level: 0, unavailable: true });
        }
      });

    return () => {
      stopped = true;
      levels.onmessage = () => {};
      setState(IDLE);
      stop();
    };
  }, [kind, device, enabled]);

  return enabled ? state : IDLE;
}

export function MicrophoneLevelMeter({ device }: { device: string }) {
  const { t } = useLingui();
  return (
    <LevelMeter
      kind="microphone"
      device={device}
      label={t`Input level`}
      unavailableLabel={t`Input level unavailable`}
    />
  );
}

export function SpeakerLevelMeter({ device }: { device: string }) {
  const { t } = useLingui();
  return (
    <LevelMeter
      kind="speaker"
      device={device}
      label={t`Output level`}
      unavailableLabel={t`Output level unavailable`}
    />
  );
}

function LevelMeter({
  kind,
  device,
  label,
  unavailableLabel,
}: {
  kind: LevelKind;
  device: string;
  label: string;
  unavailableLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(ref);
  const documentVisible = useDocumentVisible();
  const capturing = useListener(
    (state) => state.live.loading || state.live.status !== "inactive",
  );
  const captureLevel = useListener((state) =>
    state.live.status === "active"
      ? state.live.amplitude[kind === "microphone" ? "mic" : "speaker"]
      : 0,
  );
  const monitor = useLevelMonitor(
    kind,
    device,
    onScreen && documentVisible && !capturing,
  );

  const level = capturing ? captureLevel : monitor.level;
  const percent = Math.round(level * 100);

  // Conteneur stable : l'observateur de visibilité garde la même cible.
  return (
    <div ref={ref} className="w-full">
      {!capturing && monitor.unavailable ? (
        <p className="text-muted-foreground text-xs">{unavailableLabel}</p>
      ) : (
        <div
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          data-level-kind={kind}
          className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
        >
          <div
            className="bg-primary h-full w-full origin-left rounded-full transition-transform duration-100 ease-out motion-reduce:transition-none"
            style={{ transform: `scaleX(${level})` }}
          />
        </div>
      )}
    </div>
  );
}
