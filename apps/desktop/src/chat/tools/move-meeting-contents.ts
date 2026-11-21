import { tool } from "ai";
import { z } from "zod";

import { resolveCurrentSessionId } from "./current-session";
import { requestToolApproval } from "./pending-tool-approval-store";
import type { ToolDependencies } from "./types";

import { liveQueryClient } from "~/db";
import { moveSessionContents } from "~/session/move-contents";

async function loadMeetingTitle(meetingId: string): Promise<string | null> {
  const rows = await liveQueryClient.execute<{ title: string }>(
    `SELECT title FROM sessions WHERE id = ? AND deleted_at IS NULL`,
    [meetingId],
  );
  return rows[0] ? rows[0].title : null;
}

export const buildMoveMeetingContentsTool = (
  deps: Pick<ToolDependencies, "getSessionId">,
) =>
  tool({
    description:
      "Move a finished recording, transcript, generated summaries, notes, and action items from one meeting onto another existing meeting. Use this when the user says a recording or notes landed on the wrong meeting. Resolve both meeting IDs with list_meetings or search_meetings first and never guess IDs. The target meeting must not already have a recording or transcript. The user confirms the move in the tool card before anything changes.",
    inputSchema: z.object({
      sourceMeetingId: z
        .string()
        .optional()
        .describe(
          "Meeting that currently has the recording or notes. Defaults to the current note (the one marked as current in context).",
        ),
      targetMeetingId: z
        .string()
        .describe(
          "Existing meeting that should receive the recording and notes.",
        ),
    }),
    execute: async (
      params: {
        sourceMeetingId?: string;
        targetMeetingId: string;
      },
      options,
    ) => {
      const sourceMeetingId =
        params.sourceMeetingId ?? resolveCurrentSessionId(deps, options);
      const targetMeetingId = params.targetMeetingId;

      if (!sourceMeetingId) {
        return {
          status: "error",
          message:
            "No source meeting selected. Provide sourceMeetingId explicitly when calling move_meeting_contents.",
        };
      }

      const [sourceTitle, targetTitle] = await Promise.all([
        loadMeetingTitle(sourceMeetingId),
        loadMeetingTitle(targetMeetingId),
      ]);
      if (sourceTitle === null || targetTitle === null) {
        return {
          status: "error",
          message:
            "Meeting not found. Resolve both meeting IDs with list_meetings or search_meetings.",
        };
      }

      // Validation (issue 644) : rien n'est déplacé sans l'accord de
      // l'utilisateur dans la carte de l'outil.
      const decision = await requestToolApproval(
        options.toolCallId,
        { kind: "move_meeting_contents", sourceTitle, targetTitle },
        options.abortSignal,
      );
      if (!decision.approved) {
        return {
          status: "declined",
          message:
            "The user declined this move. Nothing was changed. Do not retry unless the user asks again.",
        };
      }

      return moveSessionContents({
        sourceSessionId: sourceMeetingId,
        targetSessionId: targetMeetingId,
      });
    },
  });
