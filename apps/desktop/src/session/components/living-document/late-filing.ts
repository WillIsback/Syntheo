import { t } from "@lingui/core/macro";
import { useEffect, useRef } from "react";

import { toast } from "@syntheo/ui/components/ui/toast";
import { hasSummaryContent } from "@syntheo/utils/session";

import {
  isMainAITaskHostWindow,
  requestMainEnhance,
} from "~/ai/task-window-sync";
import { loadSessionFolderTemplateId } from "~/folders/folder-template";
import { getEnhancerService } from "~/services/enhancer";
import { loadSessionContentSnapshot } from "~/session/content-queries";
import { useSession } from "~/session/queries";
import { getTemplateById } from "~/templates/queries";

// Rangement tardif (issue 502) : une note déjà synthétisée qui entre dans un
// dossier dont le modèle diffère de celui de sa synthèse. On propose de
// régénérer avec le modèle du dossier ; rien n'est réécrit sans accord, et
// la version remplacée reste dans l'historique des synthèses.

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

export function useLateFilingProposal(sessionId: string) {
  const folderPath = useSession(sessionId)?.folder_id;
  const previous = useRef<{ sessionId: string; folderPath: string } | null>(
    null,
  );

  useEffect(() => {
    if (folderPath === undefined) {
      return;
    }
    const last = previous.current;
    previous.current = { sessionId, folderPath };
    // Seul un changement de dossier pendant que la note est ouverte compte,
    // pas son ouverture.
    if (!last || last.sessionId !== sessionId) {
      return;
    }
    if (last.folderPath === folderPath || !folderPath) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const proposal = await loadLateFilingProposal(sessionId);
      if (cancelled || !proposal) {
        return;
      }
      const template = await getTemplateById(proposal.templateId);
      if (cancelled || !template) {
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
    })().catch((error) => {
      console.error("[late-filing] failed to check the folder template", error);
    });

    return () => {
      cancelled = true;
    };
  }, [folderPath, sessionId]);
}
