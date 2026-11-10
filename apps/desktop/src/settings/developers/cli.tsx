import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";

import { commands as openerCommands } from "@syntheo/plugin-opener2";
import {
  ArrowSquareOut,
  CheckCircle,
  CircleNotch,
  Copy,
} from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";

import { copyText } from "./clipboard";
import { SkillsRow } from "./skills";

import { documentationUrl } from "~/shared/documentation";
import { commands, type CliStatus } from "~/types/tauri.gen";

const CLI_STATUS_QUERY_KEY = ["cli-status"] as const;

// L'application n'embarque plus la CLI (issue 546) : elle s'installe à part depuis
// les sources, comme le décrit le guide d'installation.
export const CLI_INSTALL_COMMAND = "cargo install --locked --path apps/cli";

async function loadStatus() {
  const result = await commands.checkCliStatus();
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return result.data;
}

export function buildMcpConfiguration(command: string) {
  return JSON.stringify(
    {
      mcpServers: {
        syntheo: {
          command,
          args: ["mcp"],
        },
      },
    },
    null,
    2,
  );
}

export function CliSettingsSections() {
  // `t` de @lingui/core/macro lit la langue au rendu : s'abonner au changement de
  // langue pour se redessiner aussitôt, sous-composants compris (issue 558).
  useLingui();
  const statusQuery = useQuery({
    queryKey: CLI_STATUS_QUERY_KEY,
    queryFn: loadStatus,
  });

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-sans text-lg font-semibold">{t`CLI & MCP`}</h2>
      <div className="flex flex-col gap-4">
        <CliRow
          status={statusQuery.data}
          isLoading={statusQuery.isPending}
          error={statusQuery.error}
          isRefreshing={statusQuery.isFetching}
          onRefresh={() => void statusQuery.refetch()}
        />
        <McpRow status={statusQuery.data} />
        <SkillsRow />
      </div>
    </section>
  );
}

function CliRow({
  status,
  isLoading,
  error,
  isRefreshing,
  onRefresh,
}: {
  status: CliStatus | undefined;
  isLoading: boolean;
  error: Error | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const isInstalled = status?.path != null;

  return (
    <div data-setting-id="cli" className="flex flex-col gap-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <Trans>Syntheo CLI</Trans>
            {isInstalled && (
              <CheckCircle
                aria-label={t`Installed`}
                className="text-primary size-3.5"
              />
            )}
          </h3>
          <CliStatusLine status={status} isLoading={isLoading} error={error} />
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRefreshing}
            onClick={onRefresh}
          >
            {isRefreshing ? (
              <CircleNotch className="size-3.5 animate-spin" />
            ) : (
              t`Check again`
            )}
          </Button>
        </div>
      </div>
      {status && !isInstalled && <CliInstallHint />}
    </div>
  );
}

function CliStatusLine({
  status,
  isLoading,
  error,
}: {
  status: CliStatus | undefined;
  isLoading: boolean;
  error: Error | null;
}) {
  if (isLoading) {
    return (
      <span className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
        <CircleNotch className="size-3 animate-spin" />
        {t`Checking…`}
      </span>
    );
  }

  if (error) {
    return (
      <p className="text-destructive mt-1 text-xs">
        {t`Could not check the CLI: ${error.message}`}
      </p>
    );
  }

  if (!status) {
    return null;
  }

  return (
    <div className="mt-1 flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground break-all">
        {status.path ?? t`Not found on this computer`}
      </span>
      {status.shadowedByApp && (
        <span className="text-chart-3">
          {t`The ${status.commandName} command on your PATH opens the desktop app. Use the CLI's absolute path.`}
        </span>
      )}
    </div>
  );
}

function CliInstallHint() {
  return (
    <div className="bg-muted/50 flex flex-col gap-2 rounded-md p-3 text-xs">
      <p className="text-muted-foreground">
        {t`The CLI is not bundled with the app. Install it from a clone of the Syntheo repository:`}
      </p>
      <div className="flex items-center gap-2">
        <code className="bg-background min-w-0 flex-1 truncate rounded px-2 py-1 font-mono">
          {CLI_INSTALL_COMMAND}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={t`Copy install command`}
          onClick={() =>
            void copyText(CLI_INSTALL_COMMAND, t`Install command copied`)
          }
        >
          <Copy className="size-3.5" />
        </Button>
      </div>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto self-start p-0 text-xs"
        onClick={() =>
          void openerCommands
            .openUrl(documentationUrl(i18n.locale, "installation"), null)
            .catch((error) =>
              console.error(
                "[settings] failed to open installation guide",
                error,
              ),
            )
        }
      >
        {t`Installation guide`}
        <ArrowSquareOut className="size-3" />
      </Button>
    </div>
  );
}

function McpRow({ status }: { status: CliStatus | undefined }) {
  const path = status?.path ?? null;

  return (
    <div
      data-setting-id="mcp-server"
      className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <h3 className="text-sm font-medium">{t`MCP server`}</h3>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={path === null}
          onClick={() => {
            if (path === null) {
              return;
            }
            void copyText(
              buildMcpConfiguration(path),
              t`MCP configuration copied`,
            );
          }}
        >
          <Copy className="size-3.5" />
          {t`Copy config`}
        </Button>
      </div>
    </div>
  );
}
