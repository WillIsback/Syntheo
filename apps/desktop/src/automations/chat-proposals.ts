import { create } from "zustand";

import type { WorkflowStep } from "./steps";
import { mutateAutomationWorkflows } from "./workflows";

import { id } from "~/shared/utils";

// Étapes avancées (webhook, commande) proposées par le chat de l'éditeur. Les
// outils du chat ne les écrivent jamais dans l'automatisation : ils déposent
// une proposition ici, que l'éditeur affiche dans une carte. Seul le bouton
// « Ajouter l'étape » de cette carte (`confirmAdvancedStep`) l'insère.

export type AdvancedStepProposal = {
  id: string;
  workflowId: string;
  step: WorkflowStep;
  /** Index visé dans `workflow.steps` (0 pour l'étape 2). */
  index: number;
  /** Étape existante remplacée, quand le chat modifie une étape. */
  replacesStepId?: string;
};

interface AdvancedStepProposalsState {
  proposals: AdvancedStepProposal[];
}

export const useAdvancedStepProposals = create<AdvancedStepProposalsState>(
  () => ({ proposals: [] }),
);

export function proposeAdvancedStep(
  proposal: Omit<AdvancedStepProposal, "id">,
): AdvancedStepProposal {
  const created = { ...proposal, id: id() };
  useAdvancedStepProposals.setState((state) => ({
    // Une nouvelle proposition pour la même étape remplace l'ancienne.
    proposals: [
      ...state.proposals.filter(
        (item) =>
          item.workflowId !== proposal.workflowId ||
          item.step.id !== proposal.step.id,
      ),
      created,
    ],
  }));
  return created;
}

export function pendingProposals(workflowId: string): AdvancedStepProposal[] {
  return useAdvancedStepProposals
    .getState()
    .proposals.filter((proposal) => proposal.workflowId === workflowId);
}

export function useWorkflowProposals(
  workflowId: string,
): AdvancedStepProposal[] {
  const proposals = useAdvancedStepProposals((state) => state.proposals);
  return proposals.filter((proposal) => proposal.workflowId === workflowId);
}

function take(proposalId: string): AdvancedStepProposal | undefined {
  const proposal = useAdvancedStepProposals
    .getState()
    .proposals.find((item) => item.id === proposalId);
  useAdvancedStepProposals.setState((state) => ({
    proposals: state.proposals.filter((item) => item.id !== proposalId),
  }));
  return proposal;
}

export function rejectAdvancedStep(proposalId: string): void {
  take(proposalId);
}

/**
 * Action de l'utilisateur dans l'éditeur : insère l'étape proposée.
 * L'automatisation reste désactivée ; l'utilisateur l'active lui-même.
 */
export async function confirmAdvancedStep(proposalId: string): Promise<void> {
  const proposal = take(proposalId);
  if (!proposal) {
    return;
  }
  await mutateAutomationWorkflows((workflows) =>
    workflows.map((workflow) => {
      if (workflow.id !== proposal.workflowId) {
        return workflow;
      }
      const steps = [...workflow.steps];
      const replaced = proposal.replacesStepId
        ? steps.findIndex((step) => step.id === proposal.replacesStepId)
        : -1;
      if (replaced >= 0) {
        steps[replaced] = proposal.step;
      } else if (!steps.some((step) => step.id === proposal.step.id)) {
        steps.splice(Math.min(proposal.index, steps.length), 0, proposal.step);
      }
      return { ...workflow, steps, enabled: false };
    }),
  );
}
