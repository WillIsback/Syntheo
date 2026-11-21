import { t } from "@lingui/core/macro";
import { Plural, Trans } from "@lingui/react/macro";
import { useState } from "react";

import { Pencil } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";

import { TermList, ToolApprovalPanel } from "./approval";
import { defineTool } from "./define-tool";
import { ToolCardBody, ToolCardFooterError, ToolCardFooters } from "./shared";

import { parseMcpObjectOutput } from "~/chat/mcp/mcp-output-parser";
import { removeDictionaryTerms } from "~/chat/tools/dictionary-terms";

type CorrectionOutput = {
  status?: string;
  message?: string;
  dictionaryChanges?: {
    addedTerms?: string[];
    rejectedTerms?: string[];
    declinedTerms?: string[];
  };
};

function parseCorrectionOutput(output: unknown): CorrectionOutput | null {
  return parseMcpObjectOutput<CorrectionOutput>(output);
}

function DictionaryOutcome({
  changes,
}: {
  changes: NonNullable<CorrectionOutput["dictionaryChanges"]>;
}) {
  const [undo, setUndo] = useState<"idle" | "pending" | "done" | "failed">(
    "idle",
  );
  const added = changes.addedTerms ?? [];
  const rejected = changes.rejectedTerms ?? [];
  if (added.length === 0 && rejected.length === 0) return null;

  return (
    <div className="border-border/80 flex flex-col gap-2 border-t px-3.5 py-2.5">
      {added.length > 0 ? (
        <>
          <p className="text-muted-foreground text-xs">
            {undo === "done" ? (
              <Trans>Removed from your dictionary:</Trans>
            ) : (
              <Trans>Added to your dictionary:</Trans>
            )}
          </p>
          <TermList terms={added} />
          {undo === "done" ? null : (
            <div className="flex items-center justify-end gap-2">
              {undo === "failed" ? (
                <span className="text-destructive text-xs">
                  <Trans>The terms could not be removed.</Trans>
                </span>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={undo === "pending"}
                onClick={() => {
                  setUndo("pending");
                  removeDictionaryTerms(added).then(
                    () => setUndo("done"),
                    () => setUndo("failed"),
                  );
                }}
              >
                <Trans>Undo</Trans>
              </Button>
            </div>
          )}
        </>
      ) : null}
      {rejected.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          <Plural
            value={rejected.length}
            one="# suggested term was ignored: a dictionary term is a short name, without links or formatting."
            other="# suggested terms were ignored: a dictionary term is a short name, without links or formatting."
          />
        </p>
      ) : null}
    </div>
  );
}

export const ToolSessionCorrection = defineTool({
  icon: <Pencil />,
  parseFn: parseCorrectionOutput,
  isDone: (parsed) =>
    parsed?.status === "applied" || parsed?.status === "partial",
  label: ({ running, failed, parsed }) => {
    if (running) return t`Correct the note — waiting for your review`;
    if (failed || parsed?.status === "error") return t`Correction failed`;
    if (parsed?.status === "not_found") return t`Text to correct not found`;
    if (parsed?.status === "declined") return t`Correction declined`;
    return t`Note corrected`;
  },
  renderBody: (input) =>
    typeof input?.oldText === "string" && typeof input?.newText === "string" ? (
      <ToolCardBody>
        <p className="text-muted-foreground text-xs wrap-break-word">
          <del>{input.oldText}</del> →{" "}
          <span className="text-foreground">{input.newText}</span>
        </p>
      </ToolCardBody>
    ) : null,
  renderFooter: ({ failed, errorText, parsed, toolCallId }) => (
    <>
      <ToolCardFooters failed={failed} errorText={errorText} rawText={null}>
        {parsed?.status === "error" && parsed.message ? (
          <ToolCardFooterError text={t`The correction could not be applied.`} />
        ) : null}
      </ToolCardFooters>
      <ToolApprovalPanel toolCallId={toolCallId} />
      {parsed?.dictionaryChanges ? (
        <DictionaryOutcome changes={parsed.dictionaryChanges} />
      ) : null}
    </>
  ),
});
