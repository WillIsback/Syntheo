import { tool } from "ai";
import { z } from "zod";

import {
  resolveActiveEnhancedNoteId,
  resolveCurrentSessionId,
} from "./current-session";
import {
  type CorrectionTarget,
  type DictionaryChange,
  type SummaryCorrectionPlan,
  type TitleChange,
  type TranscriptCorrectionPlan,
  planSummaryCorrections,
  planTitleCorrection,
  planTranscriptCorrections,
  replaceExact,
  replaceLoosePhrase,
  replaceTranscriptWords,
} from "./session-correction-plan";
import type { ToolDependencies } from "./types";

import { applySessionContentCorrections } from "~/session/content-mutations";
import {
  loadSessionContentSnapshot,
  type SessionContentSnapshot,
} from "~/session/content-queries";
import { updateSettingValue } from "~/settings/queries";
import { normalizeKeywordList, parseDictionaryTermsJson } from "~/stt/keywords";

function dictionaryKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

async function saveDictionaryTerms(
  terms?: string[],
): Promise<DictionaryChange> {
  if (!terms || terms.length === 0) {
    return { addedTerms: [] };
  }

  let addedTerms: string[] = [];
  await updateSettingValue(
    "personalization_dictionary_terms",
    (storedValue) => {
      const currentTerms = parseDictionaryTermsJson(storedValue);
      const currentKeys = new Set(currentTerms.map(dictionaryKey));
      addedTerms = normalizeKeywordList(terms).filter(
        (term) => !currentKeys.has(dictionaryKey(term)),
      );
      return JSON.stringify(
        normalizeKeywordList([...currentTerms, ...addedTerms]),
      );
    },
  );

  return { addedTerms };
}

function shouldEditSummary(target: CorrectionTarget): boolean {
  return target === "summary" || target === "summary_and_transcript";
}

function shouldEditTranscript(target: CorrectionTarget): boolean {
  return target === "transcript" || target === "summary_and_transcript";
}

type CorrectionParams = {
  sessionId?: string;
  target?: CorrectionTarget;
  enhancedNoteId?: string;
  oldText: string;
  newText: string;
  dictionaryTerms?: string[];
};

type CorrectionScope = {
  editSummary: boolean;
  editTranscript: boolean;
  summaryError?: string;
};

type CorrectionPlans = {
  summaryPlan: SummaryCorrectionPlan;
  transcriptPlan: TranscriptCorrectionPlan;
  titleChange: TitleChange | null;
};

function resolveCorrectionEnhancedNoteId(
  params: CorrectionParams,
  deps: Pick<ToolDependencies, "getSessionId" | "getEnhancedNoteId">,
  sessionId: string,
  snapshot: SessionContentSnapshot,
): string | undefined {
  if (params.enhancedNoteId !== undefined) {
    return params.enhancedNoteId;
  }
  if (params.sessionId) {
    return undefined;
  }
  // La vue de l'onglet peut désigner un compte-rendu disparu (id périmé) :
  // on ne la suit que si elle existe encore, sinon on corrige tous les
  // comptes-rendus de la note.
  const viewId = resolveActiveEnhancedNoteId(deps, sessionId);
  return viewId && snapshot.enhancedNotes.some((note) => note.id === viewId)
    ? viewId
    : undefined;
}

function resolveCorrectionScope({
  target,
  enhancedNoteId,
  snapshot,
}: {
  target: CorrectionTarget;
  enhancedNoteId?: string;
  snapshot: SessionContentSnapshot;
}): CorrectionScope {
  const editTranscript = shouldEditTranscript(target);
  const editSummary = shouldEditSummary(target);
  if (!editSummary || !enhancedNoteId) {
    return { editSummary, editTranscript };
  }
  if (snapshot.enhancedNotes.some((note) => note.id === enhancedNoteId)) {
    return { editSummary, editTranscript };
  }
  if (target === "summary") {
    const candidates = snapshot.enhancedNotes
      .map((note) => `"${note.id}"`)
      .join(", ");
    return {
      editSummary: false,
      editTranscript,
      summaryError: `Summary "${enhancedNoteId}" does not belong to session ${snapshot.sessionId}. Retry with one of these enhancedNoteId values, or omit enhancedNoteId: ${candidates}.`,
    };
  }
  return { editSummary: false, editTranscript };
}

function buildCorrectionPlans({
  scope,
  snapshot,
  enhancedNoteId,
  oldText,
  newText,
}: {
  scope: CorrectionScope;
  snapshot: SessionContentSnapshot;
  enhancedNoteId?: string;
  oldText: string;
  newText: string;
}): CorrectionPlans {
  const emptySummaryPlan: SummaryCorrectionPlan = { changes: [], updates: [] };
  const emptyTranscriptPlan: TranscriptCorrectionPlan = {
    changes: [],
    updates: [],
  };
  return {
    summaryPlan: scope.editSummary
      ? planSummaryCorrections({
          notes: snapshot.enhancedNotes,
          enhancedNoteId,
          oldText,
          newText,
        })
      : emptySummaryPlan,
    transcriptPlan: scope.editTranscript
      ? planTranscriptCorrections({
          transcripts: snapshot.transcripts,
          oldText,
          newText,
        })
      : emptyTranscriptPlan,
    titleChange: scope.editSummary
      ? planTitleCorrection({ title: snapshot.title, oldText, newText })
      : null,
  };
}

async function commitCorrectionPlans({
  sessionId,
  snapshot,
  plans,
}: {
  sessionId: string;
  snapshot: SessionContentSnapshot;
  plans: CorrectionPlans;
}): Promise<boolean> {
  try {
    await applySessionContentCorrections({
      sessionId,
      summaries: plans.summaryPlan.updates,
      transcripts: plans.transcriptPlan.updates,
      ...(plans.titleChange
        ? {
            title: {
              currentTitle: snapshot.title,
              nextTitle: plans.titleChange.nextTitle,
            },
          }
        : {}),
    });
    return true;
  } catch (error) {
    console.error("Failed to apply session correction", error);
    return false;
  }
}

function buildMissingTargets({
  scope,
  plans,
}: {
  scope: CorrectionScope;
  plans: CorrectionPlans;
}): CorrectionTarget[] {
  const missing = [
    scope.editSummary &&
    plans.summaryPlan.changes.length === 0 &&
    !plans.titleChange
      ? "summary"
      : null,
    scope.editTranscript && plans.transcriptPlan.changes.length === 0
      ? "transcript"
      : null,
  ];
  return missing.filter(
    (target): target is CorrectionTarget => target !== null,
  );
}

function buildOutcomeMessage({
  missingTargets,
  dictionarySaveFailed,
}: {
  missingTargets: CorrectionTarget[];
  dictionarySaveFailed: boolean;
}): string | undefined {
  const messages = [
    missingTargets.length > 0
      ? `Applied correction where matched, but no matching ${missingTargets.join(" or ")} text was found.`
      : null,
    dictionarySaveFailed
      ? "The correction was applied, but dictionary terms could not be saved."
      : null,
  ].filter((message): message is string => message !== null);
  return messages.length > 0 ? messages.join(" ") : undefined;
}

export const buildApplySessionCorrectionTool = (
  deps: Pick<ToolDependencies, "getSessionId" | "getEnhancedNoteId">,
) =>
  tool({
    description:
      "Apply a correction to a session summary, visible session title, and/or transcript. Use this when the user corrects note content, for example 'it's not X but Y'. Prefer summary_and_transcript for factual meeting corrections unless the user explicitly asks for one target only. Read the note first if you need exact summary text.",
    inputSchema: z.object({
      sessionId: z
        .string()
        .optional()
        .describe(
          "Session ID of the note to edit. Omit to edit the current note (the one marked as current in context). Pass another note's Session ID only when the user asks to edit that note.",
        ),
      target: z
        .enum(["summary", "transcript", "summary_and_transcript"])
        .default("summary_and_transcript")
        .describe(
          "Which session content to correct. Use summary only or transcript only when the user explicitly scopes the correction.",
        ),
      enhancedNoteId: z
        .string()
        .optional()
        .describe(
          "Omit this: the correction applies to the summary the user is viewing, or to every summary of the note. Only pass a summary ID returned by a previous error; never pass a Session ID here.",
        ),
      oldText: z
        .string()
        .min(1)
        .describe("Exact text currently present in the note or transcript."),
      newText: z.string().describe("Replacement text."),
      dictionaryTerms: z
        .array(z.string().min(1))
        .default([])
        .describe(
          "Uncommon names, company/product names, acronyms, or jargon from the correction to save for future transcription. Skip common names.",
        ),
    }),
    execute: async (params: CorrectionParams, options) => {
      const sessionId =
        params.sessionId ?? resolveCurrentSessionId(deps, options);

      if (!sessionId) {
        return {
          status: "error",
          message:
            "No active session selected. Provide sessionId explicitly when calling apply_session_correction.",
        };
      }

      const newText = params.newText.trim();
      if (!newText) {
        return {
          status: "error",
          message: "Replacement text cannot be blank.",
          sessionId,
        };
      }

      const target = params.target ?? "summary_and_transcript";
      const snapshot = await loadSessionContentSnapshot(sessionId);
      if (!snapshot) {
        return {
          status: "error",
          message: "The target session could not be loaded.",
          sessionId,
        };
      }
      const enhancedNoteId = resolveCorrectionEnhancedNoteId(
        params,
        deps,
        sessionId,
        snapshot,
      );

      const scope = resolveCorrectionScope({
        target,
        enhancedNoteId,
        snapshot,
      });
      if (scope.summaryError) {
        return {
          status: "error",
          code: "summary_not_in_session",
          message: scope.summaryError,
          sessionId,
        };
      }

      const plans = buildCorrectionPlans({
        scope,
        snapshot,
        enhancedNoteId,
        oldText: params.oldText,
        newText,
      });

      if (
        plans.summaryPlan.changes.length === 0 &&
        plans.transcriptPlan.changes.length === 0 &&
        !plans.titleChange
      ) {
        return {
          status: "not_found",
          message:
            "No exact match found. Read the note and call apply_session_correction with the exact current text.",
          sessionId,
        };
      }

      const committed = await commitCorrectionPlans({
        sessionId,
        snapshot,
        plans,
      });
      if (!committed) {
        return {
          status: "error",
          message:
            "The note changed before the correction could be committed. Read the note and retry.",
          sessionId,
        };
      }

      let dictionaryChanges: DictionaryChange = { addedTerms: [] };
      let dictionarySaveFailed = false;
      try {
        dictionaryChanges = await saveDictionaryTerms(params.dictionaryTerms);
      } catch (error) {
        dictionarySaveFailed = true;
        console.error("Failed to save correction dictionary terms", error);
      }

      const missingTargets = buildMissingTargets({ scope, plans });
      return {
        status: missingTargets.length > 0 ? "partial" : "applied",
        message: buildOutcomeMessage({ missingTargets, dictionarySaveFailed }),
        sessionId,
        summaryChanges: plans.summaryPlan.changes,
        transcriptChanges: plans.transcriptPlan.changes,
        titleChange: plans.titleChange,
        dictionaryChanges,
      };
    },
  });

export const sessionCorrectionTestInternals = {
  planSummaryCorrections,
  planTranscriptCorrections,
  planTitleCorrection,
  replaceExact,
  replaceLoosePhrase,
  replaceTranscriptWords,
};
