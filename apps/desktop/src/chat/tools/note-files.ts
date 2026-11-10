import { tool } from "ai";
import { z } from "zod";

import {
  resolveCurrentSessionId,
  resolveFolderPaths,
  type ToolCallOptions,
} from "./current-session";
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  buildNoteSections,
  listRelatedNotes,
  queryTerms,
  resolveContentSearchSessionIds,
  searchMeetingContent,
  searchNote,
} from "./note-files-search";
import type { ToolDependencies } from "./types";

import { loadSessionSummariesByFolder } from "~/session/queries";

export { searchMeetingContent } from "./note-files-search";

export const buildSearchMeetingContentTool = (deps: ToolDependencies) =>
  tool({
    description:
      "Search local meeting notes and transcripts for exact words or phrases. Use search_meetings first for open-ended questions about past meetings, people, decisions, or topics. This is lexical content search, not vector search.",
    inputSchema: z.object({
      query: z.string().describe("Text to search for in meeting content"),
      meeting_ids: z
        .array(z.string())
        .optional()
        .describe("Optional meeting ids to restrict the content search"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_SEARCH_LIMIT)
        .optional()
        .describe("Maximum matching notes to return"),
    }),
    execute: async (
      params: {
        query: string;
        meeting_ids?: string[];
        limit?: number;
      },
      options?: ToolCallOptions,
    ) => {
      const folderPaths = resolveFolderPaths(deps, options);
      const folderSessionIds =
        folderPaths.length === 0
          ? undefined
          : [
              ...new Set(
                (
                  await Promise.all(
                    folderPaths.map((folderPath) =>
                      loadSessionSummariesByFolder(folderPath),
                    ),
                  )
                ).flatMap((sessions) => sessions.map((session) => session.id)),
              ),
            ];
      const sessionIds = resolveContentSearchSessionIds(
        folderSessionIds,
        params.meeting_ids,
      );
      const result = await searchMeetingContent({
        query: params.query,
        sessionIds,
        limit: Math.min(params.limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT),
      });
      return {
        ...result,
        results: result.results.map(({ sessionId, ...match }) => ({
          ...match,
          meeting_id: sessionId,
        })),
      };
    },
  });

export const buildFindRelatedMeetingsTool = (deps: ToolDependencies) =>
  tool({
    description:
      "Find meetings related to the current or given meeting by shared participants or nearby dates.",
    inputSchema: z.object({
      meeting_id: z
        .string()
        .optional()
        .describe(
          "Meeting id to find related meetings for. Defaults to the current note (the one marked as current in context).",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_SEARCH_LIMIT)
        .optional()
        .describe("Maximum related meetings to return"),
    }),
    execute: async (
      params: { meeting_id?: string; limit?: number },
      options,
    ) => {
      const sessionId =
        params.meeting_id ?? resolveCurrentSessionId(deps, options);
      if (!sessionId) {
        return {
          status: "error" as const,
          message: "No meeting is currently open",
          results: [],
        };
      }

      const result = await listRelatedNotes({
        sessionId,
        limit: Math.min(params.limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT),
      });
      const { sessionId: resolvedMeetingId, ...related } = result;
      return {
        ...related,
        meeting_id: resolvedMeetingId,
        results: result.results.map(({ sessionId, ...meeting }) => ({
          ...meeting,
          meeting_id: sessionId,
        })),
      };
    },
  });

export const noteFileTestInternals = {
  buildNoteSections,
  queryTerms,
  searchNote,
};
