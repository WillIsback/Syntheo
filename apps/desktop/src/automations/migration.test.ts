import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
  setSettingValue: vi.fn(),
  setSettingValues: vi.fn(),
}));

vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: async () => ({
    values: { ...mocks.store },
    hasValues: new Set(Object.keys(mocks.store)),
  }),
  setSettingValue: mocks.setSettingValue,
  setSettingValues: mocks.setSettingValues,
}));

import {
  ensureLegacyAutomationsMigrated,
  LEGACY_MARKDOWN_WORKFLOW_ID,
  migrateLegacyAutomations,
  resetLegacyMigrationForTests,
} from "./migration";
import { parseAutomationWorkflows } from "./workflows";

const LAST_RUN = {
  at: "2026-11-01T09:00:00.000Z",
  status: "success",
  detail: "/exports/2026-11-01 Standup [abc123].md",
};

function workflows() {
  return parseAutomationWorkflows(
    mocks.store.automation_workflows as string | undefined,
  );
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

describe("legacy Markdown export migration", () => {
  it("converts an enabled export into an equivalent workflow and clears the old keys", async () => {
    mocks.store = {
      automation_markdown_export_enabled: true,
      automation_markdown_export_directory: " /exports ",
      automation_markdown_export_last_run: JSON.stringify(LAST_RUN),
      automation_draft_template: "markdown-export",
    };

    await migrateLegacyAutomations();

    expect(workflows()).toEqual([
      {
        id: LEGACY_MARKDOWN_WORKFLOW_ID,
        title: "",
        templateId: "markdown-export",
        enabled: true,
        trigger: "meeting_completed",
        steps: [
          {
            id: `${LEGACY_MARKDOWN_WORKFLOW_ID}-step`,
            type: "markdown_export",
            directory: "/exports",
          },
        ],
        lastRun: LAST_RUN,
        processedSessionIds: [],
        chatGroupId: null,
      },
    ]);
    expect(mocks.setSettingValues).toHaveBeenCalledWith({
      automation_markdown_export_enabled: false,
      automation_markdown_export_directory: "",
      automation_markdown_export_last_run: "",
      automation_draft_template: "",
    });
  });

  it("keeps a disabled export still shown as a draft, disabled", async () => {
    mocks.store = {
      automation_markdown_export_enabled: false,
      automation_markdown_export_directory: "/exports",
      automation_draft_template: "markdown-export",
    };

    await migrateLegacyAutomations();

    expect(workflows()).toEqual([
      expect.objectContaining({
        id: LEGACY_MARKDOWN_WORKFLOW_ID,
        enabled: false,
        lastRun: null,
      }),
    ]);
  });

  it("does not recreate a removed export but still clears its keys", async () => {
    mocks.store = {
      automation_markdown_export_enabled: false,
      automation_markdown_export_directory: "/exports",
    };

    await migrateLegacyAutomations();

    expect(workflows()).toEqual([]);
    expect(mocks.store.automation_markdown_export_directory).toBe("");
  });

  it("is a no-op without legacy keys or cloud steps", async () => {
    mocks.store = { automation_workflows: "[]" };

    await migrateLegacyAutomations();

    expect(mocks.setSettingValue).not.toHaveBeenCalled();
    expect(mocks.setSettingValues).not.toHaveBeenCalled();
  });

  it("runs once even when asked twice", async () => {
    mocks.store = {
      automation_markdown_export_enabled: true,
      automation_markdown_export_directory: "/exports",
    };

    await Promise.all([
      ensureLegacyAutomationsMigrated(),
      ensureLegacyAutomationsMigrated(),
    ]);
    // Relancée plus tard (nouveau processus), elle ne duplique rien.
    mocks.store.automation_markdown_export_enabled = true;
    mocks.store.automation_markdown_export_directory = "/exports";
    resetLegacyMigrationForTests();
    await ensureLegacyAutomationsMigrated();

    expect(workflows()).toHaveLength(1);
  });
});

describe("legacy cloud steps", () => {
  it("removes unsupported steps and disables a workflow left empty", async () => {
    mocks.store = {
      automation_workflows: JSON.stringify([
        {
          id: "wf-slack",
          title: "Recap",
          enabled: true,
          trigger: "note_enhanced",
          steps: [
            { id: "s1", type: "slack_recap", target: { id: "C1", name: "g" } },
          ],
        },
        {
          id: "wf-mixed",
          title: "Mixed",
          enabled: true,
          trigger: "note_enhanced",
          steps: [
            { id: "s2", type: "notion_update" },
            { id: "s3", type: "markdown_export", directory: "/exports" },
          ],
        },
      ]),
    };

    await migrateLegacyAutomations();

    const stored = JSON.parse(String(mocks.store.automation_workflows));
    expect(stored).toEqual([
      expect.objectContaining({ id: "wf-slack", enabled: false, steps: [] }),
      expect.objectContaining({
        id: "wf-mixed",
        enabled: true,
        steps: [{ id: "s3", type: "markdown_export", directory: "/exports" }],
      }),
    ]);
    expect(mocks.setSettingValues).not.toHaveBeenCalled();
  });
});
