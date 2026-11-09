import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import {
  CheckCircle,
  FileText,
  FolderOpen,
  MinusCircle,
  XCircle,
} from "@syntheo/ui/components/icons";
import { Badge } from "@syntheo/ui/components/ui/badge";
import { Button } from "@syntheo/ui/components/ui/button";
import { cn } from "@syntheo/utils";

import type { StepOutcome, WorkflowTestResult } from "~/automations/engine";
import type { AutomationLabels } from "~/automations/labels";
import { stepDefinition } from "~/automations/steps";
import type { TestNote } from "~/automations/test-notes";
import type { AutomationWorkflow } from "~/automations/workflows";

// Résultat d'un test, étape par étape : le déclencheur (la note choisie),
// puis chaque action — réussie, en erreur avec son message, ou non lancée
// après une erreur — avec sa sortie et le fichier ou la note produite.

export type ArtifactActions = {
  openFile: (path: string) => void;
  revealFile: (path: string) => void;
  openNote: (sessionId: string) => void;
};

/** Au-delà, la sortie se déplie à la demande. */
const OUTPUT_PREVIEW_CHARS = 280;

export function WorkflowTestResultView({
  workflow,
  result,
  note,
  labels,
  actions,
}: {
  /** L'automatisation telle qu'elle a été testée. */
  workflow: AutomationWorkflow;
  result: WorkflowTestResult;
  note: TestNote | null;
  labels: AutomationLabels;
  actions: ArtifactActions;
}) {
  const { t, i18n } = useLingui();
  const seconds = new Intl.NumberFormat(i18n.locale, {
    maximumFractionDigits: 1,
  }).format(result.durationMs / 1000);
  const noteTitle = note?.title || t`Untitled note`;
  const outcomes = new Map(result.steps.map((step) => [step.stepId, step]));

  return (
    <div
      aria-labelledby="workflow-test-result-title"
      role="region"
      className="border-border flex flex-col gap-3 border-t pt-4"
    >
      <div className="flex items-baseline gap-2">
        <h4 id="workflow-test-result-title" className="text-sm font-semibold">
          <Trans>Test result</Trans>
        </h4>
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          <Trans>{seconds} s</Trans>
        </span>
      </div>
      <ol className="flex flex-col gap-2">
        <ResultRow
          status="success"
          title={`1 · ${labels.trigger[workflow.trigger].long}`}
        >
          <p className="text-muted-foreground text-xs">
            <Trans>Note “{noteTitle}”</Trans>
          </p>
        </ResultRow>
        {workflow.steps.map((step, index) => {
          const outcome = outcomes.get(step.id);
          if (!outcome) return null;
          return (
            <ResultRow
              key={step.id}
              status={outcome.status}
              title={`${index + 2} · ${labels.step[step.type].title}`}
              simulated={outcome.simulated}
            >
              <StepOutcomeBody
                outcome={outcome}
                showsText={stepDefinition(step).output === "text"}
                actions={actions}
                isLastBeforeSkipped={
                  outcome.status === "error" &&
                  result.steps.some((other) => other.status === "skipped")
                }
              />
            </ResultRow>
          );
        })}
      </ol>
      <p className="text-muted-foreground text-xs">
        <Trans>
          The test changes neither the last run nor the list of notes already
          processed.
        </Trans>
      </p>
    </div>
  );
}

function ResultRow({
  status,
  title,
  simulated = false,
  children,
}: {
  status: StepOutcome["status"];
  title: string;
  simulated?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex list-none items-start gap-2.5">
      <span className="mt-0.5 shrink-0" data-status={status}>
        {status === "success" ? (
          <CheckCircle size={15} className="text-chart-2" />
        ) : status === "error" ? (
          <XCircle size={15} className="text-destructive" />
        ) : (
          <MinusCircle size={15} className="text-muted-foreground" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn([
              "text-xs font-semibold",
              status === "skipped" ? "text-muted-foreground" : null,
            ])}
          >
            {title}
          </span>
          {simulated ? (
            <Badge variant="outline" size="sm">
              <Trans>Simulated</Trans>
            </Badge>
          ) : null}
        </div>
        {children}
      </div>
    </li>
  );
}

function StepOutcomeBody({
  outcome,
  showsText,
  actions,
  isLastBeforeSkipped,
}: {
  outcome: StepOutcome;
  showsText: boolean;
  actions: ArtifactActions;
  isLastBeforeSkipped: boolean;
}) {
  if (outcome.status === "skipped") {
    return (
      <p className="text-muted-foreground text-xs">
        <Trans>Not run</Trans>
      </p>
    );
  }
  if (outcome.status === "error") {
    return (
      <p className="text-destructive text-xs">
        {outcome.detail}
        {isLastBeforeSkipped ? (
          <>
            {" "}
            <Trans>The next steps were not run.</Trans>
          </>
        ) : null}
      </p>
    );
  }
  const artifact = outcome.artifact;
  return (
    <>
      {artifact?.kind === "file" ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
          <span className="text-muted-foreground">
            <Trans>Created:</Trans>
          </span>
          <button
            type="button"
            onClick={() => actions.openFile(artifact.path)}
            className="text-primary inline-flex min-w-0 items-center gap-1 underline-offset-2 hover:underline"
            title={artifact.path}
          >
            <FileText size={12} className="shrink-0" />
            <span className="truncate">{artifact.path}</span>
          </button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground h-6 px-1.5 text-xs"
            onClick={() => actions.revealFile(artifact.path)}
          >
            <FolderOpen size={12} />
            <Trans>Show in folder</Trans>
          </Button>
        </div>
      ) : artifact?.kind === "note" ? (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-muted-foreground">{outcome.detail}</span>
          <button
            type="button"
            onClick={() => actions.openNote(artifact.sessionId)}
            className="text-primary underline-offset-2 hover:underline"
          >
            <Trans>Open the note</Trans>
          </button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">{outcome.detail}</p>
      )}
      {showsText && outcome.output ? (
        <OutputPreview text={outcome.output} />
      ) : null}
    </>
  );
}

function OutputPreview({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > OUTPUT_PREVIEW_CHARS;
  const shown =
    long && !expanded
      ? `${text.slice(0, OUTPUT_PREVIEW_CHARS).trimEnd()}…`
      : text;
  return (
    <div className="bg-muted/40 border-border rounded-lg border px-3 py-2">
      <pre className="text-foreground max-h-72 overflow-y-auto font-sans text-xs leading-relaxed whitespace-pre-wrap">
        {shown}
      </pre>
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="text-primary mt-1 text-xs underline-offset-2 hover:underline"
        >
          {expanded ? <Trans>Show less</Trans> : <Trans>Show all</Trans>}
        </button>
      ) : null}
    </div>
  );
}
