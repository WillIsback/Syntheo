import { Trans } from "@lingui/react/macro";
import { useEffect } from "react";

import { FolderEditor } from "./folder-editor";
import { useActiveFolderPath, useFolderSelection } from "./selection";

import { useFolderPaths } from "~/session/queries";
import { StandardContentWrapper } from "~/shared/main";

export function TabContentFolders() {
  return (
    <StandardContentWrapper>
      <div className="h-full">
        <FoldersMain />
      </div>
    </StandardContentWrapper>
  );
}

export function FoldersMain() {
  const folders = useFolderPaths();
  const activeFolder = useActiveFolderPath(folders);
  const selectedPath = useFolderSelection((state) => state.selectedPath);
  const setSelectedPath = useFolderSelection((state) => state.setSelectedPath);
  // Le chat de la page (Ctrl+J) lit le dossier sélectionné : on fixe celui
  // affiché par défaut (issue 496).
  useEffect(() => {
    if (activeFolder && selectedPath !== activeFolder) {
      setSelectedPath(activeFolder);
    }
  }, [activeFolder, selectedPath, setSelectedPath]);

  if (!activeFolder) {
    return (
      <p className="text-muted-foreground flex h-full items-center justify-center px-6 text-sm">
        <Trans>No folders yet. Create one to group notes and materials.</Trans>
      </p>
    );
  }

  return <FolderEditor key={activeFolder} folderPath={activeFolder} />;
}
