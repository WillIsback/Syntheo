import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo } from "react";

import { DotsThree, Lightning, Plus } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import {
  AppFloatingPanel,
  appFloatingMenuPanelClassName,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@syntheo/ui/components/ui/dropdown-menu";
import { formatDistanceToNow } from "@syntheo/utils";

import {
  useSaveWorkflow,
  WorkflowBuilder,
  WorkflowStatusBadge,
} from "./workflow-builder";

import {
  useCreateWorkflowFromTemplate,
  useDeleteChatAutomation,
  useDeleteWorkflow,
} from "~/automations/actions";
import {
  useAutomationLabels,
  workflowChain,
  workflowTitle,
} from "~/automations/labels";
import {
  useAutomationSelection,
  useEffectiveAutomationSelection,
} from "~/automations/selection";
import { availableTemplates } from "~/automations/templates";
import {
  type AutomationWorkflow,
  createEmptyWorkflow,
  isWorkflowReady,
  mutateAutomationWorkflows,
  parseAutomationWorkflows,
  saveAutomationWorkflows,
  useAutomationWorkflows,
} from "~/automations/workflows";
import { useChatGroup } from "~/chat/store/queries";
import { SettingsHydrationBoundary } from "~/settings/hydration-boundary";
import { SettingsPageTitle } from "~/settings/page-title";
import { getStoredSettingValues } from "~/settings/queries";
import { StandardContentWrapper } from "~/shared/main";

export function TabContentAutomations() {
  return (
    <StandardContentWrapper>
      <SettingsHydrationBoundary>
        <div className="bg-card dark:bg-accent flex w-full flex-1 flex-col overflow-hidden">
          <AutomationsContent />
        </div>
      </SettingsHydrationBoundary>
    </StandardContentWrapper>
  );
}

export function AutomationsContent() {
  const selection = useEffectiveAutomationSelection();

  if (selection?.kind === "chat") {
    return <ChatAutomationDetails groupId={selection.groupId} />;
  }

  if (selection?.kind === "draft") {
    return <DraftAutomationDetails draftId={selection.draftId} />;
  }

  if (selection?.kind === "workflow") {
    return <PersistedWorkflowDetails workflowId={selection.workflowId} />;
  }

  return <AutomationsOverview />;
}

// Une seule liste « Mes automatisations », et des modèles pour démarrer : un
// modèle crée une automatisation ordinaire, ouverte dans l'éditeur.
function AutomationsOverview() {
  const labels = useAutomationLabels();
  const workflows = useAutomationWorkflows();
  const templates = availableTemplates();
  const createFromTemplate = useCreateWorkflowFromTemplate();
  const selectWorkflow = useAutomationSelection(
    (state) => state.selectWorkflow,
  );

  const createEmpty = () => {
    const workflow = createEmptyWorkflow();
    void mutateAutomationWorkflows((current) => [workflow, ...current]).then(
      () => selectWorkflow(workflow.id),
    );
  };

  return (
    <div className="scroll-fade-y scrollbar-hide h-full w-full flex-1 overflow-y-auto px-6 pt-3 pb-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SettingsPageTitle
            title={<Trans>Automations</Trans>}
            lede={
              <Trans>
                Syntheo chains local steps after your meetings. Nothing leaves
                your computer.
              </Trans>
            }
          />
          <Button type="button" size="sm" onClick={createEmpty}>
            <Plus size={14} />
            <Trans>New automation</Trans>
          </Button>
        </div>

        {templates.length > 0 ? (
          <section aria-labelledby="automation-templates-title">
            <h3
              id="automation-templates-title"
              className="mb-2 text-sm font-semibold"
            >
              <Trans>Start from a template</Trans>
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => {
                const label = labels.template[template.id];
                const chain = [
                  labels.trigger[template.trigger].short,
                  ...template.stepTypes.map(
                    (type) =>
                      labels.step[type as keyof typeof labels.step]?.title ??
                      type,
                  ),
                ].join(" → ");
                return (
                  <button
                    key={template.id}
                    type="button"
                    disabled={createFromTemplate.isPending}
                    onClick={() => createFromTemplate.mutate(template)}
                    className="border-border bg-background hover:bg-accent/50 flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors"
                  >
                    <span className="text-sm font-medium">{label?.title}</span>
                    <span className="text-muted-foreground text-xs leading-relaxed">
                      {label?.description}
                    </span>
                    <span className="text-chart-2 mt-1 text-[11px] font-medium">
                      {chain}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="my-automations-title">
          <h3 id="my-automations-title" className="mb-2 text-sm font-semibold">
            <Trans>My automations</Trans>
          </h3>
          {workflows.length === 0 ? (
            <div className="border-border bg-muted/20 flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center">
              <span className="bg-background border-border flex size-11 items-center justify-center rounded-2xl border">
                <Lightning className="text-muted-foreground" size={20} />
              </span>
              <p className="text-muted-foreground mt-3 max-w-sm text-xs leading-relaxed">
                <Trans>
                  No automation yet. Start from a template, or create one and
                  add its steps.
                </Trans>
              </p>
            </div>
          ) : (
            <ul className="border-border divide-border flex flex-col divide-y rounded-xl border">
              {workflows.map((workflow) => (
                <li key={workflow.id}>
                  <button
                    type="button"
                    onClick={() =>
                      selectWorkflow(workflow.id, workflow.chatGroupId)
                    }
                    className="hover:bg-accent/50 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {workflowTitle(workflow, labels)}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        <WorkflowSummaryLine workflow={workflow} />
                      </span>
                    </span>
                    <WorkflowStatusBadge workflow={workflow} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function WorkflowSummaryLine({ workflow }: { workflow: AutomationWorkflow }) {
  const labels = useAutomationLabels();
  const chain = workflowChain(workflow, labels);
  if (!workflow.lastRun) {
    return <Trans>{chain} · never run</Trans>;
  }
  const relative = formatDistanceToNow(new Date(workflow.lastRun.at), {
    addSuffix: true,
  });
  return workflow.lastRun.status === "success" ? (
    <Trans>
      {chain} · last run {relative}
    </Trans>
  ) : (
    <Trans>
      {chain} · last run failed {relative}
    </Trans>
  );
}

const EDITOR_DESCRIPTION = (
  <Trans>
    Set the trigger and the actions. The chat on the right can help you shape
    the automation.
  </Trans>
);

function DraftAutomationDetails({ draftId }: { draftId: string }) {
  const removeDraft = useAutomationSelection((state) => state.removeDraft);
  const workflow = useEnsuredWorkflow({ id: draftId });

  return (
    <CustomWorkflowDetails
      workflow={workflow}
      description={EDITOR_DESCRIPTION}
      onDelete={() => removeDraft(draftId)}
    />
  );
}

function AutomationDetailHeader({
  title,
  actions,
}: {
  title: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 pr-1 pl-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center">
          <Lightning className="text-chart-4" size={16} />
        </span>
        <h2 className="min-w-0 truncate text-sm font-semibold">{title}</h2>
      </div>
      {actions}
    </header>
  );
}

function AutomationActionsMenu({
  actionLabel,
  onAction,
}: {
  actionLabel: React.ReactNode;
  onAction: () => void;
}) {
  const { t } = useLingui();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          aria-label={t`Automation actions`}
        >
          <DotsThree className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent variant="app" align="end">
        <AppFloatingPanel className={appFloatingMenuPanelClassName}>
          <DropdownMenuItem onClick={onAction} className="cursor-pointer">
            {actionLabel}
          </DropdownMenuItem>
        </AppFloatingPanel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChatAutomationDetails({ groupId }: { groupId: string }) {
  const group = useChatGroup(groupId, "automations");
  const deleteChatAutomation = useDeleteChatAutomation();
  const createdAt = group?.createdAt
    ? formatDistanceToNow(new Date(group.createdAt), { addSuffix: true })
    : "";
  const workflow = useEnsuredWorkflow({
    chatGroupId: groupId,
    title: group?.title.trim() || undefined,
  });

  return (
    <CustomWorkflowDetails
      workflow={workflow}
      fallbackTitle={group?.title.trim()}
      description={createdAt ? <Trans>Created {createdAt}</Trans> : null}
      onDelete={() => deleteChatAutomation.mutate(groupId)}
    />
  );
}

function PersistedWorkflowDetails({ workflowId }: { workflowId: string }) {
  const deleteWorkflow = useDeleteWorkflow();
  const workflow = useEnsuredWorkflow({ id: workflowId });

  return (
    <CustomWorkflowDetails
      workflow={workflow}
      description={EDITOR_DESCRIPTION}
      onDelete={() => deleteWorkflow.mutate(workflowId)}
    />
  );
}

function CustomWorkflowDetails({
  workflow,
  fallbackTitle,
  description,
  onDelete,
}: {
  workflow: AutomationWorkflow;
  fallbackTitle?: string;
  description: React.ReactNode;
  onDelete: () => void;
}) {
  const { t } = useLingui();
  const labels = useAutomationLabels();
  const saveWorkflow = useSaveWorkflow();

  const persist = (next: AutomationWorkflow) => {
    saveWorkflow.mutate({ next });
  };

  const handleEnable = (enabled: boolean) => {
    persist({ ...workflow, enabled });
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <AutomationDetailHeader
        title={
          workflow.title.trim() ||
          fallbackTitle ||
          workflowTitle(workflow, labels)
        }
        actions={
          <div className="flex items-center gap-2">
            {workflow.trigger === "manual" ? null : workflow.enabled ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleEnable(false)}
                disabled={saveWorkflow.isPending}
              >
                <Trans>Disable</Trans>
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => handleEnable(true)}
                disabled={saveWorkflow.isPending || !isWorkflowReady(workflow)}
                title={
                  !isWorkflowReady(workflow)
                    ? t`Add and configure at least one action first.`
                    : undefined
                }
              >
                <Lightning size={14} />
                <Trans>Save &amp; enable</Trans>
              </Button>
            )}
            <AutomationActionsMenu
              actionLabel={<Trans>Delete automation</Trans>}
              onAction={onDelete}
            />
          </div>
        }
      />
      <div className="scroll-fade-y scrollbar-hide min-h-0 w-full flex-1 overflow-y-auto px-6 pt-3 pb-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          {description ? (
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              {description}
            </p>
          ) : null}
          <WorkflowBuilder workflow={workflow} onChange={persist} />
        </div>
      </div>
    </div>
  );
}

function useEnsuredWorkflow({
  id,
  chatGroupId,
  title,
}: {
  id?: string;
  chatGroupId?: string;
  title?: string;
}): AutomationWorkflow {
  const workflows = useAutomationWorkflows();
  const existing =
    (id ? workflows.find((workflow) => workflow.id === id) : undefined) ??
    (chatGroupId
      ? workflows.find((workflow) => workflow.chatGroupId === chatGroupId)
      : undefined);
  const fallback = useMemo(
    () =>
      createEmptyWorkflow({
        id,
        chatGroupId: chatGroupId ?? null,
        title,
      }),
    [chatGroupId, id, title],
  );

  useEffect(() => {
    if (existing) {
      return;
    }

    void (async () => {
      const stored = await getStoredSettingValues();
      const current = parseAutomationWorkflows(
        stored.values.automation_workflows,
      );
      if (
        current.some(
          (workflow) =>
            workflow.id === fallback.id ||
            (chatGroupId && workflow.chatGroupId === chatGroupId),
        )
      ) {
        return;
      }
      await saveAutomationWorkflows([fallback, ...current]);
    })();
  }, [chatGroupId, existing, fallback]);

  return existing ?? fallback;
}
