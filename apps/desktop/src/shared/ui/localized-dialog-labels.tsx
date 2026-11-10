import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { DialogCloseLabelProvider } from "@syntheo/ui/components/ui/dialog";

// `@syntheo/ui` n'a pas d'i18n : l'app fournit aux dialogues le libellé
// traduit de leur bouton de fermeture (issue 560).
export function LocalizedDialogLabels({ children }: { children: ReactNode }) {
  const { t } = useLingui();
  return (
    <DialogCloseLabelProvider value={t`Close`}>
      {children}
    </DialogCloseLabelProvider>
  );
}
