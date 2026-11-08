import { plural, t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { ComponentProps } from "react";

import type { AppToastLabels } from "@syntheo/ui/components/ui/app-toast";
import { Toaster } from "@syntheo/ui/components/ui/toast";

// `@syntheo/ui` n'a pas d'i18n : l'app lui fournit les textes du toast traduits.
export function buildAppToastLabels(): AppToastLabels {
  return {
    dismiss: t`Dismiss`,
    expandNotification: t`Expand notification`,
    collapseNotification: t`Collapse notification`,
    pauseAutoDismiss: t`Pause auto-dismiss`,
    resumeAutoDismiss: t`Resume auto-dismiss`,
    pause: t({ message: "Pause", context: "toast timer" }),
    resume: t`Resume`,
    closingIn: t`Closing in`,
    timerPaused: t`Timer paused`,
    seconds: (count) => plural(count, { one: "second", other: "seconds" }),
  };
}

export function LocalizedToaster(
  props: Omit<ComponentProps<typeof Toaster>, "labels">,
) {
  // Abonne le composant au changement de langue.
  useLingui();
  return <Toaster {...props} labels={buildAppToastLabels()} />;
}
