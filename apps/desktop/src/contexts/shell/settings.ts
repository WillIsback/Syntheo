import { useCallback } from "react";

import { useTabs } from "~/store/zustand/tabs";

// Le raccourci Ctrl+, vit dans `useMainShortcuts` (table `shared/shortcuts.ts`),
// avec la correction AZERTY.
export function useSettings() {
  const openNew = useTabs((state) => state.openNew);

  const openSettings = useCallback(() => {
    openNew({ type: "settings" });
  }, [openNew]);

  return { openSettings };
}
