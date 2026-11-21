import { create } from "zustand";

// Termes que le chat propose d'ajouter au dictionnaire (issue 643) : rien
// n'est enregistré avant que l'utilisateur les accepte dans la carte de
// l'outil.
type PendingDictionaryApproval = {
  requestId: string;
  terms: string[];
  resolve: (approved: boolean) => void;
};

type PendingDictionaryStore = {
  approvals: Map<string, PendingDictionaryApproval>;
  addApproval: (approval: PendingDictionaryApproval) => void;
  resolveApproval: (requestId: string, approved: boolean) => void;
};

export const usePendingDictionaryStore = create<PendingDictionaryStore>(
  (set, get) => ({
    approvals: new Map(),
    addApproval: (approval) => {
      set((state) => {
        const next = new Map(state.approvals);
        next.set(approval.requestId, approval);
        return { approvals: next };
      });
    },
    resolveApproval: (requestId, approved) => {
      const approval = get().approvals.get(requestId);
      if (!approval) return;
      set((state) => {
        const next = new Map(state.approvals);
        next.delete(requestId);
        return { approvals: next };
      });
      approval.resolve(approved);
    },
  }),
);

export function requestDictionaryApproval(
  requestId: string,
  terms: string[],
): Promise<boolean> {
  return new Promise((resolve) => {
    usePendingDictionaryStore
      .getState()
      .addApproval({ requestId, terms, resolve });
  });
}
