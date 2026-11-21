import { Plural, Trans } from "@lingui/react/macro";
import { useState } from "react";

import { Button } from "@syntheo/ui/components/ui/button";

import {
  type ToolApproval,
  usePendingToolApprovalStore,
} from "~/chat/tools/pending-tool-approval-store";

// Validation des outils du chat qui modifient des réunions (issues 643 et
// 644) : ce que l'outil s'apprête à faire, puis appliquer ou refuser. Rien
// n'est modifié avant le clic.

export function TermList({ terms }: { terms: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {terms.map((term) => (
        <li
          key={term}
          className="bg-muted text-foreground rounded px-1.5 py-0.5 text-xs"
        >
          {term}
        </li>
      ))}
    </ul>
  );
}

function CorrectionDetails({
  approval,
  addTerms,
  setAddTerms,
}: {
  approval: Extract<ToolApproval, { kind: "session_correction" }>;
  addTerms: boolean;
  setAddTerms: (value: boolean) => void;
}) {
  return (
    <>
      {approval.otherNote ? (
        <p className="text-destructive text-xs font-medium">
          <Trans>
            This correction changes another note: {approval.sessionTitle}
          </Trans>
        </p>
      ) : null}
      <ul className="text-muted-foreground list-disc pl-4 text-xs">
        {approval.summaries > 0 ? (
          <li>
            <Plural
              value={approval.summaries}
              one="# summary"
              other="# summaries"
            />
          </li>
        ) : null}
        {approval.transcriptReplacements > 0 ? (
          <li>
            <Plural
              value={approval.transcriptReplacements}
              one="# change in the transcript"
              other="# changes in the transcript"
            />
          </li>
        ) : null}
        {approval.title ? (
          <li>
            <Trans>The note title</Trans>
          </li>
        ) : null}
      </ul>
      {approval.dictionaryTerms.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={addTerms}
              onChange={(event) => setAddTerms(event.target.checked)}
            />
            <Trans>Also add these terms to your dictionary</Trans>
          </label>
          <TermList terms={approval.dictionaryTerms} />
        </div>
      ) : null}
    </>
  );
}

export function ToolApprovalPanel({ toolCallId }: { toolCallId: string }) {
  const approval = usePendingToolApprovalStore((state) =>
    state.approvals.get(toolCallId),
  );
  const [addTerms, setAddTerms] = useState(true);
  if (!approval) return null;

  const resolve = (approved: boolean) =>
    usePendingToolApprovalStore.getState().resolveApproval(toolCallId, {
      approved,
      ...(approval.kind === "session_correction"
        ? { addDictionaryTerms: approved && addTerms }
        : {}),
    });

  return (
    <div className="border-border/80 flex flex-col gap-2 border-t px-3.5 py-2.5">
      {approval.kind === "session_correction" ? (
        <CorrectionDetails
          approval={approval}
          addTerms={addTerms}
          setAddTerms={setAddTerms}
        />
      ) : null}
      {approval.kind === "move_meeting_contents" ? (
        <p className="text-muted-foreground text-xs">
          <Trans>
            Move the recording, transcript, summaries and notes of “
            {approval.sourceTitle}” to “{approval.targetTitle}”.
          </Trans>
        </p>
      ) : null}
      {approval.kind === "move_meetings_to_folder" ? (
        <div className="text-muted-foreground flex flex-col gap-1 text-xs">
          <p>
            {approval.folderPath ? (
              <Plural
                value={approval.meetingCount}
                one="Move # meeting to this folder:"
                other="Move # meetings to this folder:"
              />
            ) : (
              <Plural
                value={approval.meetingCount}
                one="Remove # meeting from its folder:"
                other="Remove # meetings from their folder:"
              />
            )}
          </p>
          {approval.folderPath ? (
            <p className="text-foreground font-medium">{approval.folderPath}</p>
          ) : null}
          <ul className="list-disc pl-4">
            {approval.meetingTitles.map((title, index) => (
              <li key={`${index}-${title}`}>{title}</li>
            ))}
            {approval.meetingCount > approval.meetingTitles.length ? (
              <li>
                <Plural
                  value={approval.meetingCount - approval.meetingTitles.length}
                  one="and # other"
                  other="and # others"
                />
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => resolve(false)}
        >
          <Trans>Decline</Trans>
        </Button>
        <Button type="button" size="sm" onClick={() => resolve(true)}>
          <Trans>Apply</Trans>
        </Button>
      </div>
    </div>
  );
}
