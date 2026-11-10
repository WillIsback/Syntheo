import {
  applyChannelMuted,
  isMainWebviewWindow,
  type MutedChannel,
  requestMainListenerControl,
} from "./window-control";

import { listenerStore } from "~/store/zustand/listener/instance";

// Couper le micro ou le son système pendant l'écoute (issue 447). La fenêtre
// principale tient l'écoute : une fenêtre secondaire (note détachée) lui
// adresse la demande, comme pour la pause.
export type { MutedChannel } from "./window-control";

export function isChannelMuted(channel: MutedChannel) {
  const live = listenerStore.getState().live;
  return channel === "mic" ? live.muted : live.speakerMuted;
}

export function setChannelMuted(
  sessionId: string,
  channel: MutedChannel,
  muted: boolean,
) {
  if (!isMainWebviewWindow()) {
    void requestMainListenerControl(
      channel === "mic"
        ? muted
          ? "muteMic"
          : "unmuteMic"
        : muted
          ? "muteSpeaker"
          : "unmuteSpeaker",
      sessionId,
    );
    return;
  }

  applyChannelMuted(sessionId, channel, muted);
}

// Raccourcis Ctrl+Maj+M et Ctrl+Maj+S : bascule le canal de l'écoute en cours,
// sans effet hors écoute.
export function toggleLiveChannel(channel: MutedChannel) {
  const live = listenerStore.getState().live;
  if (!live.sessionId || live.status !== "active") {
    return false;
  }

  setChannelMuted(live.sessionId, channel, !isChannelMuted(channel));
  return true;
}
