import { t } from "@lingui/core/macro";

import {
  commands,
  type Notification,
  type NotificationLabels,
} from "@syntheo/plugin-notification";

/**
 * Libellés des notifications natives (Windows, Linux, macOS) que le Rust ou le
 * Swift recalculent pendant l'affichage (décompte d'un rappel de réunion,
 * bouton d'options, vue dépliée). Les gabarits gardent les repères `{minutes}` et `{time}`
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
    // Vue dépliée et menu d'options (issue 412) ; les intitulés de détail
    // gardent leurs deux-points, la valeur suit après une espace.
    showLess: t`Show less`,
    what: t`What:`,
    who: t`Who:`,
    location: t`Where:`,
    inviteeTimeZone: t`Invitee Time Zone:`,
    accept: t`Accept`,
    createNewNote: t`Create New Note...`,
  };
}

/**
 * Joint les libellés natifs, dans la langue active de l'interface au moment de
 * l'affichage, sauf si l'appelant en fournit déjà.
 */
export function withNativeNotificationLabels(
  notification: Notification,
): Notification {
  return {
    ...notification,
    labels: notification.labels ?? nativeNotificationLabels(),
  };
}

/**
 * Point d'entrée unique des notifications natives : sans libellés, le natif
 * retombe sur l'anglais quelle que soit la langue de l'interface.
 */
export function showNativeNotification(notification: Notification) {
  return commands.showNotification(withNativeNotificationLabels(notification));
}
