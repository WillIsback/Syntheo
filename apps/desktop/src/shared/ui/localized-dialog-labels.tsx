import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useStore } from "zustand";

import { EditorErrorTextsProvider } from "@syntheo/editor/error-boundary";
import { DialogCloseLabelProvider } from "@syntheo/ui/components/ui/dialog";

import { listenerStore } from "~/store/zustand/listener/instance";

// `@syntheo/ui` et `@syntheo/editor` n'ont pas d'i18n : l'app fournit aux
// dialogues le libellé traduit de leur bouton de fermeture (issue 560), et à
// l'écran de secours de l'éditeur ses deux textes (issue 636).
export function LocalizedDialogLabels({ children }: { children: ReactNode }) {
  const { t } = useLingui();
  // La phrase sur l'enregistrement n'a de sens que pendant une écoute
  // (issue 766) : une note corrompue s'ouvre aussi hors de toute écoute.
  const listening = useStore(
    listenerStore,
    (state) => state.live.status === "active",
  );
  return (
    <DialogCloseLabelProvider value={t`Close`}>
      <EditorErrorTextsProvider
        value={{
          failed: listening
            ? t`The editor failed to render. Your recording is still running.`
            : t`The editor failed to render. Reload it to try again.`,
          reload: t`Reload editor`,
        }}
      >
        {children}
      </EditorErrorTextsProvider>
    </DialogCloseLabelProvider>
  );
}
