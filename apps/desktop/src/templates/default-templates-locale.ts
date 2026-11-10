import {
  DEFAULT_TEMPLATES_EN,
  LEGACY_DEFAULT_TEMPLATES_EN,
} from "./default-templates-en";
import { DEFAULT_TEMPLATES_FR } from "./default-templates-fr";

import { executeTransaction } from "~/db";
import { type DisplayLocale, SUPPORTED_DISPLAY_LOCALES } from "~/i18n/locales";

// Issue 549 : les modèles fournis (`default-*`, `syntheo-*`) sont écrits en
// français par les migrations SQL. Ils suivent désormais la langue de
// l'interface : on remplace leurs textes par ceux de la langue active, mais
// seulement quand la ligne contient encore mot pour mot les textes fournis
// dans une autre langue. Un modèle modifié par l'utilisateur ne correspond plus
// à aucune version fournie et n'est jamais touché.

export type DefaultTemplateText = {
  title: string;
  description: string;
  category: string;
  targets: readonly string[];
  sections: readonly (readonly [title: string, description: string])[];
};

const DEFAULT_TEMPLATES: Record<
  DisplayLocale,
  Readonly<Record<string, DefaultTemplateText>>
> = {
  en: DEFAULT_TEMPLATES_EN,
  fr: DEFAULT_TEMPLATES_FR,
};

const LOCALIZE_SQL = `
  UPDATE templates
  SET title = ?, description = ?, category = ?, targets_json = ?, sections_json = ?
  WHERE id = ?
    AND title = ?
    AND description = ?
    AND category IS ?
    AND targets_json IS ?
    AND sections_json = ?
`;

// Colonnes telles que les migrations les stockent (JSON compact).
export function storedTemplateColumns(text: DefaultTemplateText): string[] {
  return [
    text.title,
    text.description,
    text.category,
    JSON.stringify(text.targets),
    JSON.stringify(
      text.sections.map(([title, description]) => ({ title, description })),
    ),
  ];
}

export function buildDefaultTemplateLocaleStatements(
  locale: DisplayLocale,
): { sql: string; params: string[] }[] {
  const otherLocales = SUPPORTED_DISPLAY_LOCALES.filter(
    (candidate) => candidate !== locale,
  );
  return Object.entries(DEFAULT_TEMPLATES[locale]).flatMap(([id, target]) => {
    // Textes fournis qu'une ligne peut encore porter : ceux des autres
    // langues, puis les anciennes versions (issue 560).
    const sources = [
      ...otherLocales.map((otherLocale) => DEFAULT_TEMPLATES[otherLocale][id]),
      LEGACY_DEFAULT_TEMPLATES_EN[id],
    ].filter((source): source is DefaultTemplateText => Boolean(source));
    return sources.map((source) => ({
      sql: LOCALIZE_SQL,
      params: [
        ...storedTemplateColumns(target),
        id,
        ...storedTemplateColumns(source),
      ],
    }));
  });
}

export async function localizeDefaultTemplates(
  locale: DisplayLocale,
): Promise<void> {
  await executeTransaction(buildDefaultTemplateLocaleStatements(locale));
}
