import { useLingui } from "@lingui/react/macro";
import { useCallback, useMemo } from "react";

import { Lightning } from "@syntheo/ui/components/icons";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@syntheo/ui/components/ui/dropdown-menu";
import { toast } from "@syntheo/ui/components/ui/toast";

import { runWorkflowOnNote } from "./engine";
import { useAutomationLabels, workflowTitle } from "./labels";
import {
  type AutomationWorkflow,
  isWorkflowReady,
  useAutomationWorkflows,
} from "./workflows";

// Lancer une automatisation sur une note : menu ⋯ de la note, capsule en
// Synthèse et « Demander à la note » (Ctrl+J). Les automatisations lancées à
// la main y figurent, comme les automatiques qu'on veut relancer sur une note.

type AutomationLaunchItem = {
  id: string;
  title: string;
  /** Les actions enchaînées, sans le déclencheur. */
  description: string;
  run: () => void;
};

/** Automatisations prêtes (toutes les étapes réglées), à lancer sur une note. */
function useLaunchableWorkflows(): AutomationWorkflow[] {
  const workflows = useAutomationWorkflows();
  return useMemo(() => workflows.filter(isWorkflowReady), [workflows]);
}

/** Lance l'automatisation sur la note et annonce le résultat. */
function useRunWorkflowOnNote() {
  const { t } = useLingui();
  return useCallback(
    async ({
      workflowId,
      sessionId,
      title,
    }: {
      workflowId: string;
      sessionId: string;
      title: string;
    }) => {
      try {
        const record = await runWorkflowOnNote(workflowId, sessionId);
        if (record.status === "success") {
          toast.success(t`“${title}” ran on this note`, {
            description: record.detail,
          });
        } else {
          toast.error(t`“${title}” failed on this note`, {
            description: record.detail,
          });
        }
      } catch (error) {
        console.error("[automations] manual run failed", error);
        toast.error(t`“${title}” could not run on this note`);
      }
    },
    [t],
  );
}

export function useAutomationLaunchItems(
  sessionId: string,
): AutomationLaunchItem[] {
  const labels = useAutomationLabels();
  const workflows = useLaunchableWorkflows();
  const runOnNote = useRunWorkflowOnNote();
  return useMemo(
    () =>
      workflows.map((workflow) => {
        const title = workflowTitle(workflow, labels);
        return {
          id: workflow.id,
          title,
          description: workflow.steps
            .map((step) => labels.step[step.type].title)
            .join(" → "),
          run: () => {
            void runOnNote({ workflowId: workflow.id, sessionId, title });
          },
        };
      }),
    [labels, runOnNote, sessionId, workflows],
  );
}

/** Groupe « Lancer une automatisation » du menu ⋯ de la note. */
export function NoteMenuAutomationItems({ sessionId }: { sessionId: string }) {
  const items = useAutomationLaunchItems(sessionId);
  if (items.length === 0) {
    return null;
  }
  return (
    <>
      <AutomationLaunchMenuItems items={items} />
      <DropdownMenuSeparator />
    </>
  );
}

export function AutomationLaunchMenuItems({
  items,
}: {
  items: AutomationLaunchItem[];
}) {
  const { t } = useLingui();
  return (
    <>
      <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
        {t`Run an automation`}
      </DropdownMenuLabel>
      {items.map((item) => (
        <DropdownMenuItem
          key={item.id}
          onClick={item.run}
          className="cursor-pointer items-start"
        >
          <Lightning className="mt-0.5" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{item.title}</span>
            <span className="text-muted-foreground truncate text-xs">
              {item.description}
            </span>
          </span>
        </DropdownMenuItem>
      ))}
    </>
  );
}
