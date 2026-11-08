import { useLingui } from "@lingui/react";

import { commands as trayCommands } from "@syntheo/plugin-tray";
import { getCurrentWebviewWindowLabel } from "@syntheo/plugin-windows";
import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

// Les menus natifs (zone de notification, barre de menus macOS, boîtes de
// dialogue) sont construits côté Rust : on leur envoie la langue d'affichage
// résolue par Lingui, et ils sont reconstruits à chaque changement.
export function NativeMenuLocaleSync() {
  const { i18n } = useLingui();

  return <NativeMenuLocalePublisher key={i18n.locale} locale={i18n.locale} />;
}

function NativeMenuLocalePublisher({ locale }: { locale: string }) {
  useMountEffect(() => {
    if (getCurrentWebviewWindowLabel() !== "main") {
      return;
    }

    void trayCommands
      .setNativeMenuLocale(locale)
      .then((result) => {
        if (result.status === "error") {
          console.error(
            "[tray] failed to set native menu locale",
            result.error,
          );
        }
      })
      .catch((error) => {
        console.error("[tray] failed to set native menu locale", error);
      });
  });

  return null;
}
