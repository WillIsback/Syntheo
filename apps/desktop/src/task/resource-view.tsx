import { Trans, useLingui } from "@lingui/react/macro";

import { commands as openerCommands } from "@syntheo/plugin-opener2";
import {
  ArrowSquareOut,
  GitPullRequest,
  RadioButton,
} from "@syntheo/ui/components/icons";

import { type TaskResource } from "~/store/zustand/tabs";

// Les commandes GitHub du plugin todo ont été retirées côté Rust (issue 84) :
// la vue ne charge plus le détail du ticket et renvoie vers GitHub.
export function ResourceView({ resource }: { resource: TaskResource }) {
  const { t } = useLingui();
  const isPR = resource.type === "github_pr";
  const urlPath = isPR ? "pull" : "issues";
  const url = `https://github.com/${resource.owner}/${resource.repo}/${urlPath}/${resource.number}`;
  const Icon = isPR ? GitPullRequest : RadioButton;

  return (
    <div className="w-full max-w-3xl px-6 py-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-foreground flex items-center gap-2 text-xl leading-snug font-semibold">
          <Icon className="text-muted-foreground size-5 shrink-0" />
          <span>
            {resource.owner}/{resource.repo}
            <span className="text-muted-foreground ml-2 font-normal">
              #{resource.number}
            </span>
          </span>
        </h1>
        <button
          type="button"
          className="text-muted-foreground hover:bg-accent hover:text-muted-foreground shrink-0 rounded-md p-1.5 transition-colors"
          onClick={() => openerCommands.openUrl(url, null)}
          title={t`Open on GitHub`}
        >
          <ArrowSquareOut className="size-4" />
        </button>
      </div>
      <div className="border-border text-muted-foreground mt-4 border-t pt-4 text-sm">
        {isPR ? (
          <Trans>Open this pull request on GitHub to see its details.</Trans>
        ) : (
          <Trans>Open this issue on GitHub to see its details.</Trans>
        )}
      </div>
    </div>
  );
}
