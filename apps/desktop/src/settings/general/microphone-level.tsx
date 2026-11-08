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

// Niveau d'entrée du micro choisi, à côté de son sélecteur (issue 419).
// Hors écoute, le mètre natif du plugin de transcription ouvre le micro et ne
// renvoie qu'un niveau entre 0 et 1 : aucun échantillon ne quitte Rust, rien
// n'est enregistré. Il ne tourne que si la ligne est à l'écran et la fenêtre
// visible, et s'arrête au démontage. Pendant une écoute, le micro appartient
// à la capture : on affiche son niveau à elle, sans rouvrir le périphérique.

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

export function useMicrophoneLevelMonitor(
  device: string,
  enabled: boolean,
): MonitorState {
  const [state, setState] = useState<MonitorState>(IDLE);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    nextOwner += 1;
    const owner = `settings-microphone-level-${nextOwner}`;
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
      listenerCommands
        .stopMicrophoneLevelMonitor(owner)
        .catch((error) =>
          console.error("[settings] microphone level stop failed", error),
        );
    };

    listenerCommands
      .startMicrophoneLevelMonitor(owner, device || null, levels)
      .then((result) => {
        if (stopped) {
          // La page est partie pendant l'ouverture du micro : on le referme.
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
  }, [device, enabled]);

  return enabled ? state : IDLE;
}

export function MicrophoneLevelMeter({ device }: { device: string }) {
  const { t } = useLingui();
  const ref = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(ref);
  const documentVisible = useDocumentVisible();
  const capturing = useListener(
    (state) => state.live.loading || state.live.status !== "inactive",
  );
  const captureLevel = useListener((state) =>
    state.live.status === "active" ? state.live.amplitude.mic : 0,
  );
  const monitor = useMicrophoneLevelMonitor(
    device,
    onScreen && documentVisible && !capturing,
  );

  const level = capturing ? captureLevel : monitor.level;
  const percent = Math.round(level * 100);

  // Conteneur stable : l'observateur de visibilité garde la même cible.
  return (
    <div ref={ref} className="w-full">
      {!capturing && monitor.unavailable ? (
        <p className="text-muted-foreground text-xs">
          {t`Input level unavailable`}
        </p>
      ) : (
        <div
          role="meter"
          aria-label={t`Input level`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          data-microphone-level
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
