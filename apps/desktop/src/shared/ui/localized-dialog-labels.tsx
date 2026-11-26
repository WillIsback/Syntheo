import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { EditorErrorTextsProvider } from "@syntheo/editor/error-boundary";
import { DialogCloseLabelProvider } from "@syntheo/ui/components/ui/dialog";

// `@syntheo/ui` et `@syntheo/editor` n'ont pas d'i18n : l'app fournit aux
// dialogues le libellé traduit de leur bouton de fermeture (issue 560), et à
// l'écran de secours de l'éditeur ses deux textes (issue 636).
export function LocalizedDialogLabels({ children }: { children: ReactNode }) {
  const { t } = useLingui();
  return (
    <DialogCloseLabelProvider value={t`Close`}>
      <EditorErrorTextsProvider
        value={{
          failed: t`The editor failed to render. Your recording is still running.`,
          reload: t`Reload editor`,
        }}
      >
        {children}
      </EditorErrorTextsProvider>
    </DialogCloseLabelProvider>
  );
}
