import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

import {
  MENTION_DISPLAY_LIMIT,
  type MentionConfig,
  type MentionItem,
} from "@syntheo/editor/widgets";

import { formatFolderPath, formatMeetingCount } from "~/search/unified/labels";
import type { UnifiedSearchResults } from "~/search/unified/types";
import { useUnifiedSearcher } from "~/search/unified/use-unified-search";

/**
 * Résultats de la recherche commune (issue 501) en propositions de mention :
 * même ordre que la palette `Ctrl+K` (dossiers, notes, contacts). Dossiers et
 * contacts gardent leur place, les notes remplissent le reste.
 */
function toMentionItems(
  results: UnifiedSearchResults,
  untitledLabel: string,
  limit = MENTION_DISPLAY_LIMIT,
): MentionItem[] {
  const folders = results.folders.slice(0, limit);
  const contacts = results.contacts.slice(
    0,
    Math.max(0, limit - folders.length),
  );
  const noteCount = Math.max(0, limit - folders.length - contacts.length);

  return [
    ...folders.map((folder): MentionItem => ({
      id: folder.path,
      type: "folder",
      label: folder.name,
      description: formatMeetingCount(folder.noteCount),
    })),
    ...results.notes.slice(0, noteCount).map((note): MentionItem => ({
      id: note.id,
      type: "session",
      label: note.title || untitledLabel,
      ...(note.folderPath
        ? { description: formatFolderPath(note.folderPath) }
        : {}),
    })),
    ...contacts.map((contact): MentionItem => ({
      id: contact.id,
      type: contact.type,
      label: contact.name,
    })),
  ];
}

export function useMentionConfig(): MentionConfig {
  const { t } = useLingui();
  const searchUnified = useUnifiedSearcher();
  const untitledLabel = t`Untitled`;

  return useMemo(
    () => ({
      trigger: "@",
      handleSearch: async (query: string) =>
        toMentionItems(await searchUnified(query), untitledLabel),
    }),
    [searchUnified, untitledLabel],
  );
}
