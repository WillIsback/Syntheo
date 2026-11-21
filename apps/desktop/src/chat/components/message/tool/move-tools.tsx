import { t } from "@lingui/core/macro";

import { Folder, Pencil } from "@syntheo/ui/components/icons";

import { ToolApprovalPanel } from "./approval";
import { defineTool } from "./define-tool";
import { ToolCardFooterError, ToolCardFooters } from "./shared";

import { parseMcpObjectOutput } from "~/chat/mcp/mcp-output-parser";

// Déplacements proposés par le chat (issue 644) : validés dans la carte avant
// d'être appliqués.
type MoveOutput = { status?: string; message?: string };

function parseMoveOutput(output: unknown): MoveOutput | null {
  return parseMcpObjectOutput<MoveOutput>(output);
}

export const ToolMoveMeetingContents = defineTool({
  icon: <Pencil />,
  parseFn: parseMoveOutput,
  isDone: (parsed) => parsed?.status === "moved",
  label: ({ running, failed, parsed }) => {
    if (running) return t`Move meeting contents — waiting for your review`;
    if (parsed?.status === "declined") return t`Move declined`;
    if (failed || parsed?.status === "error") return t`Move failed`;
    return t`Meeting contents moved`;
  },
  renderFooter: ({ failed, errorText, parsed, toolCallId }) => (
    <>
      <ToolCardFooters failed={failed} errorText={errorText} rawText={null}>
        {parsed?.status === "error" ? (
          <ToolCardFooterError
            text={t`The meeting contents could not be moved.`}
          />
        ) : null}
      </ToolCardFooters>
      <ToolApprovalPanel toolCallId={toolCallId} />
    </>
  ),
});

export const ToolMoveMeetingsToFolder = defineTool({
  icon: <Folder />,
  parseFn: parseMoveOutput,
  isDone: (parsed) => parsed?.status === "ok" || parsed?.status === "partial",
  label: ({ running, failed, parsed }) => {
    if (running) return t`Move meetings — waiting for your review`;
    if (parsed?.status === "declined") return t`Move declined`;
    if (failed || parsed?.status === "error") return t`Move failed`;
    return t`Meetings moved`;
  },
  renderFooter: ({ failed, errorText, parsed, toolCallId }) => (
    <>
      <ToolCardFooters failed={failed} errorText={errorText} rawText={null}>
        {parsed?.status === "error" ? (
          <ToolCardFooterError text={t`The meetings could not be moved.`} />
        ) : null}
      </ToolCardFooters>
      <ToolApprovalPanel toolCallId={toolCallId} />
    </>
  ),
});
