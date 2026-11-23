import { Trans } from "@lingui/react/macro";

import { LlmServerCard, ReasoningEffortRow } from "./server-card";

import { useIntelligenceDisabled } from "~/settings/managed";
import { SettingsPageTitle } from "~/settings/page-title";
import { SettingRow, SettingRows } from "~/settings/setting-row";

export function LLM() {
  // Synthèse désactivée par réglage géré : ni carte serveur (sonde, liste des
  // modèles) ni choix du modèle, dont l'écriture serait refusée par les
  // déclencheurs de managed_app_settings sans rien afficher (issue 707). Le
  // message suit la politique en vigueur : la copie d'app_settings reste quand
  // l'administrateur retire la clé.
  const disabled = useIntelligenceDisabled().managed;
  const title = (
    <SettingsPageTitle
      title={<Trans>Synthesis</Trans>}
      lede={
        <Trans>
          The language model that writes your meeting notes and answers when you
          ask a note a question.
        </Trans>
      }
    />
  );
  if (disabled) {
    return (
      <div className="flex flex-col gap-[26px]">
        {title}
        <p role="note" className="text-muted-foreground text-[13px]">
          <Trans>Set by your administrator.</Trans>
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[26px]">
      {title}
      <LlmServerCard />
      <SettingRows>
        <SettingRow
          controlWidth="content"
          settingId="llm-reasoning-effort"
          title={<Trans>Reasoning effort</Trans>}
          description={
            <Trans>
              More effort gives finer summaries, but slower. Auto leaves it to
              the server.
            </Trans>
          }
        >
          {() => <ReasoningEffortRow />}
        </SettingRow>
      </SettingRows>
    </div>
  );
}
