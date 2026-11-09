import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_MARKDOWN_EXPORT_OPTIONS } from "./markdown-export";

const mocks = vi.hoisted(() => ({
  exportMeetingMarkdown: vi.fn(),
  store: {} as Record<string, unknown>,
  setSettingValue: vi.fn(),
  setSettingValues: vi.fn(),
}));

vi.mock("@syntheo/plugin-local-api", () => ({
  commands: { exportMeetingMarkdown: mocks.exportMeetingMarkdown },
}));

// Réglages en mémoire : chaque écriture est relue par la lecture suivante,
// comme la vraie table des réglages.
vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: async () => ({
    values: { ...mocks.store },
    hasValues: new Set(Object.keys(mocks.store)),
  }),
  setSettingValue: mocks.setSettingValue,
  setSettingValues: mocks.setSettingValues,
}));

import {
  parseAutomationRunRecord,
  planEventRun,
  runMeetingCompletedAutomations,
  runNoteEnhancedAutomations,
  runWorkflowOnNote,
} from "./engine";
import { resetLegacyMigrationForTests } from "./migration";
import { createEmptyWorkflow } from "./workflows";

function storedSettings(values: Record<string, unknown>) {
  mocks.store = { ...values };
}

function storedWorkflows() {
  return JSON.parse(String(mocks.store.automation_workflows ?? "[]"));
}

function exportReturns(path: string, sha256 = "hash") {
  mocks.exportMeetingMarkdown.mockResolvedValue({
    status: "ok",
    data: { path, sha256 },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLegacyMigrationForTests();
  mocks.store = {};
  mocks.setSettingValue.mockImplementation(async (key: string, value) => {
    mocks.store[key] = value;
  });
  mocks.setSettingValues.mockImplementation(
    async (values: Record<string, unknown>) => {
      Object.assign(mocks.store, values);
    },
  );
});

describe("parsers", () => {
  it("round-trips run records and rejects malformed values", () => {
    const record = {
      at: "2026-08-07T12:00:00.000Z",
      status: "success",
      detail: "/exports/file.md",
    };
    expect(parseAutomationRunRecord(JSON.stringify(record))).toEqual(record);
    expect(parseAutomationRunRecord(undefined)).toBeNull();
    expect(parseAutomationRunRecord("{broken")).toBeNull();
    expect(parseAutomationRunRecord('{"status":"success"}')).toBeNull();
  });
});

describe("legacy Markdown export parity", () => {
  const legacyRun = JSON.stringify({
    at: "2026-11-01T09:00:00.000Z",
    status: "success",
    detail: "/exports/2026-11-01 Standup [abc123].md",
  });

  it("writes the same file after the migration as the old export did", async () => {
    // Avant la migration, l'ancien export appelait l'exporteur avec le
    // dossier, sans options ni fichier précédent : on attend le même appel.
    storedSettings({
      automation_markdown_export_enabled: true,
      automation_markdown_export_directory: "/exports",
      automation_markdown_export_last_run: legacyRun,
    });
    exportReturns("/exports/2026-11-09 Planning [session].md");

    await runMeetingCompletedAutomations("session-1");

    expect(mocks.exportMeetingMarkdown).toHaveBeenCalledTimes(1);
    expect(mocks.exportMeetingMarkdown).toHaveBeenCalledWith(
      "session-1",
      "/exports",
      null,
      null,
    );
    const [workflow] = storedWorkflows();
    expect(workflow).toMatchObject({
      id: "legacy-markdown-export",
      enabled: true,
      trigger: "meeting_completed",
      lastRun: {
        status: "success",
        detail: "/exports/2026-11-09 Planning [session].md",
      },
      processedSessionIds: ["session-1"],
    });
    expect(mocks.store.automation_markdown_export_enabled).toBe(false);
    expect(mocks.store.automation_markdown_export_directory).toBe("");
  });

  it("rewrites that file with the summary once it is ready", async () => {
    storedSettings({
      automation_markdown_export_enabled: true,
      automation_markdown_export_directory: "/exports",
    });
    exportReturns("/exports/2026-11-09 Planning [session].md", "first");
    await runMeetingCompletedAutomations("session-1");

    exportReturns("/exports/2026-11-09 Planning [session].md", "second");
    await runNoteEnhancedAutomations("session-1");

    expect(mocks.exportMeetingMarkdown).toHaveBeenCalledTimes(2);
    expect(mocks.exportMeetingMarkdown).toHaveBeenLastCalledWith(
      "session-1",
      "/exports",
      null,
      { path: "/exports/2026-11-09 Planning [session].md", sha256: "first" },
    );
  });

  it("does nothing while the old export was disabled and removed", async () => {
    storedSettings({
      automation_markdown_export_enabled: false,
      automation_markdown_export_directory: "/exports",
    });

    await runMeetingCompletedAutomations("session-1");

    expect(mocks.exportMeetingMarkdown).not.toHaveBeenCalled();
    expect(storedWorkflows()).toEqual([]);
  });
});

describe("single execution path", () => {
  it("skips disabled, manual, or already processed workflows", async () => {
    const step = { id: "s", type: "markdown_export", directory: "/x" };
    storedSettings({
      automation_workflows: JSON.stringify([
        { id: "off", enabled: false, trigger: "note_enhanced", steps: [step] },
        { id: "hand", enabled: true, trigger: "manual", steps: [step] },
      ]),
    });

    await runNoteEnhancedAutomations("session-1");

    expect(mocks.exportMeetingMarkdown).not.toHaveBeenCalled();
  });

  it("plans only rerunnable steps for an already processed note", () => {
    const workflow = createEmptyWorkflow({
      enabled: true,
      trigger: "meeting_completed",
      steps: [{ id: "s", type: "markdown_export", directory: "/x" }],
      processedSessionIds: ["session-1"],
    });
    expect(planEventRun(workflow, "session-1", "meeting_completed")).toEqual(
      workflow.steps,
    );
    expect(planEventRun(workflow, "session-1", "note_enhanced")).toEqual(
      workflow.steps,
    );
    expect(planEventRun(workflow, "session-2", "note_enhanced")).toEqual([]);
    expect(
      planEventRun(
        { ...workflow, trigger: "manual" },
        "session-1",
        "note_enhanced",
      ),
    ).toEqual([]);
  });

  it.each(["meeting_completed", "note_enhanced"] as const)(
    "passes selected options to the writer on %s and saves them with the result",
    async (trigger) => {
      const options = {
        ...DEFAULT_MARKDOWN_EXPORT_OPTIONS,
        include_memo: false,
        include_transcript: false,
        include_action_items: false,
        filename: "{title} recap",
        include_id_suffix: false,
      };
      storedSettings({
        automation_workflows: JSON.stringify([
          {
            id: "wf-markdown",
            enabled: true,
            trigger,
            steps: [
              {
                id: "step",
                type: "markdown_export",
                directory: " /exports ",
                options,
              },
            ],
          },
        ]),
      });
      exportReturns("/exports/Planning recap.md");

      await (
        trigger === "meeting_completed"
          ? runMeetingCompletedAutomations
          : runNoteEnhancedAutomations
      )("session-1");

      expect(mocks.exportMeetingMarkdown).toHaveBeenCalledWith(
        "session-1",
        "/exports",
        options,
        null,
      );
      const [saved] = storedWorkflows();
      expect(saved.steps[0].options).toEqual(options);
      expect(saved.lastRun).toMatchObject({
        status: "success",
        detail: "/exports/Planning recap.md",
      });
    },
  );

  it("asks the exporter to replace the file from the previous title", async () => {
    storedSettings({
      automation_workflows: JSON.stringify([
        {
          id: "wf-markdown",
          enabled: true,
          trigger: "note_enhanced",
          steps: [
            { id: "step-md", type: "markdown_export", directory: "/exports" },
          ],
          processedSessionIds: ["session-1"],
        },
      ]),
      automation_markdown_export_files: JSON.stringify([
        {
          key: "wf-markdown:step-md:session-1",
          path: "/exports/Planning.md",
          sha256: "old",
        },
      ]),
    });
    exportReturns("/exports/Launch.md", "new");

    await runNoteEnhancedAutomations("session-1");

    expect(mocks.exportMeetingMarkdown).toHaveBeenCalledWith(
      "session-1",
      "/exports",
      null,
      { path: "/exports/Planning.md", sha256: "old" },
    );
    expect(
      JSON.parse(String(mocks.store.automation_markdown_export_files)),
    ).toEqual([
      {
        key: "wf-markdown:step-md:session-1",
        path: "/exports/Launch.md",
        sha256: "new",
      },
    ]);
  });

  it("records an empty-selection error without writing a file", async () => {
    storedSettings({
      automation_workflows: JSON.stringify([
        {
          id: "wf-markdown",
          enabled: true,
          trigger: "meeting_completed",
          steps: [
            {
              id: "step",
              type: "markdown_export",
              directory: "/exports",
              options: {
                ...DEFAULT_MARKDOWN_EXPORT_OPTIONS,
                include_memo: false,
                include_summary: false,
                include_transcript: false,
                include_action_items: false,
              },
            },
          ],
        },
      ]),
    });

    await runMeetingCompletedAutomations("session-1");

    expect(mocks.exportMeetingMarkdown).not.toHaveBeenCalled();
    const [saved] = storedWorkflows();
    expect(saved.lastRun.status).toBe("error");
    expect(saved.processedSessionIds).toEqual([]);
  });

  it("stops at the first failing step", async () => {
    storedSettings({
      automation_workflows: JSON.stringify([
        {
          id: "wf",
          enabled: true,
          trigger: "meeting_completed",
          steps: [
            { id: "a", type: "markdown_export", directory: "/a" },
            { id: "b", type: "markdown_export", directory: "/b" },
          ],
        },
      ]),
    });
    mocks.exportMeetingMarkdown.mockResolvedValue({
      status: "error",
      error: "could not write markdown export: denied",
    });

    await runMeetingCompletedAutomations("session-1");

    expect(mocks.exportMeetingMarkdown).toHaveBeenCalledTimes(1);
    expect(storedWorkflows()[0].lastRun).toMatchObject({
      status: "error",
      detail: "could not write markdown export: denied",
    });
  });
});

describe("manual launch", () => {
  const manualWorkflow = {
    id: "wf-hand",
    enabled: false,
    trigger: "manual",
    steps: [{ id: "s", type: "markdown_export", directory: "/exports" }],
    processedSessionIds: ["session-0"],
  };

  it("runs the workflow on the chosen note without touching processed notes", async () => {
    storedSettings({ automation_workflows: JSON.stringify([manualWorkflow]) });
    exportReturns("/exports/Planning.md");

    const record = await runWorkflowOnNote("wf-hand", "session-7");

    expect(mocks.exportMeetingMarkdown).toHaveBeenCalledWith(
      "session-7",
      "/exports",
      null,
      null,
    );
    expect(record).toMatchObject({
      status: "success",
      detail: "/exports/Planning.md",
    });
    const [saved] = storedWorkflows();
    expect(saved.lastRun).toMatchObject({ status: "success" });
    expect(saved.processedSessionIds).toEqual(["session-0"]);
  });

  it("also relaunches an automatic workflow on a note it already processed", async () => {
    storedSettings({
      automation_workflows: JSON.stringify([
        { ...manualWorkflow, trigger: "note_enhanced", enabled: true },
      ]),
    });
    exportReturns("/exports/Planning.md");

    await runWorkflowOnNote("wf-hand", "session-0");

    expect(mocks.exportMeetingMarkdown).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown automation", async () => {
    storedSettings({ automation_workflows: "[]" });

    await expect(runWorkflowOnNote("missing", "session-1")).rejects.toThrow(
      "automation not found",
    );
  });
});
