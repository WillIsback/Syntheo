import { t } from "@lingui/core/macro";

import { toast } from "@syntheo/ui/components/ui/toast";

import type { GeneralState } from "./general-shared";

// Les deux canaux coupés (issue 447) : autorisé, mais plus rien n'est
// transcrit. Un message le dit et propose la pause (qui libère les
// périphériques) ou de rétablir le micro.
const MUTED_CHANNELS_NOTICE_DURATION_MS = 12_000;

export const mutedChannelsNoticeId = (sessionId: string) =>
  `muted-channels-${sessionId}`;

type MutedChannelsStore = Pick<GeneralState, "live"> & {
  pause: () => void;
  setMuted: (value: boolean) => void;
};

export function syncMutedChannelsNotice(store: MutedChannelsStore) {
  const { sessionId, status, muted, speakerMuted } = store.live;
  if (!sessionId) {
    return;
  }

  const id = mutedChannelsNoticeId(sessionId);
  if (status !== "active" || !muted || !speakerMuted) {
    toast.dismiss(id);
    return;
  }

  toast.warning(
    t`The microphone and system audio are muted: nothing is being transcribed.`,
    {
      id,
      duration: MUTED_CHANNELS_NOTICE_DURATION_MS,
      action: { label: t`Put on pause`, onClick: () => store.pause() },
      secondaryAction: {
        label: t`Unmute the microphone`,
        onClick: () => store.setMuted(false),
      },
    },
  );
}
