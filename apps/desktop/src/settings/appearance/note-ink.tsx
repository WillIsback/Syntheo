import { Trans } from "@lingui/react/macro";

import { useSetSettingValue } from "~/settings/queries";
import { SettingSwitchRow } from "~/settings/setting-row";
import { useConfigValue } from "~/shared/config";

// Synthèse (issue 365) : colorer les notes dans le compte rendu, ou les
// afficher dans un bloc séparé.
export function NoteInkSettings() {
  const enabled = useConfigValue("color_notes_in_summary");
  const setEnabled = useSetSettingValue("color_notes_in_summary");

  return (
    <SettingSwitchRow
      title={<Trans>Color my notes in the summary</Trans>}
      description={
        <Trans>
          Sentences that come from your notes appear in green. When off, your
          notes are shown in a separate block.
        </Trans>
      }
      checked={enabled}
      onChange={setEnabled}
    />
  );
}
