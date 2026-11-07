import { t } from "@lingui/core/macro";

import type { NotificationLabels } from "@syntheo/plugin-notification";

/**
 * Libellés des notifications natives (Windows, Linux, macOS) que le Rust ou le
 * Swift recalculent pendant l'affichage (décompte d'un rappel de réunion,
 * bouton d'options). Les gabarits gardent les repères `{minutes}` et `{time}`
 * que le natif remplace (issue 408).
 */
export function nativeNotificationLabels(): NotificationLabels {
  const minutes = "{minutes}";
  const time = "{time}";
  return {
    options: t`Options`,
    startingSoon: t`Starting soon`,
    started: t`Started`,
    startingInOne: t`Starting in 1 minute`,
    startingInOther: t`Starting in ${minutes} minutes`,
    beginsIn: t`Begins in ${time}`,
  };
}
