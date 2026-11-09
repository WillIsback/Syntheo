import type { I18n } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { type Platform, platform } from "@tauri-apps/plugin-os";
import { useMemo } from "react";

import {
  SETTINGS_SEARCH_INDEX,
  type SettingId,
  type SettingsSearchEntry,
} from "~/settings/search-index";
import { isAppStoreBuild } from "~/shared/app-store";
import { useSettingsNavGroups } from "~/sidebar/settings-nav-groups";
import type { SettingsTab } from "~/store/zustand/tabs";

// Recherche de paramètres (issue 373) : comparaison sans accents ni casse,
// chaque mot tapé doit apparaître quelque part, pas de recherche floue.
export type SettingsSearchResult = {
  id: SettingId;
  page: SettingsTab;
  pageLabel: string;
  label: string;
  section: string | null;
  keywords: string;
  // « Réunions › Audio » : page, puis partie de page.
  breadcrumb: string;
};

export function normalizeSearchText(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function resolveSettingsIndex(
  i18n: I18n,
  {
    pageLabels,
    platform: currentPlatform,
    appStoreBuild,
  }: {
    pageLabels: ReadonlyMap<SettingsTab, string>;
    platform: Platform | null;
    appStoreBuild: boolean;
  },
): SettingsSearchResult[] {
  return (SETTINGS_SEARCH_INDEX as readonly SettingsSearchEntry[])
    .filter(
      (item) =>
        !(appStoreBuild && item.hiddenInAppStore) &&
        (!item.platforms ||
          currentPlatform === null ||
          item.platforms.includes(currentPlatform)),
    )
    .map((item) => {
      const pageLabel = pageLabels.get(item.page) ?? "";
      const section = item.section ? i18n._(item.section) : null;
      return {
        id: item.id as SettingId,
        page: item.page,
        pageLabel,
        label: i18n._(item.label),
        section,
        keywords: i18n._(item.keywords),
        breadcrumb: section ? `${pageLabel} › ${section}` : pageLabel,
      };
    });
}

/**
 * Filtre et classe : libellé qui commence par le texte tapé, puis libellé qui
 * le contient, puis correspondance dans la section, la page ou les mots-clés.
 * L'ordre de l'index départage. Une recherche vide renvoie tout l'index.
 */
export function searchSettings<T extends SettingsSearchResult>(
  entries: readonly T[],
  query: string,
): T[] {
  const normalizedQuery = normalizeSearchText(query).replace(/\s+/g, " ");
  if (!normalizedQuery) {
    return [...entries];
  }
  const words = normalizedQuery.split(" ");

  return entries
    .flatMap((item, index) => {
      const label = normalizeSearchText(item.label);
      const haystack = normalizeSearchText(
        [item.label, item.section ?? "", item.pageLabel, item.keywords].join(
          " ",
        ),
      );
      if (!words.every((word) => haystack.includes(word))) {
        return [];
      }
      const rank = label.startsWith(normalizedQuery)
        ? 0
        : label.includes(normalizedQuery)
          ? 1
          : 2;
      return [{ item, rank, index }];
    })
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);
}

function runtimePlatform(): Platform | null {
  try {
    return platform();
  } catch {
    return null;
  }
}

/** Index résolu dans la langue de l'interface, pour la plateforme courante. */
export function useSettingsSearchIndex(): SettingsSearchResult[] {
  const { i18n } = useLingui();
  const groups = useSettingsNavGroups();

  return useMemo(() => {
    const pageLabels = new Map<SettingsTab, string>();
    for (const group of groups) {
      for (const item of group.items) {
        if (!("destination" in item)) {
          pageLabels.set(item.id, item.label);
        }
      }
    }
    return resolveSettingsIndex(i18n, {
      pageLabels,
      platform: runtimePlatform(),
      appStoreBuild: isAppStoreBuild(),
    });
  }, [groups, i18n]);
}
