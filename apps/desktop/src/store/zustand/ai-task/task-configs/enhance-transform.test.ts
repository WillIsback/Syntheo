import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enhanceTransform } from "./enhance-transform";

import { noteFingerprint } from "~/session/note-fingerprint";
import { assertCanonicalTemplateSections } from "~/templates/codec";

const mocks = vi.hoisted(() => ({
  collectEnhanceImageContext: vi.fn(),
  getTemplateById: vi.fn(),
  formatMeetingChatContext: vi.fn(),
  loadMeetingChatRecords: vi.fn(),
  loadSessionContentSnapshot: vi.fn(),
  renderSessionTranscript: vi.fn(),
  dominantLanguage: vi.fn(),
  summaryLengthPolicy: vi.fn(),
}));

vi.mock("./enhance-images", () => ({
  collectEnhanceImageContext: mocks.collectEnhanceImageContext,
}));

vi.mock("~/templates/queries", () => ({
  getTemplateById: mocks.getTemplateById,
}));

vi.mock("~/session/content-queries", () => ({
  loadSessionContentSnapshot: mocks.loadSessionContentSnapshot,
}));

vi.mock("@syntheo/plugin-transcription", () => ({
  commands: { renderSessionTranscript: mocks.renderSessionTranscript },
}));

vi.mock("@syntheo/plugin-template", () => ({
  commands: {
    dominantLanguage: mocks.dominantLanguage,
    summaryLengthPolicy: mocks.summaryLengthPolicy,
  },
}));

vi.mock("~/stt/meeting-chat-records", () => ({
  formatMeetingChatContext: mocks.formatMeetingChatContext,
  loadMeetingChatRecords: mocks.loadMeetingChatRecords,
}));

function createSnapshot() {
  return {
    sessionId: "session-1",
    ownerUserId: "user-1",
    title: "Weekly Review",
    createdAt: "2026-07-10T00:00:00.000Z",
    event: null,
    sourceApps: [],
    eventId: null,
    rawNoteId: "session-1",
    rawTemplateId: "",
    rawUpdatedAt: "",
    rawHeadingsUpdatedAt: "",
    rawAppliedTemplate: null,
    rawContent: "![post](asset://localhost/post.png)",
    rawContentFormat: "markdown",
    rawMarkdown: "![post](asset://localhost/post.png)",
    enhancedNotes: [],
    transcripts: [
      {
        id: "transcript-1",
        started_at: 100,
        ended_at: 200,
        memo: "![pre](asset://localhost/pre.png)",
        wordsJson: "[]",
        words: [],
        speaker_hints: [],
      },
    ],
    participants: [{ humanId: "human-1", name: "Alice", jobTitle: "Engineer" }],
  };
}

const settingsValues = { ai_language: "en" } as const;

function docWithHeadings(...titles: string[]) {
  return JSON.stringify({
    type: "doc",
    content: titles.flatMap((title) => [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: title }],
      },
      { type: "paragraph" },
    ]),
  });
}

async function runTransform(
  snapshotOverrides: Record<string, unknown>,
  template: unknown,
) {
  mocks.loadSessionContentSnapshot.mockResolvedValue({
    ...createSnapshot(),
    ...snapshotOverrides,
  });
  mocks.getTemplateById.mockResolvedValue(template);
  return enhanceTransform.transformArgs(
    {
      sessionId: "session-1",
      enhancedNoteId: "note-1",
      templateId: "template-1",
    },
    settingsValues,
  );
}

// Génération sans modèle choisi, avec des réglages ajoutés aux défauts.
function transformWithoutTemplate(settings: Record<string, unknown> = {}) {
  return enhanceTransform.transformArgs(
    { sessionId: "session-1", enhancedNoteId: "note-1" },
    { ...settingsValues, ...settings },
  );
}

type Section = [title: string, description: string];

const TLDR: Section = ["TL;DR", "One-sentence overview"];
const ONE_ON_ONE: Section[] = [
  ["Updates", "Recent changes"],
  ["Action Items", "Follow-ups"],
];
const WITH_TLDR: Section[] = [TLDR, ...ONE_ON_ONE];
const SCRUM: Section[] = [
  TLDR,
  ["Updates & Discussions", "Updates"],
  ["Done", "Done"],
  ["In Progress", "In progress"],
  ["To do", "To do"],
];
const SCRUM_MEMO = [
  "Custom",
  "Updates & Discussions",
  "Done",
  "In Progress",
  "To do",
];
const SCRUM_TITLES = [
  "TL;DR",
  "Updates & Discussions",
  "Done",
  "In Progress",
  "To do",
  "Custom",
];
const SPRINT: Section[] = [
  TLDR,
  ["Previous Sprint & Updates", "Updates"],
  ["Next Sprint Goal", "Goal"],
  ["To do", "To do"],
];
const SPRINT_MEMO = ["Previous Sprint & Updates", "Next Sprint Goal", "To-dos"];
const SPRINT_TITLES = [
  "TL;DR",
  "Previous Sprint & Updates",
  "Next Sprint Goal",
  "To do",
];
const RENAMED: Section[] = [
  ["Updates", "Recent changes"],
  ["Next Steps", "Follow-ups"],
];

const toSections = (sections: Section[]) =>
  sections.map(([title, description]) => ({ title, description }));

// Jours d'octobre 2026 : la note garde le format avec millisecondes, le
// modèle celui sans, comme en base.
const memoDay = (day: number) => `2026-10-0${day}T00:00:00.000Z`;
const templateDay = (day: number) => `2026-10-0${day}T00:00:00Z`;

type SectionCase = {
  name: string;
  memo: string[];
  memoAt?: number;
  headingsAt?: number;
  applied?: string[];
  templateAt?: number;
  template: Section[];
} & ({ titles: string[] } | { sections: Section[] });

// Fusion des titres de la note brute avec le modèle vivant et l'instantané du
// modèle appliqué.
const SECTION_CASES: SectionCase[] = [
  {
    name: "uses the edited memo headings for its applied template",
    memo: ["Updates", "Next Steps"],
    template: ONE_ON_ONE,
    sections: RENAMED,
  },
  {
    name: "keeps template sections added after the memo was written",
    memo: ["Updates", "Action Items"],
    memoAt: 1,
    templateAt: 5,
    template: WITH_TLDR,
    titles: ["TL;DR", "Updates", "Action Items"],
  },
  {
    name: "keeps added template sections when counts match but positions moved",
    memo: ["Updates", "Action Items", "Custom"],
    memoAt: 1,
    templateAt: 5,
    template: WITH_TLDR,
    titles: ["TL;DR", "Updates", "Action Items", "Custom"],
  },
  {
    name: "produces render-valid sections when memo and template diverge",
    memo: ["Updates", "Next Steps"],
    memoAt: 1,
    templateAt: 5,
    template: WITH_TLDR,
    titles: ["TL;DR", "Updates", "Action Items", "Next Steps"],
  },
  {
    name: "prefers the live template when it was saved after the memo",
    memo: SCRUM_MEMO,
    memoAt: 1,
    templateAt: 5,
    template: SCRUM,
    titles: SCRUM_TITLES,
  },
  {
    name: "keeps memo renames when the memo was written after the template",
    memo: ["Updates", "Next Steps"],
    memoAt: 6,
    templateAt: 5,
    template: ONE_ON_ONE,
    sections: RENAMED,
  },
  {
    name: "follows template reordering when the template was saved after the memo",
    memo: ["Action Items", "Updates"],
    memoAt: 1,
    templateAt: 5,
    template: ONE_ON_ONE,
    titles: ["Updates", "Action Items"],
  },
  {
    name: "keeps added template sections when the memo was edited after them",
    memo: SCRUM_MEMO,
    memoAt: 6,
    applied: ["Updates & Discussions", "Done", "In Progress", "To do"],
    templateAt: 5,
    template: SCRUM,
    titles: SCRUM_TITLES,
  },
  {
    name: "keeps template additions when a snapshot-less memo is edited after them",
    memo: ["Updates", "Action Items", "Custom"],
    memoAt: 7,
    headingsAt: 7,
    templateAt: 6,
    template: WITH_TLDR,
    titles: ["TL;DR", "Updates", "Action Items", "Custom"],
  },
  {
    name: "attaches live guidance to a memo rename shifted by an added heading",
    memo: ["Custom", "Updates", "Next Steps"],
    memoAt: 7,
    headingsAt: 7,
    templateAt: 6,
    template: ONE_ON_ONE,
    sections: [["Custom", ""], ...RENAMED],
  },
  {
    name: "keeps newer memo order when the memo reordered and added headings",
    memo: ["Actions", "Updates", "Custom"],
    memoAt: 7,
    headingsAt: 7,
    templateAt: 6,
    template: [
      ["Updates", "Recent changes"],
      ["Actions", "Open actions"],
    ],
    titles: ["Actions", "Updates", "Custom"],
  },
  {
    name: "keeps memo renames when the unchanged template was saved after them",
    memo: ["Updates", "Next Steps"],
    memoAt: 4,
    applied: ["Updates", "Action Items"],
    templateAt: 5,
    template: ONE_ON_ONE,
    sections: RENAMED,
  },
  {
    name: "keeps guidance for a rename below a memo-added heading",
    memo: ["Custom", "Updates", "Next Steps"],
    memoAt: 6,
    applied: ["Updates", "Action Items"],
    templateAt: 5,
    template: ONE_ON_ONE,
    sections: [...RENAMED, ["Custom", ""]],
  },
  {
    name: "pairs rewritten headings with applied sections by relative position",
    memo: ["One", "Two"],
    memoAt: 6,
    applied: ["Alpha", "Beta"],
    templateAt: 5,
    template: [
      ["Alpha", "First"],
      ["Beta", "Second"],
    ],
    sections: [
      ["One", "First"],
      ["Two", "Second"],
    ],
  },
  {
    name: "keeps both headings when template and memo change the same section",
    memo: ["Updates", "Next Steps"],
    memoAt: 6,
    applied: ["Updates", "Action Items"],
    templateAt: 7,
    template: [
      ["Updates", "Recent changes"],
      ["Follow-ups List", "Tracked follow-ups"],
    ],
    sections: [
      ["Updates", "Recent changes"],
      ["Follow-ups List", "Tracked follow-ups"],
      ["Next Steps", ""],
    ],
  },
  {
    name: "keeps template order when the memo reordered and the template grew",
    memo: ["Action Items", "Updates"],
    memoAt: 6,
    applied: ["Updates", "Action Items"],
    templateAt: 7,
    template: WITH_TLDR,
    titles: ["TL;DR", "Updates", "Action Items"],
  },
  {
    name: "omits sections the memo deleted after they were applied",
    memo: ["Updates"],
    memoAt: 6,
    applied: ["Updates", "Action Items"],
    templateAt: 5,
    template: ONE_ON_ONE,
    titles: ["Updates"],
  },
  {
    name: "omits snapshot-less memo sections deleted after the template was saved",
    memo: ["Updates"],
    memoAt: 6,
    headingsAt: 6,
    templateAt: 5,
    template: ONE_ON_ONE,
    titles: ["Updates"],
  },
  {
    name: "follows template reordering when the memo matches the snapshot",
    memo: ["Updates", "Action Items"],
    memoAt: 1,
    applied: ["Updates", "Action Items"],
    templateAt: 5,
    template: [ONE_ON_ONE[1], ONE_ON_ONE[0]],
    titles: ["Action Items", "Updates"],
  },
  {
    name: "follows the newer template reorder when both sides reordered the snapshot",
    memo: ["Beta", "Alpha", "Gamma"],
    memoAt: 6,
    applied: ["Alpha", "Beta", "Gamma"],
    templateAt: 7,
    template: [
      ["Gamma", "Third"],
      ["Alpha", "First"],
      ["Beta", "Second"],
    ],
    sections: [
      ["Gamma", "Third"],
      ["Alpha", "First"],
      ["Beta", "Second"],
    ],
  },
  {
    name: "drops a stale memo heading renamed in the template saved after the memo",
    memo: SPRINT_MEMO,
    memoAt: 1,
    templateAt: 5,
    template: SPRINT,
    titles: SPRINT_TITLES,
  },
  {
    name: "honors an emptied live template instead of restoring old headings",
    memo: ["Updates"],
    memoAt: 1,
    applied: ["Updates"],
    templateAt: 5,
    template: [],
    sections: [],
  },
  {
    name: "keeps short custom headings that resemble template titles",
    memo: ["Updates", "Tasks", "Risks"],
    memoAt: 1,
    templateAt: 5,
    template: [
      ["Updates", "Recent changes"],
      ["Tasks", "Open tasks"],
    ],
    titles: ["Updates", "Tasks", "Risks"],
  },
  {
    name: "keeps custom headings resembling matched template titles",
    memo: ["Development", "Deployment"],
    memoAt: 1,
    templateAt: 5,
    template: [["Development", "Dev updates"]],
    titles: ["Development", "Deployment"],
  },
  {
    name: "keeps a custom heading that swaps a word in an added template title",
    memo: ["Updates", "Hiring"],
    memoAt: 1,
    templateAt: 5,
    template: [
      ["Updates", "Recent changes"],
      ["Firing", "Offboarding"],
    ],
    titles: ["Updates", "Firing", "Hiring"],
  },
  {
    name: "drops a Korean memo heading renamed in the newer template",
    memo: ["업데이트", "할일 목록"],
    memoAt: 1,
    templateAt: 5,
    template: [
      ["업데이트", "최근 변경"],
      ["할 일 목록", "할 일"],
    ],
    titles: ["업데이트", "할 일 목록"],
  },
  {
    name: "drops stale headings when a paragraph edit postdates the template",
    memo: SPRINT_MEMO,
    memoAt: 6,
    headingsAt: 1,
    templateAt: 5,
    template: SPRINT,
    titles: SPRINT_TITLES,
  },
  {
    name: "keeps template additions when only memo paragraphs changed after them",
    memo: ["Custom", "Updates", "Done"],
    memoAt: 6,
    headingsAt: 1,
    templateAt: 5,
    template: [TLDR, ["Updates", "Recent changes"], ["Done", "Done"]],
    titles: ["TL;DR", "Updates", "Done", "Custom"],
  },
  {
    name: "keeps memo renames newer than the template by headings time",
    memo: ["Updates", "Next Steps"],
    memoAt: 6,
    headingsAt: 6,
    templateAt: 5,
    template: ONE_ON_ONE,
    sections: RENAMED,
  },
];

describe("enhanceTransform.transformArgs", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.collectEnhanceImageContext.mockResolvedValue([]);
    mocks.getTemplateById.mockResolvedValue(null);
    mocks.formatMeetingChatContext.mockReturnValue("");
    mocks.loadMeetingChatRecords.mockResolvedValue([]);
    mocks.loadSessionContentSnapshot.mockResolvedValue(createSnapshot());
    mocks.renderSessionTranscript.mockResolvedValue({
      status: "ok",
      data: null,
    });
    mocks.summaryLengthPolicy.mockResolvedValue({
      status: "ok",
      data: null,
    });
    mocks.dominantLanguage.mockResolvedValue({
      status: "ok",
      data: null,
    });
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  const renderTranscript = (
    segments: Array<Record<string, unknown>>,
    bounds: Record<string, number> = {},
  ) =>
    mocks.renderSessionTranscript.mockResolvedValue({
      status: "ok",
      data: { segments, ...bounds },
    });
  // Segment rendu par Rust, avec un seul mot qui couvre tout le texte.
  const renderedSegment = (
    speaker: string,
    text: string,
    startMs: number,
    endMs: number,
  ) => ({
    speaker_label: speaker,
    text,
    start_ms: startMs,
    end_ms: endMs,
    words: [{ text, start_ms: startMs, end_ms: endMs }],
  });

  it("uses the selected template when it can be loaded", async () => {
    const template = {
      title: "Standup",
      description: "Daily sync",
      sections: [{ title: "Updates", description: null }],
    };

    const result = await runTransform({}, template);

    expect(result.template).toEqual(template);
    expect(result.participants).toEqual([
      { name: "Alice", jobTitle: "Engineer" },
    ]);
  });

  it("includes the detected meeting platform in generated context", async () => {
    mocks.loadSessionContentSnapshot.mockResolvedValue({
      ...createSnapshot(),
      sourceApps: [
        { app: "chrome", name: "Google Chrome", platform: "Google Meet" },
      ],
    });

    const result = await transformWithoutTemplate();

    expect(result.postMeetingMemo).toContain("Meeting platform: Google Meet");
  });

  // Issue 415 : l'empreinte de la note brute lue au départ de la génération
  // est gardée avec la synthèse pour savoir si la note a changé depuis.
  it("keeps the pre-meeting memo and fingerprints the raw note the summary is generated from", async () => {
    const result = await transformWithoutTemplate();

    expect(result.preMeetingMemo).toBe("![pre](asset://localhost/pre.png)");
    expect(result.sourceNoteFingerprint).toBe(
      noteFingerprint("![post](asset://localhost/post.png)", "markdown"),
    );
  });

  it.each(SECTION_CASES)("$name", async (testCase) => {
    const result = await runTransform(
      {
        rawTemplateId: "template-1",
        ...(testCase.memoAt && { rawUpdatedAt: memoDay(testCase.memoAt) }),
        ...(testCase.headingsAt && {
          rawHeadingsUpdatedAt: memoDay(testCase.headingsAt),
        }),
        ...(testCase.applied && {
          rawAppliedTemplate: {
            templateId: "template-1",
            sections: testCase.applied,
          },
        }),
        rawContent: docWithHeadings(...testCase.memo),
        rawContentFormat: "prosemirror_json",
      },
      {
        title: "Meeting",
        description: "Template",
        ...(testCase.templateAt && {
          updatedAt: templateDay(testCase.templateAt),
        }),
        sections: toSections(testCase.template),
      },
    );

    const sections = result.template?.sections;
    if ("sections" in testCase) {
      expect(sections).toEqual(toSections(testCase.sections));
    } else {
      expect(sections?.map((section) => section.title)).toEqual(
        testCase.titles,
      );
    }
    // Les sections fusionnées restent valides pour le rendu du prompt.
    expect(() =>
      assertCanonicalTemplateSections(
        sections,
        "enhance render template.sections",
      ),
    ).not.toThrow();
  });

  it("keeps memo headings when the applied template is missing", async () => {
    const result = await runTransform(
      {
        rawTemplateId: "template-1",
        rawAppliedTemplate: {
          templateId: "template-1",
          sections: ["Updates", "Action Items"],
        },
        rawContent: docWithHeadings("Updates", "Action Items"),
        rawContentFormat: "prosemirror_json",
      },
      null,
    );

    expect(result.template).toEqual({
      title: "Meeting memo",
      description: null,
      sections: [
        { title: "Updates", description: "" },
        { title: "Action Items", description: "" },
      ],
    });
  });

  it("keeps the applied template when the memo has no section headings", async () => {
    const template = {
      title: "1:1 Meeting",
      description: "Weekly conversation",
      sections: toSections(ONE_ON_ONE),
    };

    const result = await runTransform(
      {
        rawTemplateId: "template-1",
        rawContent: JSON.stringify({
          type: "doc",
          content: [{ type: "paragraph" }],
        }),
        rawContentFormat: "prosemirror_json",
        rawMarkdown: "Notes without headings",
      },
      template,
    );

    expect(result.template).toEqual(template);
  });

  it.each([
    {
      when: "uses the saved format override for Auto summaries",
      templateId: undefined,
      prompt: "  Start with decisions.  ",
      expected: "  Start with decisions.  ",
    },
    {
      when: "ignores the Auto override when a named template is selected",
      templateId: "template-1",
      prompt: "Start with decisions.",
      expected: "",
    },
    {
      when: "uses the built-in Auto format when no override is saved",
      templateId: undefined,
      prompt: undefined,
      expected: "",
    },
  ])("$when", async ({ templateId, prompt, expected }) => {
    const result = await enhanceTransform.transformArgs(
      { sessionId: "session-1", enhancedNoteId: "note-1", templateId },
      prompt === undefined
        ? settingsValues
        : { ...settingsValues, auto_summary_prompt: prompt },
    );

    expect(result.formatOverride).toBe(expected);
  });

  // Issue 353 : une capture par reprise après une pause. La synthèse reçoit
  // la transcription de toute la note, captures dans l'ordre chronologique
  // (le rendu natif les ordonne, voir session_transcript.rs).
  it("sends every capture of the note to the summary in chronological order", async () => {
    const capture = (id: string, startedAt: number, endedAt: number) => ({
      id,
      started_at: startedAt,
      ended_at: endedAt,
      memo: "",
      wordsJson: "[]",
      words: [],
      speaker_hints: [],
    });
    mocks.loadSessionContentSnapshot.mockResolvedValue({
      ...createSnapshot(),
      transcripts: [
        capture("after-pause", 120_000, 180_000),
        capture("before-pause", 0, 60_000),
      ],
    });
    renderTranscript(
      [
        {
          speaker_label: "Alice",
          start_ms: 1_000,
          end_ms: 5_000,
          text: "Avant la pause",
          words: [{ text: "Avant", start_ms: 1_000, end_ms: 2_000 }],
        },
        {
          speaker_label: "Alice",
          start_ms: 121_000,
          end_ms: 125_000,
          text: "Après la reprise",
          words: [{ text: "Après", start_ms: 121_000, end_ms: 122_000 }],
        },
      ],
      { started_at: 0, ended_at: 180_000 },
    );

    const result = await transformWithoutTemplate();

    expect(mocks.renderSessionTranscript).toHaveBeenCalledWith({
      session_id: "session-1",
      self_human_id: "user-1",
    });
    expect(result.transcripts).toHaveLength(1);
    expect(result.transcripts[0]).toMatchObject({
      startedAt: 0,
      endedAt: 180_000,
      segments: [
        { text: "Avant la pause", startMs: 1_000 },
        { text: "Après la reprise", startMs: 121_000 },
      ],
    });
    expect(mocks.summaryLengthPolicy).toHaveBeenCalledWith({
      transcript_texts: ["Avant la pause", "Après la reprise"],
      template_section_count: 0,
    });
  });

  it("builds the summary policy from the returned transcript segments", async () => {
    const lengthPolicy = {
      transcript_characters: 27,
      guidance: { max_characters: 320, min_sections: 1, max_sections: 2 },
    };
    renderTranscript([
      {
        speaker_label: "Alice",
        start_ms: 0,
        end_ms: 10,
        text: "First segment",
        words: [{ text: "First", start_ms: 0, end_ms: 5 }],
      },
      {
        speaker_label: "Alice",
        start_ms: 10,
        end_ms: 20,
        text: "Second segment",
        words: [{ text: "Second", start_ms: 10, end_ms: 15 }],
      },
    ]);
    mocks.summaryLengthPolicy.mockResolvedValue({
      status: "ok",
      data: lengthPolicy,
    });

    const result = await transformWithoutTemplate({
      auto_summary_prompt: "  Use concise prose.  ",
    });

    expect(mocks.summaryLengthPolicy).toHaveBeenCalledWith({
      transcript_texts: ["First segment", "Second segment"],
      template_section_count: 0,
    });
    expect(result.lengthPolicy).toEqual(lengthPolicy);
  });

  it.each([
    { summaryUseMainLanguage: undefined, expected: "ko" },
    { summaryUseMainLanguage: true, expected: "en" },
  ])(
    "uses $expected for summaries with Korean transcription enabled (main language override: $summaryUseMainLanguage)",
    async ({ summaryUseMainLanguage, expected }) => {
      renderTranscript([
        {
          speaker_label: "Alice",
          start_ms: 0,
          end_ms: 10,
          text: "오늘 회의에 참석해 주셔서 감사합니다.",
          words: [{ text: "오늘", start_ms: 0, end_ms: 5 }],
        },
      ]);
      mocks.dominantLanguage.mockResolvedValue({ status: "ok", data: "ko" });

      const result = await transformWithoutTemplate({
        spoken_languages: '["ko"]',
        summary_use_main_language: summaryUseMainLanguage,
      });

      expect(result.language).toBe(expected);
    },
  );

  it("keeps the main language when no additional spoken languages are set", async () => {
    const result = await transformWithoutTemplate({ spoken_languages: "[]" });

    expect(mocks.dominantLanguage).not.toHaveBeenCalled();
    expect(result.language).toBe("en");
  });

  it("includes personalization dictionary terms for summary spelling", async () => {
    const result = await transformWithoutTemplate({
      personalization_dictionary_terms: JSON.stringify(["Syntheo", "Char"]),
    });

    expect(result.dictionaryTerms).toEqual(["Syntheo", "Char"]);
  });

  it("falls back to generic enhancement when template loading fails", async () => {
    mocks.getTemplateById.mockRejectedValue(new Error("Failed query"));

    const result = await enhanceTransform.transformArgs(
      {
        sessionId: "session-1",
        enhancedNoteId: "note-1",
        templateId: "template-1",
      },
      settingsValues,
    );

    expect(result.template).toBeNull();
    expect(result.formatOverride).toBe("");
    expect(result.session.title).toBe("Weekly Review");
    expect(consoleError).toHaveBeenCalledWith(
      "[enhance] failed to load template",
      expect.any(Error),
    );
  });

  it("collects image context from canonical transcript and note content", async () => {
    await enhanceTransform.transformArgs(
      { sessionId: "session-1", enhancedNoteId: "note-1" },
      {
        current_llm_provider: "openai",
        current_llm_model: "gpt-4o",
        ai_language: "en",
      },
    );

    expect(mocks.collectEnhanceImageContext).toHaveBeenCalledWith("session-1", [
      "![pre](asset://localhost/pre.png)",
      "![post](asset://localhost/post.png)",
    ]);
  });

  it("uses Rust-rendered transcript segments in summary context", async () => {
    const segment = (
      id: string,
      speaker: string,
      startMs: number,
      endMs: number,
      text: string,
    ) => ({
      id,
      key: { channel: "DirectMic" },
      speaker_label: speaker,
      start_ms: startMs,
      end_ms: endMs,
      text,
      words: text
        ? [
            {
              text,
              start_ms: startMs,
              end_ms: endMs,
              channel: "DirectMic",
              is_final: true,
            },
          ]
        : [],
    });
    renderTranscript(
      [
        segment("later", "Later speaker", 200, 300, "later words"),
        segment("empty", "Empty speaker", 0, 100, ""),
        segment("earlier", "Earlier speaker", 100, 150, "earlier words"),
      ],
      { started_at: 100, ended_at: 200 },
    );

    const result = await transformWithoutTemplate();

    expect(result.transcripts).toEqual([
      {
        segments: [
          { speaker: "Later speaker", text: "later words", startMs: 200 },
          { speaker: "Earlier speaker", text: "earlier words", startMs: 100 },
        ],
        startedAt: 100,
        endedAt: 200,
        nowMs: null,
      },
    ]);
  });

  it.each([
    {
      order: "the renderer's channel grouping",
      segments: [
        renderedSegment("Speaker 1", "Mic early", 0, 400),
        renderedSegment("Speaker 1", "Mic later", 29_500, 29_900),
        renderedSegment("Speaker 2", "Remote early", 0, 400),
      ],
    },
    {
      order: "timed two-channel transcripts in start order",
      segments: [
        renderedSegment("Speaker 1", "Mic first", 0, 400),
        renderedSegment("Speaker 2", "Remote second", 500, 900),
        renderedSegment("Speaker 1", "Mic third", 1_000, 1_400),
      ],
    },
  ])(
    "keeps $order in generated-note transcript context",
    async ({ segments }) => {
      renderTranscript(segments, { started_at: 100, ended_at: 200 });

      const result = await transformWithoutTemplate();

      expect(
        result.transcripts[0]?.segments.map((segment) => segment.text),
      ).toEqual(segments.map((segment) => segment.text));
    },
  );

  it("includes captured meeting chat in the post-meeting memo", async () => {
    mocks.loadMeetingChatRecords.mockResolvedValue([
      { text: "Review the rollout plan" },
    ]);
    mocks.formatMeetingChatContext.mockReturnValue(
      "## Meeting chat\n- Slack · Ada\n  Review the rollout plan",
    );

    const result = await transformWithoutTemplate();

    expect(result.postMeetingMemo).toBe(
      "![post](asset://localhost/post.png)\n\n## Meeting chat\n- Slack · Ada\n  Review the rollout plan",
    );
  });

  it("rejects generation when the session no longer exists", async () => {
    mocks.loadSessionContentSnapshot.mockResolvedValue(null);

    await expect(
      enhanceTransform.transformArgs(
        { sessionId: "missing", enhancedNoteId: "note-1" },
        settingsValues,
      ),
    ).rejects.toThrow("Session missing no longer exists");
  });
});
