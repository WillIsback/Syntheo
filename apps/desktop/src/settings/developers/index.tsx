import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { commands as openerCommands } from "@syntheo/plugin-opener2";
import { ArrowSquareOut } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";

import { CliSettingsSections } from "./cli";
import { WebhooksSection } from "./webhooks";

import { SettingsPageTitle } from "~/settings/page-title";
import { documentationUrl } from "~/shared/documentation";

export { buildMcpConfiguration, CLI_INSTALL_COMMAND } from "./cli";

export function SettingsDevelopers() {
  // `t` de @lingui/core/macro lit la langue au rendu : s'abonner au changement de
  // langue pour se redessiner aussitôt, sous-composants compris (issue 558).
  useLingui();
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <SettingsPageTitle title={t`Developers`} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            void openerCommands
              .openUrl(documentationUrl(i18n.locale, "agents/overview"), null)
              .catch((error) =>
                console.error(
                  "[settings] failed to open developers guide",
                  error,
                ),
              )
          }
        >
          {t`Guide`}
          <ArrowSquareOut className="size-3.5" />
        </Button>
      </div>
      <CliSettingsSections />
      <WebhooksSection />
    </div>
  );
}
