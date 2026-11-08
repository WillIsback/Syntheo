import { md2json } from "@syntheo/editor/markdown";
import { beginCloudsyncActivity } from "@syntheo/plugin-db";
import { commands as localApiCommands } from "@syntheo/plugin-local-api";
import { commands as templateCommands } from "@syntheo/plugin-template";

import { createTaskId, type TaskConfig, type TaskId } from ".";
import {
  getPersistableGeneratedTitle,
  persistGeneratedTitle,
} from "./title-success";
import { TITLE_GENERATION_TIMEOUT_MS } from "./title-workflow";

import { runNoteEnhancedAutomations } from "~/automations/engine";
import { releaseCloudsyncActivityEventually } from "~/db/cloudsync-activity";
import { retryDatabaseLock } from "~/db/retry";
import { showSummaryReadyNotification } from "~/services/enhancer/summary-notification";
import {
  extractNoteLines,
  prepareNotes,
  validateNotePassage,
} from "~/session/components/living-document/note-attribution";
import { persistGeneratedEnhancedNote } from "~/session/content-mutations";
import { loadSessionContentSnapshot } from "~/session/content-queries";
import { extractNoteMarks } from "~/session/note-marks";
import { requestAppAttention } from "~/shared/app-attention";
import { playCompletionSound } from "~/shared/completion-sound";
import { id } from "~/shared/utils";
import type { TaskState } from "~/store/zustand/ai-task/tasks";
import { hasLiveSessionTitleDraft } from "~/store/zustand/live-title";

type EnhanceSuccessParams = Parameters<
  NonNullable<TaskConfig<"enhance">["onSuccess"]>
>[0] & {
  onPersisted?: () => void;
};

export const runEnhanceSuccess = async ({
  text,
  taskId,
  args,
  transformedArgs,
  model,
  startTask,
  getTaskState,
  signal,
  onPersisted,
}: EnhanceSuccessParams) => {
  // Issue 417 : les balises de provenance sont retirées ici, avant toute
  // autre étape ; plus rien en aval (titre, étiquettes, synthèse enregistrée,
  // export, copie, chat, MCP, CLI, sync de fichiers) ne les voit.
  const marked = extractNoteMarks(text);
  const preparedResult = await templateCommands.prepareGeneratedSummary({
    text: marked.text,
    tag_sources: [
      transformedArgs.preMeetingMemo,
      transformedArgs.postMeetingMemo,
      transformedArgs.template?.title,
      transformedArgs.template?.description,
      ...(transformedArgs.template?.sections ?? []).flatMap((section) => [
        section.title,
        section.description,
      ]),
    ].filter((source): source is string => typeof source === "string"),
  });
  if (preparedResult.status === "error") {
    throw new Error(preparedResult.error);
  }
  if (!preparedResult.data) {
    return;
  }

  const { text: preparedText, tag_names: tagNames } = preparedResult.data;
  const textWithTags = preparedResult.data.text_with_tags;
  const cloudsyncLeaseKey = `${taskId}:${id()}`;
  const initialSnapshot = await loadSessionContentSnapshot(args.sessionId);
  if (!initialSnapshot) {
    throw new Error(`Session ${args.sessionId} no longer exists`);
  }
  const notePassages = backedNotePassages(
    marked.passages,
    initialSnapshot.rawContent,
    initialSnapshot.rawContentFormat,
  );

  let trimmedTitle = initialSnapshot.title.trim();
  let generatedTitle = "";
  let shouldPersistGeneratedTitle = false;

  if (!trimmedTitle && !hasLiveSessionTitleDraft(args.sessionId)) {
    const titleTaskId = createTaskId(args.sessionId, "title");

    // A title already running comes from another run for this session (an
    // aborted earlier summary, or a sibling summary): its partial text is not
    // a title, so wait for it to end and reuse its result only if it is one.
    if (getTaskState(titleTaskId)?.status === "generating") {
      const titleTask = await waitForTitleTask(
        titleTaskId,
        getTaskState,
        signal,
      );
      if (titleTask?.status === "success") {
        generatedTitle = getPersistableGeneratedTitle(titleTask.streamedText);
      }
    }

    // A finished title task belongs to an earlier summary; regenerate so the
    // title reflects the new content.
    if (!generatedTitle && !signal.aborted) {
      await startTask(titleTaskId, {
        model,
        taskType: "title",
        args: {
          sessionId: args.sessionId,
          enhancedNote: textWithTags,
          skipPersist: true,
        },
        onComplete: (title) => {
          generatedTitle = getPersistableGeneratedTitle(title);
        },
      });
    }

    if (signal.aborted) {
      return;
    }

    if (!generatedTitle) {
      reportMissingTitle(getTaskState(titleTaskId));
    }
  }

  await beginCloudsyncActivity("enhance", cloudsyncLeaseKey);
  try {
    const snapshot = await loadSessionContentSnapshot(args.sessionId);
    if (!snapshot) {
      throw new Error(`Session ${args.sessionId} no longer exists`);
    }
    const note = snapshot.enhancedNotes.find(
      (candidate) => candidate.id === args.enhancedNoteId,
    );
    if (!note) {
      throw new Error(`Summary ${args.enhancedNoteId} no longer exists`);
    }

    trimmedTitle = snapshot.title.trim();
    if (
      !trimmedTitle &&
      !hasLiveSessionTitleDraft(args.sessionId) &&
      generatedTitle
    ) {
      trimmedTitle = generatedTitle;
      shouldPersistGeneratedTitle = true;
    }

    const composedResult = await templateCommands.composeGeneratedSummary({
      text: preparedText,
      title: trimmedTitle || null,
      tag_names: tagNames,
    });
    if (composedResult.status === "error") {
      throw new Error(composedResult.error);
    }
    // A reset/regenerate aborts this run; a stale run that persisted anyway
    // would overwrite the replacement's summary with old content.
    if (signal.aborted) {
      return;
    }

    const persistableText = composedResult.data;
    await retryDatabaseLock(() => {
      if (signal.aborted) {
        return Promise.resolve();
      }

      return persistGeneratedEnhancedNote({
        sessionId: args.sessionId,
        ownerUserId: snapshot.ownerUserId,
        note: {
          id: note.id,
          currentContent: args.pendingAutoEnhance?.expectedBody ?? note.content,
          currentContentFormat:
            args.pendingAutoEnhance?.expectedContentFormat ??
            note.contentFormat,
          nextContent: JSON.stringify(md2json(persistableText)),
        },
        tagNames,
        notePassages,
        ...(transformedArgs.sourceNoteFingerprint
          ? { sourceNoteFingerprint: transformedArgs.sourceNoteFingerprint }
          : {}),
        ...(args.pendingAutoEnhance
          ? { pendingAutoEnhance: args.pendingAutoEnhance }
          : {}),
      }).then(onPersisted);
    });

    if (shouldPersistGeneratedTitle && !signal.aborted) {
      await persistGeneratedTitle({
        text: generatedTitle,
        args: { sessionId: args.sessionId },
      });
    }

    if (!signal.aborted) {
      void localApiCommands
        .dispatchEvent("note.enhanced", args.sessionId)
        .catch((error) =>
          console.error(
            "[enhancer] failed to dispatch note.enhanced event",
            error,
          ),
        );
      void runNoteEnhancedAutomations(args.sessionId);
      void showSummaryReadyNotification(args.sessionId, trimmedTitle);
      void playCompletionSound();
      void requestAppAttention();
    }
  } finally {
    await releaseCloudsyncActivityEventually("enhance", cloudsyncLeaseKey);
  }
};

// Contrôle déterministe à la réception : une balise que la note brute
// n'appuie pas est rejetée, son passage restera noir. `null` (aucune balise)
// laisse l'affichage se replier sur les fragments venus des notes.
function backedNotePassages(
  passages: string[] | null,
  rawContent: string,
  rawContentFormat: string,
): string[] | null {
  if (passages === null) return null;
  let rawJson = rawContent;
  if (rawContentFormat === "markdown") {
    try {
      rawJson = JSON.stringify(md2json(rawContent));
    } catch {
      rawJson = "";
    }
  }
  const notes = prepareNotes(extractNoteLines(rawJson));
  return passages.filter((passage) => validateNotePassage(passage, notes));
}

const TITLE_WAIT_POLL_MS = 250;
// The running title task fails at its own deadline; this margin only guards
// against a task that never settles.
const TITLE_WAIT_TIMEOUT_MS = TITLE_GENERATION_TIMEOUT_MS + 5_000;

async function waitForTitleTask(
  titleTaskId: TaskId<"title">,
  getTaskState: EnhanceSuccessParams["getTaskState"],
  signal: AbortSignal,
): Promise<TaskState<"title"> | undefined> {
  const deadline = Date.now() + TITLE_WAIT_TIMEOUT_MS;
  let titleTask = getTaskState(titleTaskId);
  while (
    titleTask?.status === "generating" &&
    !signal.aborted &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, TITLE_WAIT_POLL_MS));
    titleTask = getTaskState(titleTaskId);
  }
  return titleTask;
}

// app.log keeps only the code label (and an error's name and code), never the
// note: the label alone tells why the session stayed untitled.
function reportMissingTitle(titleTask: TaskState<"title"> | undefined) {
  if (titleTask?.status === "error") {
    console.warn(
      "[enhancer:title-failed] title generation failed",
      titleTask.error,
    );
  } else if (titleTask?.status === "success") {
    console.warn("[enhancer:title-empty] title generation returned no title");
  } else {
    console.warn("[enhancer:title-skipped] title generation did not finish");
  }
}

export const enhanceSuccess: Pick<TaskConfig<"enhance">, "onSuccess"> = {
  onSuccess: runEnhanceSuccess,
};
