import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { useId } from "react";

import { ArrowRight, Trash } from "@syntheo/ui/components/icons";
import { Badge } from "@syntheo/ui/components/ui/badge";
import { Button } from "@syntheo/ui/components/ui/button";
import { Input } from "@syntheo/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@syntheo/ui/components/ui/select";
import { toast } from "@syntheo/ui/components/ui/toast";
import { cn } from "@syntheo/utils";

import { AddWorkflowStep, StepTypeItems } from "./add-step-menu";
import {
  AutomationLastRunLine,
  MarkdownExportConfig,
} from "./markdown-export-config";
import { MarkdownExportOptionsConfig } from "./markdown-export-options";
import {
  ClipboardForm,
  CommandForm,
  GenerateTextForm,
  NotificationForm,
  VaultWriteForm,
  WebhookForm,
} from "./step-forms";
import { VariableChips } from "./variable-field";

import {
  type AutomationLabels,
  useAutomationLabels,
  workflowTitle,
} from "~/automations/labels";
import { DEFAULT_MARKDOWN_EXPORT_OPTIONS } from "~/automations/markdown-export";
import { stepDefinition } from "~/automations/steps";
import {
  type AvailableVariable,
  availableVariables,
} from "~/automations/variables";
import {
  type AutomationWorkflow,
  createWorkflowStep,
  isWorkflowReady,
  isWorkflowStepReady,
  WORKFLOW_TRIGGERS,
  type WorkflowStep,
  type WorkflowStepType,
  type WorkflowTrigger,
} from "~/automations/workflows";

// Éditeur : le déclencheur est l'étape 1, les actions suivent (2, 3…) ; le
// numéro dit l'ordre d'exécution.
export function WorkflowBuilder({
  workflow,
  onChange,
}: {
  workflow: AutomationWorkflow;
  onChange: (workflow: AutomationWorkflow) => void;
}) {
  const { t } = useLingui();
  const labels = useAutomationLabels();
  const nameId = useId();

  const update = (patch: Partial<AutomationWorkflow>) => {
    onChange({ ...workflow, ...patch });
  };

  const updateStep = (stepId: string, next: WorkflowStep) => {
    update({
      steps: workflow.steps.map((step) => (step.id === stepId ? next : step)),
    });
  };

  const addStep = (type: WorkflowStepType) => {
    update({ steps: [...workflow.steps, createWorkflowStep(type)] });
  };

  const changeStepType = (step: WorkflowStep, type: WorkflowStepType) => {
    if (type === step.type) return;
    const next = createWorkflowStep(type);
    updateStep(step.id, { ...next, id: step.id });
  };

  const removeStep = (stepId: string) => {
    update({ steps: workflow.steps.filter((step) => step.id !== stepId) });
  };

  return (
    <section
      className="border-border bg-background overflow-hidden rounded-2xl border"
      aria-labelledby="workflow-builder-title"
    >
      <div className="border-border flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3
              id="workflow-builder-title"
              className="truncate text-sm font-semibold"
            >
              <Trans>Steps</Trans>
            </h3>
            <WorkflowStatusBadge workflow={workflow} />
          </div>
          <p className="text-muted-foreground text-xs">
            <Trans>
              Syntheo runs the steps in order on your computer: the trigger is
              step 1, then each action follows.
            </Trans>
          </p>
          <div className="flex max-w-sm flex-col gap-1">
            <label htmlFor={nameId} className="text-xs font-medium">
              <Trans>Name</Trans>
            </label>
            {/* Enregistré à la sortie du champ, pas à chaque frappe. */}
            <Input
              key={workflow.id}
              id={nameId}
              defaultValue={workflow.title}
              placeholder={workflowTitle(workflow, labels)}
              onBlur={(event) => {
                const title = event.target.value.trim();
                if (title !== workflow.title) {
                  update({ title });
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>

      <ol className="flex flex-col gap-0 p-5">
        <WorkflowCard
          number={1}
          kind="trigger"
          eyebrow={t`When`}
          title={labels.trigger[workflow.trigger].long}
        >
          <Select
            value={workflow.trigger}
            onValueChange={(value) =>
              update({ trigger: value as WorkflowTrigger })
            }
          >
            <SelectTrigger
              className="h-8 w-full max-w-xs text-xs"
              aria-label={t`Trigger`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKFLOW_TRIGGERS.map((trigger) => (
                <SelectItem key={trigger} value={trigger}>
                  {labels.trigger[trigger].long}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {workflow.trigger === "manual" ? (
            <p className="text-muted-foreground mt-2 text-xs">
              <Trans>
                Launch it from a note: the ⋯ menu, the capsule in Synthesis, or
                Ask the note (Ctrl+J).
              </Trans>
            </p>
          ) : null}
          <VariableChips
            caption={t`Available to the next steps`}
            variables={availableVariables(workflow, 0)}
            labels={labels}
          />
        </WorkflowCard>

        {workflow.steps.map((step, index) => {
          const stepNumber = index + 2;
          return (
            <WorkflowCard
              key={step.id}
              number={stepNumber}
              kind="action"
              eyebrow={t`Then`}
              title={labels.step[step.type].title}
              ready={isWorkflowStepReady(step)}
              removeLabel={t`Remove step ${stepNumber}`}
              onRemove={() => removeStep(step.id)}
            >
              <Select
                value={step.type}
                onValueChange={(value) =>
                  changeStepType(step, value as WorkflowStepType)
                }
              >
                <SelectTrigger
                  className="h-8 w-full max-w-xs text-xs"
                  aria-label={t`Action`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <StepTypeItems labels={labels} />
                </SelectContent>
              </Select>
              <div className="mt-3">
                <WorkflowStepConfig
                  step={step}
                  onChange={(next) => updateStep(step.id, next)}
                  variables={availableVariables(workflow, index)}
                  labels={labels}
                />
              </div>
              <StepOutputLine
                step={step}
                number={stepNumber}
                workflow={workflow}
                labels={labels}
              />
            </WorkflowCard>
          );
        })}

        <li className="list-none">
          <AddWorkflowStep onAdd={addStep} labels={labels} />
        </li>
      </ol>

      <div className="border-border border-t px-5 py-4">
        {!isWorkflowReady(workflow) ? (
          <p className="text-muted-foreground text-xs">
            <Trans>Add at least one configured action before enabling.</Trans>
          </p>
        ) : null}
        <AutomationLastRunLine lastRun={workflow.lastRun} />
      </div>
    </section>
  );
}

export function WorkflowStatusBadge({
  workflow,
}: {
  workflow: Pick<AutomationWorkflow, "enabled" | "trigger">;
}) {
  if (workflow.trigger === "manual") {
    return (
      <Badge variant="outline">
        <Trans>Manual</Trans>
      </Badge>
    );
  }
  return workflow.enabled ? (
    <Badge variant="outline">
      <Trans>Enabled</Trans>
    </Badge>
  ) : (
    <Badge variant="outline">
      <Trans>Draft</Trans>
    </Badge>
  );
}

function WorkflowStepConfig({
  step,
  onChange,
  variables,
  labels,
}: {
  step: WorkflowStep;
  onChange: (step: WorkflowStep) => void;
  variables: AvailableVariable[];
  labels: AutomationLabels;
}) {
  const form = { onChange, variables, labels };
  switch (step.type) {
    case "generate_text":
      return <GenerateTextForm step={step} {...form} />;
    case "vault_write":
      return <VaultWriteForm step={step} {...form} />;
    case "clipboard":
      return <ClipboardForm step={step} {...form} />;
    case "notification":
      return <NotificationForm step={step} {...form} />;
    case "webhook":
      return <WebhookForm step={step} {...form} />;
    case "command":
      return <CommandForm step={step} {...form} />;
    case "markdown_export":
      return (
        <>
          <MarkdownExportConfig
            value={step.directory}
            onChange={(directory) => onChange({ ...step, directory })}
          />
          <MarkdownExportOptionsConfig
            options={step.options ?? DEFAULT_MARKDOWN_EXPORT_OPTIONS}
            onChange={(options) => onChange({ ...step, options })}
          />
        </>
      );
  }
}

/** Ce que l'étape publie pour les suivantes (pastille). */
function StepOutputLine({
  step,
  number,
  workflow,
  labels,
}: {
  step: WorkflowStep;
  number: number;
  workflow: AutomationWorkflow;
  labels: AutomationLabels;
}) {
  const { t } = useLingui();
  const output = availableVariables(workflow, number - 1).find(
    (variable) => variable.kind === "output" && variable.stepId === step.id,
  );
  // Une sortie texte se renomme dans son formulaire, qui l'affiche déjà.
  if (!output || stepDefinition(step).output !== "file") {
    return null;
  }
  return (
    <VariableChips
      caption={t`Result available to the next steps as`}
      variables={[output]}
      labels={labels}
    />
  );
}

function WorkflowCard({
  number,
  kind,
  eyebrow,
  title,
  ready = true,
  removeLabel,
  onRemove,
  children,
}: {
  number: number;
  kind: "trigger" | "action";
  eyebrow: string;
  title: string;
  ready?: boolean;
  removeLabel?: string;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  return (
    <li className="list-none">
      {number > 1 ? (
        <div
          aria-hidden="true"
          className="text-muted-foreground flex h-6 items-center pl-6"
        >
          <ArrowRight className="rotate-90" size={13} />
        </div>
      ) : null}
      <div className="border-border bg-card flex items-start gap-3 rounded-xl border p-4">
        <span
          data-step-number={number}
          className={cn([
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            kind === "trigger"
              ? "bg-chart-3/15 text-foreground"
              : "bg-chart-2/15 text-chart-2",
          ])}
        >
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex min-w-0 flex-col">
              <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                {eyebrow}
              </span>
              <span className="text-sm font-medium">{title}</span>
            </span>
            {!ready ? (
              <Badge variant="outline" size="sm">
                <Trans>Needs setup</Trans>
              </Badge>
            ) : null}
            {onRemove ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-muted-foreground ml-auto size-7"
                onClick={onRemove}
                aria-label={removeLabel}
              >
                <Trash size={13} />
              </Button>
            ) : null}
          </div>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </li>
  );
}

export function useSaveWorkflow() {
  const { t } = useLingui();
  return useMutation({
    mutationKey: ["automation-workflow-save"],
    mutationFn: async ({ next }: { next: AutomationWorkflow }) => {
      const { mutateAutomationWorkflows } =
        await import("~/automations/workflows");
      next = { ...next, enabled: next.enabled && isWorkflowReady(next) };
      await mutateAutomationWorkflows((current) => {
        const existing = current.find((workflow) => workflow.id === next.id);
        const updated = existing
          ? {
              ...next,
              lastRun: existing.lastRun,
              processedSessionIds: existing.processedSessionIds,
            }
          : next;
        return existing
          ? current.map((workflow) =>
              workflow.id === next.id ? updated : workflow,
            )
          : [updated, ...current];
      });
    },
    onError: () => toast.error(t`Could not update the automation`),
  });
}
