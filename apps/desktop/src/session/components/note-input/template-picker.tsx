import { useLingui } from "@lingui/react/macro";
import { useCallback, useMemo, useRef, useState } from "react";

import { CaretRight, MagnifyingGlass, X } from "@syntheo/ui/components/icons";
import {
  AppFloatingPanel,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@syntheo/ui/components/ui/popover";
import { cn } from "@syntheo/utils";

import { TemplateResultButton, TemplateSection } from "./template-picker-items";
import { useTemplatePickerSections } from "./template-picker-sections";

import { useWebResources } from "~/shared/ui/resource-list";
import {
  filterWebTemplatesAgainstUserTemplates,
  parseWebTemplates,
  useCreateTemplate,
  useOpenTemplatesTab,
  useUserTemplates,
  type WebTemplate,
} from "~/templates";

export type TemplateSelection = {
  templateId: string | null;
  title: string;
};

export function TemplatePickerPopover({
  onSelectTemplate,
  usedTemplateId,
  onRegenerateUsed,
  isRegenerating = false,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  onSelectTemplate: (selection: TemplateSelection) => void;
  usedTemplateId?: string | null;
  onRegenerateUsed?: () => void;
  isRegenerating?: boolean;
  trigger: React.ReactNode;
  // Ouverture pilotée de l'extérieur (menu des versions, issue 415) : le
  // déclencheur sert alors seulement d'ancre. Il doit poser la `ref` reçue
  // sur un élément du DOM toujours monté, sinon le sélecteur reste hors de
  // l'écran (issue 431).
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : uncontrolledOpen;
  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (!controlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlled, onOpenChange],
  );
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const userTemplates = useUserTemplates();
  const createTemplate = useCreateTemplate("session_note");
  const { data: rawWebTemplates = [] } =
    useWebResources<Record<string, unknown>>("templates");
  const webTemplates = useMemo(
    () =>
      filterWebTemplatesAgainstUserTemplates({
        userTemplates,
        webTemplates: parseWebTemplates(rawWebTemplates),
      }),
    [rawWebTemplates, userTemplates],
  );
  const openTemplatesTab = useOpenTemplatesTab();

  const handleUseTemplate = useCallback(
    (selection: TemplateSelection) => {
      setOpen(false);
      setSearch("");
      resultRefs.current = [];

      onSelectTemplate(selection);
    },
    [onSelectTemplate, setOpen],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        setSearch("");
        resultRefs.current = [];
      }
    },
    [setOpen],
  );

  const handleWebTemplateClick = useCallback(
    (template: WebTemplate) => {
      setOpen(false);
      setSearch("");
      resultRefs.current = [];

      void (async () => {
        const templateId = await createTemplate({
          title: template.title,
          description: template.description,
          category: template.category,
          icon: template.icon,
          targets: template.targets,
          sections: template.sections ?? [],
        });
        if (!templateId) {
          return;
        }

        onSelectTemplate({
          templateId,
          title: template.title || "Untitled",
        });
      })();
    },
    [createTemplate, onSelectTemplate, setOpen],
  );

  const handleCreateTemplate = useCallback(
    (title?: string) => {
      const nextTitle = title?.trim() || "New Template";

      setOpen(false);
      setSearch("");
      resultRefs.current = [];

      void (async () => {
        const templateId = await createTemplate({
          title: nextTitle,
          description: "",
          sections: [],
        });
        if (!templateId) {
          return;
        }

        openTemplatesTab({
          selectedMineId: templateId,
          selectedWebIndex: null,
          isWebMode: false,
          showHomepage: false,
        });
      })();
    },
    [createTemplate, openTemplatesTab, setOpen],
  );
  const handleSeeAllTemplates = useCallback(() => {
    setOpen(false);
    setSearch("");
    resultRefs.current = [];
    openTemplatesTab({
      showHomepage: false,
      isWebMode: true,
      selectedMineId: null,
      selectedWebIndex: 0,
    });
  }, [openTemplatesTab, setOpen]);

  const resultSections = useTemplatePickerSections({
    search,
    userTemplates,
    webTemplates,
    handleUseTemplate,
    handleWebTemplateClick,
    handleCreateTemplate,
  });
  const navigableResults = useMemo(
    () => resultSections.flatMap((section) => section.items),
    [resultSections],
  );
  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus();
  }, []);
  const focusResult = useCallback((index: number) => {
    resultRefs.current[index]?.focus();
  }, []);
  const handleSearchInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (navigableResults.length === 0) {
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusResult(0);
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        focusResult(navigableResults.length - 1);
      }
    },
    [focusResult, navigableResults.length],
  );
  const handleResultKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusResult(Math.min(index + 1, navigableResults.length - 1));
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (index === 0) {
          focusSearchInput();
          return;
        }

        focusResult(index - 1);
      }
    },
    [focusResult, focusSearchInput, navigableResults.length],
  );
  let resultIndex = 0;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {controlled ? (
        <PopoverAnchor asChild>{trigger}</PopoverAnchor>
      ) : (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      )}
      <PopoverContent variant="app" className="w-80 pb-0" align="start">
        <div className="flex flex-col">
          <AppFloatingPanel className="flex flex-col overflow-hidden rounded-[20px]">
            <div className="border-border border-b py-1">
              <div
                className={cn([
                  "flex h-8 items-center gap-2 rounded-md px-2.5",
                ])}
              >
                <MagnifyingGlass className="text-muted-foreground h-4 w-4" />
                <input
                  ref={searchInputRef}
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchInputKeyDown}
                  placeholder={t`Search templates...`}
                  className="placeholder:text-muted-foreground flex-1 bg-transparent text-sm focus:outline-hidden"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="hover:bg-accent rounded-xs p-0.5"
                  >
                    <X className="text-muted-foreground h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-b-[20px]">
              <div
                className={cn(["scroll-fade-y max-h-80 overflow-y-auto p-1"])}
              >
                <div className="flex flex-col gap-0">
                  {resultSections.map((section) => (
                    <TemplateSection
                      key={section.key}
                      title={section.title}
                      icon={section.icon}
                      uppercase={section.uppercase}
                      showHeader={section.showHeader}
                    >
                      {section.items.length > 0 ? (
                        section.items.map((item) => {
                          const itemIndex = resultIndex;
                          resultIndex += 1;

                          const isUsedTemplate =
                            usedTemplateId !== undefined &&
                            (item.key === "auto"
                              ? usedTemplateId === null
                              : item.key === usedTemplateId);

                          return (
                            <TemplateResultButton
                              key={item.key}
                              buttonRef={(node) => {
                                resultRefs.current[itemIndex] = node;
                              }}
                              title={item.title}
                              icon={item.icon}
                              isFavorite={item.isFavorite}
                              onClick={item.onClick}
                              onKeyDown={(e) =>
                                handleResultKeyDown(e, itemIndex)
                              }
                              regenerateLabel={
                                isUsedTemplate && onRegenerateUsed
                                  ? t`Regenerate`
                                  : undefined
                              }
                              isRegenerating={isRegenerating}
                              onRegenerate={
                                isUsedTemplate ? onRegenerateUsed : undefined
                              }
                            />
                          );
                        })
                      ) : (
                        <div className="text-muted-foreground px-2 py-3 text-sm">
                          {section.emptyMessage}
                        </div>
                      )}
                    </TemplateSection>
                  ))}
                </div>
              </div>
            </div>
          </AppFloatingPanel>

          <button
            onClick={handleSeeAllTemplates}
            className={cn([
              "flex w-full items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium",
              "text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
            ])}
          >
            {t`See all templates`}
            <CaretRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
