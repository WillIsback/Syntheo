import { useLingui } from "@lingui/react";

import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import { localizeDefaultTemplates } from "./default-templates-locale";

import { resolveDisplayLocale } from "~/i18n/locales";

// Les modèles fournis suivent la langue de l'interface (issue 549) : au
// démarrage et à chaque changement de langue, ceux que l'utilisateur n'a pas
// modifiés sont réécrits dans la langue active.
export function DefaultTemplatesLocaleSync() {
  const { i18n } = useLingui();

  return <DefaultTemplatesLocalizer key={i18n.locale} locale={i18n.locale} />;
}

function DefaultTemplatesLocalizer({ locale }: { locale: string }) {
  useMountEffect(() => {
    void localizeDefaultTemplates(resolveDisplayLocale(locale, null)).catch(
      (error) => {
        console.error(
          "[templates] failed to localize default templates",
          error,
        );
      },
    );
  });

  return null;
}
