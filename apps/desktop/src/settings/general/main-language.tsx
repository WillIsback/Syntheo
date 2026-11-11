import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

import {
  getBaseLanguageDisplayName,
  isAutoMainLanguage,
  MAIN_LANGUAGE_AUTO,
  parseLocale,
} from "./language";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "./searchable-select";

import { SettingRow } from "~/settings/setting-row";

export function MainLanguageView({
  value,
  onChange,
  supportedLanguages,
}: {
  value: string;
  onChange: (value: string) => void;
  supportedLanguages: readonly string[];
}) {
  const { i18n, t } = useLingui();

  const deduped = useMemo(() => {
    const map = new Map<string, string>();
    for (const code of supportedLanguages) {
      const { language } = parseLocale(code);
      if (!map.has(language)) {
        map.set(language, code);
      }
    }
    return map;
  }, [supportedLanguages]);

  const normalizedValue = useMemo(() => {
    if (isAutoMainLanguage(value)) return MAIN_LANGUAGE_AUTO;
    const { language } = parseLocale(value);
    return deduped.get(language) ?? value;
  }, [value, deduped]);

  const options: SearchableSelectOption[] = useMemo(
    () => [
      { value: MAIN_LANGUAGE_AUTO, label: t`Automatic detection` },
      ...[...deduped.values()].map((code) => ({
        value: code,
        label: getBaseLanguageDisplayName(code, i18n.locale),
      })),
    ],
    [deduped, i18n.locale, t],
  );

  return (
    <SettingRow
      settingId="main-language"
      title={<Trans>Main language</Trans>}
      description={
        <Trans>
          Default language for transcription and AI responses. Automatic
          detection lets the transcription model recognize the spoken language,
          and AI responses follow the meeting language.
        </Trans>
      }
    >
      {(labelProps) => (
        <SearchableSelect
          {...labelProps}
          value={normalizedValue}
          onChange={onChange}
          options={options}
          placeholder={t`Select language`}
          searchPlaceholder={t`Search language...`}
          emptyMessage={t`No matching languages found`}
          className="w-full"
        />
      )}
    </SettingRow>
  );
}
