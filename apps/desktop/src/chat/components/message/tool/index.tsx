import { ToolEditMemo, ToolEditSummary } from "./edit-summary";
import { ToolGeneric } from "./generic";
import {
  ToolMoveMeetingContents,
  ToolMoveMeetingsToFolder,
} from "./move-tools";
import { ToolSearchMeetings } from "./search-meetings";
import { ToolSessionCorrection } from "./session-correction";
import { ToolUpdatePromptTemplate } from "./update-prompt-template";

import type { Part } from "~/chat/components/message/types";

type ToolComponent = (props: { part: Part }) => React.ReactNode;

const toolRegistry: Record<string, ToolComponent> = {
  "tool-list_meetings": ToolSearchMeetings as ToolComponent,
  "tool-search_meetings": ToolSearchMeetings as ToolComponent,
  "tool-search_sessions": ToolSearchMeetings as ToolComponent,
  "tool-edit_memo": ToolEditMemo as ToolComponent,
  "tool-edit_summary": ToolEditSummary as ToolComponent,
  "tool-apply_session_correction": ToolSessionCorrection as ToolComponent,
  "tool-move_meeting_contents": ToolMoveMeetingContents as ToolComponent,
  "tool-move_meetings_to_folder": ToolMoveMeetingsToFolder as ToolComponent,
  "tool-update_prompt_template": ToolUpdatePromptTemplate as ToolComponent,
};

export function Tool({ part }: { part: Part }) {
  const Renderer = toolRegistry[part.type];
  if (Renderer) {
    return <Renderer part={part} />;
  }
  return <ToolGeneric part={part as Record<string, unknown>} />;
}
