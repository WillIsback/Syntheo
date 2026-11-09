import { Trans } from "@lingui/react/macro";
import { useState } from "react";

import { Warning } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";

import {
  type AdvancedStepProposal,
  confirmAdvancedStep,
  rejectAdvancedStep,
  useWorkflowProposals,
} from "~/automations/chat-proposals";
import type { AutomationLabels } from "~/automations/labels";

// Carte de confirmation d'une étape avancée proposée par le chat : rien n'est
// ajouté tant que l'utilisateur n'a pas cliqué « Ajouter l'étape ».
export function AdvancedStepProposals({
  workflowId,
  labels,
}: {
  workflowId: string;
  labels: AutomationLabels;
}) {
  const proposals = useWorkflowProposals(workflowId);
  if (proposals.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3 px-5 pt-5">
      {proposals.map((proposal) => (
        <AdvancedStepProposalCard
          key={proposal.id}
          proposal={proposal}
          labels={labels}
        />
      ))}
    </div>
  );
}

export function AdvancedStepProposalCard({
  proposal,
  labels,
}: {
  proposal: AdvancedStepProposal;
  labels: AutomationLabels;
}) {
  const [pending, setPending] = useState(false);
  const { step } = proposal;
  const number = proposal.index + 2;
  const title = labels.step[step.type].title;

  return (
    <section
      role="alertdialog"
      aria-labelledby={`proposal-${proposal.id}`}
      className="border-chart-4/40 bg-chart-4/5 flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="flex items-start gap-3">
        <Warning className="text-chart-4 mt-0.5 shrink-0" size={16} />
        <div className="flex min-w-0 flex-col gap-1">
          <h4 id={`proposal-${proposal.id}`} className="text-sm font-medium">
            {proposal.replacesStepId ? (
              <Trans>
                The chat suggests changing step {number}: {title}
              </Trans>
            ) : (
              <Trans>
                The chat suggests adding step {number}: {title}
              </Trans>
            )}
          </h4>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {step.type === "webhook" ? (
              <Trans>
                This advanced step sends the note's data outside your computer,
                to this address. It is only added if you confirm.
              </Trans>
            ) : (
              <Trans>
                This advanced step runs a program on your computer. It is only
                added if you confirm.
              </Trans>
            )}
          </p>
          <code className="bg-muted mt-1 block rounded-md px-2 py-1 text-xs break-all">
            {step.type === "webhook"
              ? step.url
              : step.type === "command"
                ? [step.program, ...step.args].join(" ")
                : null}
          </code>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => rejectAdvancedStep(proposal.id)}
        >
          <Trans>Decline</Trans>
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void confirmAdvancedStep(proposal.id).finally(() =>
              setPending(false),
            );
          }}
        >
          {proposal.replacesStepId ? (
            <Trans>Apply the change</Trans>
          ) : (
            <Trans>Add the step</Trans>
          )}
        </Button>
      </div>
    </section>
  );
}
