import { useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";

import { toast } from "@syntheo/ui/components/ui/toast";

import { useAutomationLabels } from "./labels";
import { useAutomationSelection } from "./selection";
import {
  type AutomationTemplate,
  createWorkflowFromTemplate,
} from "./templates";
import {
  mutateAutomationWorkflows,
  parseAutomationWorkflows,
  saveAutomationWorkflows,
} from "./workflows";

import { deleteChatGroup } from "~/chat/store/queries";
import { getStoredSettingValues } from "~/settings/queries";

/** « Partir d'un modèle » : crée l'automatisation et l'ouvre dans l'éditeur. */
export function useCreateWorkflowFromTemplate() {
  const { t } = useLingui();
  const labels = useAutomationLabels();
  const selectWorkflow = useAutomationSelection(
    (state) => state.selectWorkflow,
  );

  return useMutation({
    mutationKey: ["automation-create-from-template"],
    mutationFn: async (template: AutomationTemplate) => {
      const label = labels.template[template.id];
      const workflow = createWorkflowFromTemplate(
        template,
        label?.title ?? "",
        label?.texts,
      );
      if (!workflow) {
        throw new Error("template unavailable");
      }
      await mutateAutomationWorkflows((current) => [workflow, ...current]);
      return workflow;
    },
    onSuccess: (workflow) => selectWorkflow(workflow.id),
    onError: () => toast.error(t`Could not create the automation`),
  });
}

export function useDeleteChatAutomation() {
  const { t } = useLingui();
  const clearSelection = useAutomationSelection(
    (state) => state.clearSelection,
  );

  return useMutation({
    mutationKey: ["automation-delete-chat"],
    mutationFn: async (groupId: string) => {
      const stored = await getStoredSettingValues();
      const workflows = parseAutomationWorkflows(
        stored.values.automation_workflows,
      );
      const remaining = workflows.filter(
        (workflow) => workflow.chatGroupId !== groupId,
      );
      if (remaining.length !== workflows.length) {
        await saveAutomationWorkflows(remaining);
      }
      await deleteChatGroup(groupId);
    },
    onSuccess: (_, groupId) => {
      clearSelection({ kind: "chat", groupId });
      toast.success(t`Automation deleted`);
    },
    onError: () => toast.error(t`Could not delete the automation`),
  });
}

export function useDeleteWorkflow() {
  const { t } = useLingui();
  const clearSelection = useAutomationSelection(
    (state) => state.clearSelection,
  );

  return useMutation({
    mutationKey: ["automation-delete-workflow"],
    mutationFn: async (workflowId: string) => {
      const stored = await getStoredSettingValues();
      const workflows = parseAutomationWorkflows(
        stored.values.automation_workflows,
      );
      const workflow = workflows.find((item) => item.id === workflowId);
      await saveAutomationWorkflows(
        workflows.filter((item) => item.id !== workflowId),
      );
      if (workflow?.chatGroupId) {
        await deleteChatGroup(workflow.chatGroupId);
      }
    },
    onSuccess: (_, workflowId) => {
      clearSelection({ kind: "workflow", workflowId });
      toast.success(t`Automation deleted`);
    },
    onError: () => toast.error(t`Could not delete the automation`),
  });
}
