import { t } from "@lingui/core/macro";

import { toast } from "@syntheo/ui/components/ui/toast";
import { hasSummaryContent } from "@syntheo/utils/session";

import {
  isMainAITaskHostWindow,
  requestMainEnhance,
} from "~/ai/task-window-sync";
import { loadSessionFolderTemplateId } from "~/folders/folder-template";
import { getEnhancerService } from "~/services/enhancer";
import { loadSessionContentSnapshot } from "~/session/content-queries";
import { getTemplateById } from "~/templates/queries";

// Rangement tardif (issue 502) : une note déjà synthétisée qui entre dans un
// dossier dont le modèle diffère de celui de sa synthèse. On propose de
// régénérer avec le modèle du dossier ; rien n'est réécrit sans accord, et
// la version remplacée reste dans l'historique des synthèses.
//
// Issue 534 : la proposition part du changement de dossier lui-même
// (`updateSession`, ~/session/queries/sessions.ts), et non plus d'un effet du
// document ouvert. Sélecteur de dossier de l'en-tête, « Ranger » de l'accueil,
// dossier choisi en Préparer, suggestion après la réunion et chat passent
// tous par là, que la note soit ouverte ou non.

export type LateFilingSummary = {
  id: string;
  templateId: string;
  position: number;
  hasContent: boolean;
};

export type LateFilingProposal = {
  templateId: string;
  targetNoteId: string;
};

export function decideLateFilingProposal({
  noteTemplateId,
  folderTemplateId,
  summaries,
}: {
  noteTemplateId: string;
  folderTemplateId: string | undefined;
  summaries: readonly LateFilingSummary[];
}): LateFilingProposal | null {
  // Un modèle choisi sur la note passe avant celui du dossier.
  if (noteTemplateId || !folderTemplateId) {
    return null;
  }
  const written = summaries
    .filter((summary) => summary.hasContent)
    .sort((left, right) => left.position - right.position);
  const target = written[0];
  if (!target) {
    return null;
  }
  if (written.some((summary) => summary.templateId === folderTemplateId)) {
    return null;
  }
  return { templateId: folderTemplateId, targetNoteId: target.id };
}

async function loadLateFilingProposal(
  sessionId: string,
): Promise<LateFilingProposal | null> {
  const [snapshot, folderTemplateId] = await Promise.all([
    loadSessionContentSnapshot(sessionId, { includeTranscriptWords: false }),
    loadSessionFolderTemplateId(sessionId),
  ]);
  if (!snapshot) {
    return null;
  }
  return decideLateFilingProposal({
    noteTemplateId: snapshot.rawTemplateId,
    folderTemplateId,
    summaries: snapshot.enhancedNotes.map((note) => ({
      id: note.id,
      templateId: note.templateId,
      position: note.position,
      hasContent: hasSummaryContent(note.content, snapshot.title),
    })),
  });
}

function regenerate(
  sessionId: string,
  proposal: LateFilingProposal,
  templateTitle: string,
) {
  const opts = {
    templateId: proposal.templateId,
    targetNoteId: proposal.targetNoteId,
    templateTitle,
  };
  if (!isMainAITaskHostWindow()) {
    void requestMainEnhance(sessionId, opts);
    return;
  }
  void Promise.resolve(getEnhancerService()?.enhance(sessionId, opts)).catch(
    (error) => {
      console.error("[late-filing] failed to regenerate the summary", error);
    },
  );
}

export async function proposeLateFiling(sessionId: string): Promise<void> {
  const proposal = await loadLateFilingProposal(sessionId);
  if (!proposal) {
    return;
  }
  const template = await getTemplateById(proposal.templateId);
  if (!template) {
    return;
  }
  const title = template.title.trim() || t`Untitled`;
  toast(t`This folder uses the ${title} template`, {
    id: `late-filing-${sessionId}`,
    description: t`Regenerate the summary with this template? The current version stays in the history.`,
    duration: 15_000,
    action: {
      label: t`Regenerate`,
      onClick: () => regenerate(sessionId, proposal, title),
    },
  });
}
