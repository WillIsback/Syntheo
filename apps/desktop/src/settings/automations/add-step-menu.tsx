import { Trans, useLingui } from "@lingui/react/macro";

import { Plus } from "@syntheo/ui/components/icons";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "@syntheo/ui/components/ui/select";

import type { AutomationLabels } from "~/automations/labels";
import {
  STEP_DEFINITIONS,
  WORKFLOW_STEP_TYPES,
  type WorkflowStepType,
} from "~/automations/steps";

// Menu « Ajouter une étape » : les actions locales, puis les actions
// avancées (webhook, commande) sous « Avancé », comme la maquette.

export function AddWorkflowStep({
  onAdd,
  labels,
}: {
  onAdd: (type: WorkflowStepType) => void;
  labels: AutomationLabels;
}) {
  const { t } = useLingui();

  return (
    <div className="border-border bg-muted/20 mt-6 flex items-center justify-between gap-3 rounded-xl border border-dashed p-4">
      <div>
        <p className="text-sm font-medium">
          <Trans>Add a step</Trans>
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          <Trans>Each new step runs after the previous one.</Trans>
        </p>
      </div>
      <Select
        value=""
        onValueChange={(value) => onAdd(value as WorkflowStepType)}
      >
        <SelectTrigger className="h-8 w-44 shrink-0 text-xs">
          <span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Plus size={12} className="shrink-0" />
              {t`Add a step`}
            </span>
          </span>
        </SelectTrigger>
        <SelectContent className="max-w-sm">
          <StepTypeItems labels={labels} withDescriptions />
        </SelectContent>
      </Select>
    </div>
  );
}

/** Les actions, puis les actions avancées sous « Avancé » (maquette). */
export function StepTypeItems({
  labels,
  withDescriptions = false,
}: {
  labels: AutomationLabels;
  withDescriptions?: boolean;
}) {
  const item = (type: WorkflowStepType) => (
    <SelectItem key={type} value={type} data-step-type={type}>
      {withDescriptions ? (
        <span className="flex flex-col">
          <span>{labels.step[type].title}</span>
          <span className="text-muted-foreground text-xs whitespace-normal">
            {labels.step[type].description}
          </span>
        </span>
      ) : (
        labels.step[type].title
      )}
    </SelectItem>
  );
  const basic = WORKFLOW_STEP_TYPES.filter(
    (type) => !STEP_DEFINITIONS[type].advanced,
  );
  const advanced = WORKFLOW_STEP_TYPES.filter(
    (type) => STEP_DEFINITIONS[type].advanced,
  );
  return (
    <>
      <SelectGroup>{basic.map(item)}</SelectGroup>
      {advanced.length > 0 ? (
        <>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              <Trans>Advanced</Trans>
            </SelectLabel>
            {advanced.map(item)}
          </SelectGroup>
        </>
      ) : null}
    </>
  );
}
