import { Trans, useLingui } from "@lingui/react/macro";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@syntheo/ui/components/ui/select";

import {
  UI_LANGUAGE_AUTO,
  type UiLanguagePreference,
  normalizeUiLanguage,
  resolveUiLanguagePreference,
} from "~/i18n/locales";
import { useSetSettingValue, useStoredSettingValues } from "~/settings/queries";
import { SETTING_CONTROL_CLASS, SettingRow } from "~/settings/setting-row";

// Langue de l'interface (issue 549), distincte de la langue de transcription.
// Les langues sont nommées dans leur propre langue ; le changement s'applique
// tout de suite (le fournisseur i18n relit le réglage).
export function InterfaceLanguageSelector() {
  const { t } = useLingui();
  const value = resolveUiLanguagePreference(useStoredSettingValues());
  const setUiLanguage = useSetSettingValue("ui_language");
  const options: { value: UiLanguagePreference; label: string }[] = [
    { value: UI_LANGUAGE_AUTO, label: t`Automatic (system)` },
    { value: "fr", label: "Français" },
    { value: "en", label: "English" },
  ];

  return (
    <SettingRow
      settingId="interface-language"
      title={<Trans>Interface language</Trans>}
      description={
        <Trans>
          Language of menus and buttons. Automatic follows your system, in
          English when Syntheo is not translated into its language.
        </Trans>
      }
    >
      {(labelProps) => (
        <Select
          value={value}
          onValueChange={(next) => setUiLanguage(normalizeUiLanguage(next))}
        >
          <SelectTrigger {...labelProps} className={SETTING_CONTROL_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </SettingRow>
  );
}
