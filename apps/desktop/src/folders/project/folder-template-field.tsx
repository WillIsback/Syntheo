import { Trans, useLingui } from "@lingui/react/macro";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@syntheo/ui/components/ui/select";
import { folderDisplayName } from "@syntheo/utils/folders";

import { useLiveQuery } from "~/db";
import {
  updateFolderTemplate,
  useFolderTemplateId,
  useInheritedFolderTemplate,
} from "~/folders/folder-template";

const NO_TEMPLATE = "__none__";

type TemplateOption = { id: string; title: string };

const EMPTY_OPTIONS: TemplateOption[] = [];

function useTemplateOptions(): TemplateOption[] {
  const { data = EMPTY_OPTIONS } = useLiveQuery<
    TemplateOption,
    TemplateOption[]
  >({
    sql: `SELECT id, title FROM templates`,
    params: [],
    mapRows: (rows) =>
      [...rows].sort((left, right) =>
        left.title.localeCompare(right.title, undefined, {
          sensitivity: "base",
        }),
      ),
  });
  return data;
}

// Modèle de compte rendu par défaut du dossier (issue 502) : appliqué aux
// notes rangées dans le dossier ou ses sous-dossiers qui n'ont pas de modèle
// choisi, à la place du réglage global.
export function FolderTemplateField({ folderPath }: { folderPath: string }) {
  const { t } = useLingui();
  const templates = useTemplateOptions();
  const ownTemplateId = useFolderTemplateId(folderPath);
  const inherited = useInheritedFolderTemplate(folderPath);
  const inheritedFromParent =
    !ownTemplateId && inherited && inherited.folderPath !== folderPath
      ? inherited
      : undefined;
  const inheritedTitle = inheritedFromParent
    ? templates
        .find((template) => template.id === inheritedFromParent.templateId)
        ?.title.trim() || t`Untitled`
    : "";
  const parentName = inheritedFromParent
    ? folderDisplayName(inheritedFromParent.folderPath)
    : "";

  return (
    <>
      <h3 className="text-sm font-semibold">
        <Trans>Summary template</Trans>
      </h3>
      <p className="text-muted-foreground text-xs">
        <Trans>Used for this folder's notes unless a note picks another</Trans>
      </p>
      <Select
        value={ownTemplateId || NO_TEMPLATE}
        onValueChange={(value) => {
          void updateFolderTemplate(
            folderPath,
            value === NO_TEMPLATE ? "" : value,
          ).catch((error) => {
            console.error("[folders] failed to set folder template", error);
          });
        }}
      >
        <SelectTrigger
          className="h-8 w-full text-sm"
          aria-label={t`Summary template`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_TEMPLATE}>{t`None`}</SelectItem>
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.title.trim() || t`Untitled`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {inheritedFromParent ? (
        <p className="text-muted-foreground text-xs">
          <Trans>
            Without one, notes use {inheritedTitle} from the {parentName}{" "}
            folder.
          </Trans>
        </p>
      ) : null}
    </>
  );
}
