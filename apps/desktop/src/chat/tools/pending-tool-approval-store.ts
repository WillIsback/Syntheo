import { create } from "zustand";

// Outils du chat qui modifient des réunions (issues 643 et 644) : rien n'est
// modifié avant que l'utilisateur valide, dans la carte de l'outil, ce que
// l'outil s'apprête à faire.

export type ToolApprovalDecision = {
  approved: boolean;
  /** Correction : ajouter aussi les termes proposés au dictionnaire. */
  addDictionaryTerms?: boolean;
};

export type ToolApprovalDetails =
  | {
      kind: "session_correction";
      /** Titre de la note corrigée. */
      sessionTitle: string;
      /** La note corrigée n'est pas la note ouverte. */
      otherNote: boolean;
      oldText: string;
      newText: string;
      summaries: number;
      transcriptReplacements: number;
      title: boolean;
      dictionaryTerms: string[];
    }
  | {
      kind: "move_meeting_contents";
      sourceTitle: string;
      targetTitle: string;
    }
  | {
      kind: "move_meetings_to_folder";
      folderPath: string;
      meetingTitles: string[];
      meetingCount: number;
    };

export type ToolApproval = ToolApprovalDetails & {
  requestId: string;
  resolve: (decision: ToolApprovalDecision) => void;
};

type PendingToolApprovalStore = {
  approvals: Map<string, ToolApproval>;
  addApproval: (approval: ToolApproval) => void;
  resolveApproval: (requestId: string, decision: ToolApprovalDecision) => void;
};

export const usePendingToolApprovalStore = create<PendingToolApprovalStore>(
  (set, get) => ({
    approvals: new Map(),
    addApproval: (approval) => {
      set((state) => {
        const next = new Map(state.approvals);
        next.set(approval.requestId, approval);
        return { approvals: next };
      });
    },
    resolveApproval: (requestId, decision) => {
      const approval = get().approvals.get(requestId);
      if (!approval) return;
      set((state) => {
        const next = new Map(state.approvals);
        next.delete(requestId);
        return { approvals: next };
      });
      approval.resolve(decision);
    },
  }),
);

export function requestToolApproval(
  requestId: string,
  details: ToolApprovalDetails,
  abortSignal?: AbortSignal,
): Promise<ToolApprovalDecision> {
  return new Promise((resolve) => {
    if (abortSignal?.aborted) {
      resolve({ approved: false });
      return;
    }
    // Chat arrêté : la demande disparaît, rien n'est modifié.
    abortSignal?.addEventListener(
      "abort",
      () =>
        usePendingToolApprovalStore
          .getState()
          .resolveApproval(requestId, { approved: false }),
      { once: true },
    );
    usePendingToolApprovalStore
      .getState()
      .addApproval({ ...details, requestId, resolve });
  });
}
