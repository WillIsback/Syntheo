import { json2md } from "@syntheo/editor/markdown";
import {
  commands as templateCommands,
  type Participant,
  type Segment,
  type Session,
  type Transcript,
} from "@syntheo/plugin-template";
import {
  commands as transcriptionCommands,
  type RenderedTranscriptSegment,
} from "@syntheo/plugin-transcription";

import type { TaskArgsMap, TaskArgsMapTransformed, TaskConfig } from ".";
import {
  collectImageReferences,
  type EnhanceImageContext,
  replaceNoteImages,
} from "./enhance-image-references";
import { collectEnhanceImages } from "./enhance-images";
import {
  getMemoTemplateSections,
  isTemplateNewerThanMemo,
} from "./enhance-template-sections";

import { resolveSummaryLanguage } from "~/services/enhancer/summary-language";
import {
  loadSessionContentSnapshot,
  type SessionContentSnapshot,
} from "~/session/content-queries";
import { noteFingerprint } from "~/session/note-fingerprint";
import { formatSessionSourceAppsContext } from "~/session/source-apps";
import {
  decideImageInput,
  imageInputKey,
  parseImageInputSettings,
} from "~/settings/ai/shared/image-input";
import { getStoredAiProvider } from "~/settings/providers";
import type { SettingValues } from "~/settings/schema";
import { parseDictionaryTermsJson } from "~/stt/keywords";
import {
  formatMeetingChatContext,
  loadMeetingChatRecords,
} from "~/stt/meeting-chat-records";
import { getTemplateById } from "~/templates/queries";

type TranscriptMeta = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  memoMd: string;
};

type SegmentPayload = {
  speaker_label: string;
  start_ms: number;
  end_ms: number;
  text: string;
  words: Array<{ text: string; start_ms: number; end_ms: number }>;
};

export const enhanceTransform: Pick<TaskConfig<"enhance">, "transformArgs"> = {
  transformArgs,
};

async function transformArgs(
  args: TaskArgsMap["enhance"],
  settingsValues: SettingValues,
): Promise<TaskArgsMapTransformed["enhance"]> {
  const { sessionId, templateId } = args;
  const snapshot = await loadSessionContentSnapshot(sessionId, {
    includeTranscriptWords: false,
  });
  if (!snapshot) {
    throw new Error(`Session ${sessionId} no longer exists`);
  }

  const meetingChatContext = formatMeetingChatContext(
    await loadMeetingChatRecords(sessionId),
  );
  const noteImages = await collectNoteImages(
    sessionId,
    snapshot,
    await modelReadsImages(settingsValues),
  );
  const sessionContext = getSessionContext(
    snapshot,
    meetingChatContext,
    noteImages.noteMarkdown,
  );
  const templateRecord = await loadTemplate(templateId);
  const preferTemplate = isTemplateNewerThanMemo(
    templateRecord?.updatedAt,
    snapshot.rawHeadingsUpdatedAt || snapshot.rawUpdatedAt,
  );
  const appliedSnapshot =
    snapshot.rawAppliedTemplate?.templateId === templateId
      ? snapshot.rawAppliedTemplate
      : null;
  const memoTemplateSections =
    templateId === snapshot.rawTemplateId
      ? getMemoTemplateSections(snapshot, templateRecord?.sections ?? [], {
          preferTemplate,
          appliedSnapshot,
          templateMissing: !templateRecord,
        })
      : null;
  let template: TaskArgsMapTransformed["enhance"]["template"] = templateRecord
    ? {
        title: templateRecord.title,
        description: templateRecord.description ?? null,
        sections: templateRecord.sections,
      }
    : null;
  if (memoTemplateSections?.length) {
    template = {
      title: templateRecord?.title ?? "Meeting memo",
      description: templateRecord?.description ?? null,
      sections: memoTemplateSections,
    };
  }
  const formatOverride = getFormatOverride(settingsValues, templateId);
  const segments = await getTranscriptSegments(snapshot);
  const transcripts = formatTranscripts(
    segments,
    sessionContext.transcriptsMeta,
  );
  const transcriptTexts = transcripts.flatMap((transcript) =>
    transcript.segments.map((segment) => segment.text),
  );
  const language = await resolveSummaryLanguage(
    settingsValues,
    transcriptTexts,
  );
  localizeAnonymousSpeakers(transcripts, language);
  const templateSectionCount = template?.sections.length ?? 0;
  const policyResult = await templateCommands.summaryLengthPolicy({
    transcript_texts: transcriptTexts,
    template_section_count: templateSectionCount,
  });
  if (policyResult.status === "error") {
    throw new Error(policyResult.error);
  }

  const imageContext = noteImages.images;

  return {
    language,
    formatOverride,
    session: sessionContext.session,
    participants: sessionContext.participants,
    template,
    preMeetingMemo: sessionContext.preMeetingMemo,
    postMeetingMemo: sessionContext.postMeetingMemo,
    transcripts,
    imageContext,
    lengthPolicy: policyResult.data,
    dictionaryTerms: parseDictionaryTermsJson(
      settingsValues.personalization_dictionary_terms,
    ),
    sourceNoteFingerprint: noteFingerprint(
      snapshot.rawContent,
      snapshot.rawContentFormat,
    ),
  };
}

async function loadTemplate(templateId: string | undefined) {
  if (!templateId) {
    return null;
  }

  try {
    return await getTemplateById(templateId);
  } catch (error) {
    console.error("[enhance] failed to load template", error);
    return null;
  }
}

/** Libellé du rendu pour un locuteur sans nom (`crates/transcript/src/label.rs`). */
const ANONYMOUS_SPEAKER = /^Speaker (\d+|[ABC])$/;

/**
 * Le modèle reçoit les locuteurs anonymes dans la langue de la synthèse
 * (issue 699) : la transcription affiche « Locuteur 4 » en français, la
 * synthèse ne doit pas citer « Speaker 4 ». Les noms et « You » ne changent
 * pas ; les données gardent « Speaker N ».
 */
function localizeAnonymousSpeakers(
  transcripts: Transcript[],
  language: string,
): void {
  if (!language.toLowerCase().startsWith("fr")) {
    return;
  }
  for (const transcript of transcripts) {
    for (const segment of transcript.segments) {
      const number = ANONYMOUS_SPEAKER.exec(segment.speaker ?? "")?.[1];
      if (number) {
        segment.speaker = `Locuteur ${number}`;
      }
    }
  }
}

function formatTranscripts(
  segments: SegmentPayload[],
  transcriptsMeta: TranscriptMeta[],
): Transcript[] {
  if (segments.length > 0 && transcriptsMeta.length > 0) {
    const startedAt = transcriptsMeta.reduce(
      (min, transcript) => Math.min(min, transcript.startedAt),
      Number.POSITIVE_INFINITY,
    );
    const endedAt = transcriptsMeta.reduce(
      (max, transcript) =>
        Math.max(max, transcript.endedAt ?? transcript.startedAt),
      Number.NEGATIVE_INFINITY,
    );

    return [
      {
        segments: segments.map((segment): Segment => ({
          speaker: segment.speaker_label,
          text: segment.text,
          startMs: segment.start_ms,
        })),
        startedAt: Number.isFinite(startedAt) ? startedAt : null,
        endedAt: Number.isFinite(endedAt) ? endedAt : null,
        nowMs: null,
      },
    ];
  }

  return [];
}

function getFormatOverride(
  settingsValues: SettingValues,
  templateId: string | undefined,
): string {
  if (templateId) {
    return "";
  }

  const value = settingsValues.auto_summary_prompt;
  return typeof value === "string" && value.trim() ? value : "";
}

function getOptionalSettingsValue(
  settingsValues: SettingValues,
  valueId: "current_llm_provider" | "current_llm_model" | "llm_image_input",
): string | undefined {
  const value = settingsValues[valueId];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Le modèle de synthèse reçoit-il les images (issue 754) ? Le réglage
 * « Le modèle lit les images » du serveur et du modèle choisis : Oui, Non, ou
 * Automatique (résultat de la détection gardé, sinon le nom du modèle).
 */
async function modelReadsImages(
  settingsValues: SettingValues,
): Promise<boolean> {
  const provider = getOptionalSettingsValue(
    settingsValues,
    "current_llm_provider",
  );
  const model = getOptionalSettingsValue(settingsValues, "current_llm_model");
  if (!provider || !model) return false;
  const baseUrl = String(
    (await getStoredAiProvider("llm", provider).catch(() => undefined))
      ?.base_url ?? "",
  );
  const entry = parseImageInputSettings(
    getOptionalSettingsValue(settingsValues, "llm_image_input"),
  )[imageInputKey(baseUrl, model)];
  return decideImageInput(entry, model).reads;
}

/**
 * Images de la note envoyées au modèle, et texte de la note où chaque image
 * est remplacée par une référence lisible (issue 750). Les images sont lues
 * dans le contenu JSON de la note : son Markdown perd l'identifiant de la
 * pièce jointe et n'y laisse que `![]( "char-editor-width=80")`. Une image
 * jointe à la requête devient « [Image N] », N étant son rang parmi les
 * images jointes ; une image non jointe (modèle sans vision, fichier
 * introuvable, budget atteint) devient « [Image] ».
 */
async function collectNoteImages(
  sessionId: string,
  snapshot: SessionContentSnapshot,
  modelReadsImages: boolean,
): Promise<{ images: EnhanceImageContext[]; noteMarkdown: string }> {
  const memoReferences = collectImageReferences(
    snapshot.transcripts[0]?.memo ?? "",
  );
  const noteDoc = parseNoteDoc(snapshot);
  const noteReferences = noteDoc
    ? collectImageReferences(snapshot.rawContent)
    : collectImageReferences(snapshot.rawMarkdown);
  const attached = modelReadsImages
    ? await collectEnhanceImages(sessionId, [
        ...memoReferences,
        ...noteReferences,
      ])
    : [];
  const rankByReference = new Map(
    attached.map(({ index }, rank) => [index, rank + 1]),
  );
  const label = (position: number) => {
    const rank = rankByReference.get(memoReferences.length + position);
    return rank ? `[Image ${rank}]` : "[Image]";
  };
  // Le sérialiseur Markdown échappe les crochets : un repère alphanumérique
  // passe tel quel, puis devient la référence lisible.
  const noteMarkdown = noteDoc
    ? json2md(
        replaceNoteImages(
          noteDoc,
          (position) => `${IMAGE_MARKER}${position}${IMAGE_MARKER}`,
        ) as Parameters<typeof json2md>[0],
      ).replace(IMAGE_MARKER_RE, (_, position: string) =>
        label(Number(position)),
      )
    : snapshot.rawMarkdown;
  return { images: attached.map(({ image }) => image), noteMarkdown };
}

const IMAGE_MARKER = "SYNTHEOIMAGEREF";
const IMAGE_MARKER_RE = new RegExp(`${IMAGE_MARKER}(\\d+)${IMAGE_MARKER}`, "g");

function parseNoteDoc(snapshot: SessionContentSnapshot): unknown {
  if (snapshot.rawContentFormat === "markdown" || !snapshot.rawContent) {
    return null;
  }
  try {
    const doc = JSON.parse(snapshot.rawContent) as unknown;
    return doc && typeof doc === "object" ? doc : null;
  } catch {
    return null;
  }
}

function getSessionContext(
  snapshot: SessionContentSnapshot,
  meetingChatContext: string,
  noteMarkdown: string,
) {
  const transcriptsMeta = snapshot.transcripts.map((transcript) => ({
    id: transcript.id,
    startedAt: transcript.started_at,
    endedAt: transcript.ended_at,
    memoMd: transcript.memo,
  }));

  const meetingSourceContext = formatSessionSourceAppsContext(
    snapshot.sourceApps,
  );
  const supplementalContext = [meetingSourceContext, meetingChatContext]
    .filter((value) => value.trim())
    .join("\n\n");

  return {
    preMeetingMemo: transcriptsMeta[0]?.memoMd ?? "",
    postMeetingMemo: supplementalContext
      ? [noteMarkdown, supplementalContext]
          .filter((value) => value.trim())
          .join("\n\n")
      : noteMarkdown,
    session: getSessionData(snapshot),
    participants: getParticipants(snapshot),
    transcriptsMeta,
  };
}

function getSessionData(snapshot: SessionContentSnapshot): Session {
  return {
    title: snapshot.title || null,
    startedAt: null,
    endedAt: null,
    event: null,
  };
}

function getParticipants(snapshot: SessionContentSnapshot): Participant[] {
  return snapshot.participants
    .filter((participant) => participant.name)
    .map((participant) => ({
      name: participant.name,
      jobTitle: participant.jobTitle || null,
    }));
}

async function getTranscriptSegments(
  snapshot: SessionContentSnapshot,
): Promise<SegmentPayload[]> {
  const result = await transcriptionCommands.renderSessionTranscript({
    session_id: snapshot.sessionId,
    self_human_id: snapshot.ownerUserId || null,
  });
  if (result.status === "error") {
    throw new Error(result.error);
  }
  if (!result.data) {
    return [];
  }

  return result.data.segments.reduce<SegmentPayload[]>((result, segment) => {
    if (segment.words.length > 0) {
      result.push(toSegmentPayload(segment));
    }
    return result;
  }, []);
}

function toSegmentPayload(segment: RenderedTranscriptSegment): SegmentPayload {
  return {
    speaker_label: segment.speaker_label,
    start_ms: segment.start_ms,
    end_ms: segment.end_ms,
    text: segment.text,
    words: segment.words.map((word) => ({
      text: word.text,
      start_ms: word.start_ms,
      end_ms: word.end_ms,
    })),
  };
}
