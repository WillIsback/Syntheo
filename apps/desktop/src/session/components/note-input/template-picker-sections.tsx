import { useMemo } from "react";

import { Plus } from "@syntheo/ui/components/icons";

import type { TemplateSelection } from "./template-picker";

import {
  DEFAULT_TEMPLATE_ICON,
  type TemplateIcon,
  type UserTemplate,
  type WebTemplate,
} from "~/templates";

export type TemplatePickerItem = {
  key: string;
  title: string;
  icon: TemplateIcon;
  isFavorite?: boolean;
  onClick: () => void;
};

export type TemplatePickerSection = {
  key: string;
  title: string;
  icon?: React.ReactNode;
  uppercase?: boolean;
  showHeader?: boolean;
  emptyMessage?: string;
  items: TemplatePickerItem[];
};

// Sections de résultats du sélecteur : « Auto », puis les favoris et les
// autres modèles (locaux et en ligne) filtrés par la recherche.
export function useTemplatePickerSections({
  search,
  userTemplates,
  webTemplates,
  handleUseTemplate,
  handleWebTemplateClick,
  handleCreateTemplate,
}: {
  search: string;
  userTemplates: UserTemplate[];
  webTemplates: WebTemplate[];
  handleUseTemplate: (selection: TemplateSelection) => void;
  handleWebTemplateClick: (template: WebTemplate) => void;
  handleCreateTemplate: (title?: string) => void;
}): TemplatePickerSection[] {
  const trimmedSearch = search.trim();
  const searchQuery = search.trim().toLowerCase();
  const favoriteTemplates = useMemo(
    () => sortFavoriteTemplates(userTemplates),
    [userTemplates],
  );
  const otherTemplates = useMemo(
    () => sortOtherTemplates(userTemplates),
    [userTemplates],
  );

  const filteredFavoriteTemplates = useMemo(() => {
    if (!searchQuery) {
      return favoriteTemplates;
    }

    return favoriteTemplates.filter((template) =>
      matchesTemplateSearch(template, searchQuery),
    );
  }, [favoriteTemplates, searchQuery]);

  const filteredOtherTemplates = useMemo(() => {
    if (!searchQuery) {
      return otherTemplates;
    }

    return otherTemplates.filter((template) =>
      matchesTemplateSearch(template, searchQuery),
    );
  }, [otherTemplates, searchQuery]);

  const hasSearch = searchQuery.length > 0;
  const filteredWebTemplates = useMemo(() => {
    if (!searchQuery) {
      return webTemplates;
    }

    return webTemplates.filter((template) =>
      matchesTemplateSearch(template, searchQuery),
    );
  }, [searchQuery, webTemplates]);
  const templateItems = useMemo<TemplatePickerItem[]>(() => {
    const favoriteItems = filteredFavoriteTemplates.map((template) => ({
      key: template.id,
      title: template.title || "Untitled",
      icon: template.icon,
      isFavorite: true,
      onClick: () =>
        handleUseTemplate({
          templateId: template.id,
          title: template.title || "Untitled",
        }),
    }));

    const userItems = filteredOtherTemplates.map((template) => ({
      key: template.id,
      title: template.title || "Untitled",
      icon: template.icon,
      onClick: () =>
        handleUseTemplate({
          templateId: template.id,
          title: template.title || "Untitled",
        }),
    }));

    const webItems = filteredWebTemplates.map((template, index) => ({
      key: template.slug || `library-${index}`,
      title: template.title || "Untitled",
      icon: template.icon,
      onClick: () => handleWebTemplateClick(template),
    }));

    const otherItems = [...userItems, ...webItems].sort((a, b) =>
      a.title.localeCompare(b.title),
    );

    return [...favoriteItems, ...otherItems];
  }, [
    filteredFavoriteTemplates,
    filteredOtherTemplates,
    filteredWebTemplates,
    handleWebTemplateClick,
    handleUseTemplate,
  ]);
  return useMemo<TemplatePickerSection[]>(() => {
    const autoSection = {
      key: "auto",
      title: "Auto",
      showHeader: false,
      items: [
        {
          key: "auto",
          title: "Auto",
          icon: {
            type: "icon",
            value: "sparkles",
            color: DEFAULT_TEMPLATE_ICON.color,
          } satisfies TemplateIcon,
          onClick: () =>
            handleUseTemplate({
              templateId: null,
              title: "Auto",
            }),
        },
      ],
    };

    if (!hasSearch) {
      return [
        autoSection,
        {
          key: "templates",
          title: "Templates",
          showHeader: false,
          items: templateItems,
          emptyMessage: "No templates yet",
        },
      ];
    }

    return [
      autoSection,
      {
        key: "create",
        title: "Create new template",
        icon: <Plus className="text-primary h-3.5 w-3.5" />,
        uppercase: false,
        items: [
          {
            key: `create-${trimmedSearch}`,
            title: trimmedSearch,
            icon: DEFAULT_TEMPLATE_ICON,
            onClick: () => handleCreateTemplate(trimmedSearch),
          },
        ],
      },
      ...(templateItems.length > 0
        ? [
            {
              key: "templates",
              title: "Templates",
              showHeader: false,
              items: templateItems,
            },
          ]
        : []),
    ];
  }, [
    handleCreateTemplate,
    handleUseTemplate,
    hasSearch,
    templateItems,
    trimmedSearch,
  ]);
}

function matchesTemplateSearch(
  template: {
    title?: string;
    description?: string;
    category?: string;
    targets?: string[];
  },
  query: string,
) {
  return (
    template.title?.toLowerCase().includes(query) ||
    template.description?.toLowerCase().includes(query) ||
    template.category?.toLowerCase().includes(query) ||
    template.targets?.some((target) => target.toLowerCase().includes(query))
  );
}

function sortFavoriteTemplates<
  T extends { pinned?: boolean; pinOrder?: number; title?: string },
>(templates: T[]) {
  return [...templates]
    .filter((template) => template.pinned)
    .sort((a, b) => {
      const orderA = a.pinOrder ?? Infinity;
      const orderB = b.pinOrder ?? Infinity;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.title || "").localeCompare(b.title || "");
    });
}

function sortOtherTemplates<T extends { pinned?: boolean; title?: string }>(
  templates: T[],
) {
  return [...templates]
    .filter((template) => !template.pinned)
    .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
}
