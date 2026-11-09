import { useMemo } from "react";

import type { MentionConfig } from "@syntheo/editor/widgets";

import { useHumans, useOrganizations } from "~/contacts/queries";
import { useLiveQuery } from "~/db";
import { useSearchEngine } from "~/search/contexts/engine";
import { useFolderPaths } from "~/session/queries/folders";
import { useUndoDelete } from "~/store/zustand/undo-delete";

type MentionSession = { id: string; title: string };

const EMPTY_SESSIONS: MentionSession[] = [];

// Titled notes, oldest first; a note pending deletion is hidden right away.
function useMentionSessions(): MentionSession[] {
  const { data = EMPTY_SESSIONS } = useLiveQuery<
    MentionSession,
    MentionSession[]
  >({
    sql: `
      SELECT id, title
      FROM sessions
      WHERE deleted_at IS NULL AND title <> ''
      ORDER BY created_at, id
    `,
  });
  const pendingDeletions = useUndoDelete((state) => state.pendingDeletions);

  return useMemo(
    () => data.filter((session) => !(session.id in pendingDeletions)),
    [data, pendingDeletions],
  );
}

function interleave<T>(lists: T[][]): T[] {
  const items: T[] = [];
  for (let index = 0; ; index += 1) {
    let added = false;
    for (const list of lists) {
      if (index < list.length) {
        items.push(list[index]);
        added = true;
      }
    }
    if (!added) {
      return items;
    }
  }
}

export function useMentionConfig(): MentionConfig {
  const sessions = useMentionSessions();
  const humans = useHumans();
  const organizations = useOrganizations();
  const folderPaths = useFolderPaths();
  const { search } = useSearchEngine();

  return useMemo(
    () => ({
      trigger: "@",
      handleSearch: async (query: string) => {
        if (query.trim()) {
          const needle = query.trim().toLocaleLowerCase();
          const folders = folderPaths
            .filter((path) => path.toLocaleLowerCase().includes(needle))
            .map((path) => ({ id: path, type: "folder", label: path }));
          const searchResults = await search(query);
          const hitsByType = new Map<string, typeof folders>();
          for (const hit of searchResults) {
            const item = {
              id: hit.document.id,
              type: hit.document.type,
              label: hit.document.title,
            };
            const group = hitsByType.get(item.type) ?? [];
            group.push(item);
            hitsByType.set(item.type, group);
          }
          return interleave([folders, ...hitsByType.values()]).slice(0, 5);
        }

        const sessionItems = sessions.map((session) => ({
          id: session.id,
          type: "session",
          label: session.title,
        }));
        const humanItems = humans.flatMap((human) =>
          human.name
            ? [{ id: human.id, type: "human", label: human.name }]
            : [],
        );
        const organizationItems = organizations.flatMap((organization) =>
          organization.name
            ? [
                {
                  id: organization.id,
                  type: "organization",
                  label: organization.name,
                },
              ]
            : [],
        );
        const folderItems = folderPaths.map((path) => ({
          id: path,
          type: "folder",
          label: path,
        }));
        return interleave([
          sessionItems,
          humanItems,
          organizationItems,
          folderItems,
        ]).slice(0, 5);
      },
    }),
    [sessions, humans, organizations, folderPaths, search],
  );
}
