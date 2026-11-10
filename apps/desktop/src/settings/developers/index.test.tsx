import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkCliStatus: vi.fn(),
  listSkillAgents: vi.fn(),
  installAgentSkill: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  openUrl: vi.fn(),
  getCloudApiSettings: vi.fn(),
  setCloudApiEnabled: vi.fn(),
  backfillCloudApiSnapshots: vi.fn(),
  createCloudApiKey: vi.fn(),
}));

vi.mock("~/types/tauri.gen", () => ({
  commands: {
    checkCliStatus: mocks.checkCliStatus,
    listSkillAgents: mocks.listSkillAgents,
    installAgentSkill: mocks.installAgentSkill,
  },
}));

vi.mock("@syntheo/ui/components/ui/dropdown-menu", () => ({
  appFloatingMenuPanelClassName: "overflow-hidden p-1.5",
  AppFloatingPanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@syntheo/plugin-opener2", () => ({
  commands: { openUrl: mocks.openUrl },
}));

vi.mock("@syntheo/plugin-local-api", () => ({
  commands: {
    listWebhooks: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
  },
}));

vi.mock("~/cloud-api/client", () => ({
  getCloudApiSettings: mocks.getCloudApiSettings,
  setCloudApiEnabled: mocks.setCloudApiEnabled,
  backfillCloudApiSnapshots: mocks.backfillCloudApiSnapshots,
  scheduleCloudApiBackfillRetry: vi.fn(),
  listCloudApiKeys: vi.fn().mockResolvedValue([]),
  createCloudApiKey: mocks.createCloudApiKey,
  revokeCloudApiKey: vi.fn(),
}));

vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  },
}));

import {
  CLI_INSTALL_COMMAND,
  SettingsDevelopers,
  buildMcpConfiguration,
} from "./index";

describe("buildMcpConfiguration", () => {
  it("uses the exact installed CLI path", () => {
    const configuration = JSON.parse(
      buildMcpConfiguration("/Users/test/.local/bin/syntheo"),
    );

    expect(configuration).toEqual({
      mcpServers: {
        syntheo: {
          command: "/Users/test/.local/bin/syntheo",
          args: ["mcp"],
        },
      },
    });
  });
});

describe("SettingsDevelopers", () => {
  beforeEach(() => {
    mocks.checkCliStatus.mockReset();
    mocks.listSkillAgents.mockReset();
    mocks.listSkillAgents.mockResolvedValue({ status: "ok", data: [] });
    mocks.installAgentSkill.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastWarning.mockReset();
    mocks.openUrl.mockReset();
    mocks.createCloudApiKey.mockReset();
    mocks.getCloudApiSettings.mockReset();
    mocks.getCloudApiSettings.mockResolvedValue({
      enabled: false,
      updated_at: null,
    });
    mocks.setCloudApiEnabled.mockReset();
    mocks.backfillCloudApiSnapshots.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  function renderSettings() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsDevelopers />
      </QueryClientProvider>,
    );
  }

  it("shows the CLI path and copies it into the MCP configuration", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    mocks.checkCliStatus.mockResolvedValue({
      status: "ok",
      data: {
        commandName: "syntheo",
        path: "/Users/test/.cargo/bin/syntheo",
        shadowedByApp: false,
      },
    });

    renderSettings();

    expect(
      await screen.findByText("/Users/test/.cargo/bin/syntheo"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Installed")).toBeTruthy();
    expect(screen.queryByText(CLI_INSTALL_COMMAND)).toBeNull();
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Copy config" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual({
      mcpServers: {
        syntheo: {
          command: "/Users/test/.cargo/bin/syntheo",
          args: ["mcp"],
        },
      },
    });
  });

  it("documents the install command when the CLI is missing", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    mocks.checkCliStatus.mockResolvedValue({
      status: "ok",
      data: { commandName: "syntheo", path: null, shadowedByApp: false },
    });

    mocks.openUrl.mockResolvedValue({ status: "ok", data: null });

    renderSettings();

    expect(await screen.findByText(CLI_INSTALL_COMMAND)).toBeTruthy();
    expect(screen.queryByLabelText("Installed")).toBeNull();
    const copyConfig = screen.getByRole("button", { name: "Copy config" });
    expect(copyConfig.hasAttribute("disabled")).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Copy install command" }),
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(CLI_INSTALL_COMMAND),
    );

    fireEvent.click(screen.getByRole("button", { name: /Installation guide/ }));
    expect(mocks.openUrl).toHaveBeenCalledWith(
      "https://docs.syntheo.studio/en/installation",
      null,
    );
  });

  it("warns when the syntheo command on the PATH is the desktop app", async () => {
    mocks.checkCliStatus.mockResolvedValue({
      status: "ok",
      data: {
        commandName: "syntheo",
        path: "/home/test/.cargo/bin/syntheo",
        shadowedByApp: true,
      },
    });

    renderSettings();

    expect(
      await screen.findByText(
        "The syntheo command on your PATH opens the desktop app. Use the CLI's absolute path.",
      ),
    ).toBeTruthy();
  });

  it("installs the skill into every detected agent from one action", async () => {
    mocks.checkCliStatus.mockResolvedValue({
      status: "ok",
      data: { commandName: "syntheo", path: null, shadowedByApp: false },
    });
    mocks.listSkillAgents.mockResolvedValue({
      status: "ok",
      data: [
        {
          agent: "claude_code",
          displayName: "Claude Code",
          detected: true,
          installed: true,
          skillPath: "/Users/test/.claude/skills/syntheo",
        },
        {
          agent: "codex",
          displayName: "Codex",
          detected: true,
          installed: false,
          skillPath: "/Users/test/.codex/skills/syntheo",
        },
        {
          agent: "cursor",
          displayName: "Cursor",
          detected: false,
          installed: false,
          skillPath: "/Users/test/.cursor/skills/syntheo",
        },
        {
          agent: "opencode",
          displayName: "OpenCode",
          detected: true,
          installed: false,
          skillPath: "/Users/test/.config/opencode/skills/syntheo",
        },
      ],
    });
    mocks.installAgentSkill.mockImplementation((agent: string) =>
      Promise.resolve({
        status: "ok",
        data: {
          agent,
          displayName: agent,
          detected: true,
          installed: true,
          skillPath: `/Users/test/${agent}`,
        },
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsDevelopers />
      </QueryClientProvider>,
    );

    const cursorItem = await screen.findByRole("button", { name: "Cursor" });
    expect(cursorItem.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByRole("button", { name: /Claude Code/ }).querySelector("svg"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Codex" }).querySelector("svg"),
    ).toBeTruthy();
    expect(cursorItem.querySelector("svg")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "OpenCode" }).querySelector("svg"),
    ).toBeTruthy();
    const installedIcon = screen.getByLabelText("Skill installed");
    expect(installedIcon.closest("button")?.textContent).toContain(
      "Claude Code",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Install to all agents" }),
    );

    await waitFor(() =>
      expect(mocks.installAgentSkill).toHaveBeenCalledTimes(3),
    );
    expect(mocks.installAgentSkill).toHaveBeenCalledWith("claude_code");
    expect(mocks.installAgentSkill).toHaveBeenCalledWith("codex");
    expect(mocks.installAgentSkill).toHaveBeenCalledWith("opencode");
    expect(mocks.installAgentSkill).not.toHaveBeenCalledWith("cursor");
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "Syntheo skill added to 3 agents",
      ),
    );
  });

  it("reports a single-agent skill install by agent name", async () => {
    mocks.checkCliStatus.mockResolvedValue({
      status: "ok",
      data: { commandName: "syntheo", path: null, shadowedByApp: false },
    });
    mocks.listSkillAgents.mockResolvedValue({
      status: "ok",
      data: [
        {
          agent: "codex",
          displayName: "Codex",
          detected: true,
          installed: false,
          skillPath: "/Users/test/.codex/skills/syntheo",
        },
      ],
    });
    mocks.installAgentSkill.mockResolvedValue({
      status: "ok",
      data: {
        agent: "codex",
        displayName: "Codex",
        detected: true,
        installed: true,
        skillPath: "/Users/test/.codex/skills/syntheo",
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsDevelopers />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Codex" }));

    await waitFor(() =>
      expect(mocks.installAgentSkill).toHaveBeenCalledWith("codex"),
    );
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "Syntheo skill added to Codex",
      ),
    );
  });
});
