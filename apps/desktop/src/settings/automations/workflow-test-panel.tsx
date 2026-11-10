import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";

import { commands as openerCommands } from "@syntheo/plugin-opener2";
import {
  CircleNotch,
  MagnifyingGlass,
  Play,
  Warning,
  X,
} from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import { Checkbox } from "@syntheo/ui/components/ui/checkbox";
import { Input } from "@syntheo/ui/components/ui/input";
import { toast } from "@syntheo/ui/components/ui/toast";
import { cn } from "@syntheo/utils";

import {
  type ArtifactActions,
  WorkflowTestResultView,
} from "./workflow-test-result";

import {
  testWorkflowOnNote,
  type WorkflowTestResult,
} from "~/automations/engine";
import {
  type AutomationLabels,
  useAutomationLabels,
} from "~/automations/labels";
import { type StepEffectKind, stepsWithRealEffects } from "~/automations/steps";
import {
  defaultTestNoteId,
  filterTestNotes,
  type TestNote,
  useTestNotes,
} from "~/automations/test-notes";
import type { AutomationWorkflow } from "~/automations/workflows";
import { useTabs } from "~/store/zustand/tabs";

// « Tester sur une note » : lance l'automatisation telle qu'elle est éditée,
// même non enregistrée, sur une note existante. Les étapes à effet réel sont
// listées avant le lancement ; le test ne touche ni la dernière exécution ni
// la liste des notes traitées.

export type TestRun = {
  workflow: AutomationWorkflow;
  note: TestNote | null;
  result: WorkflowTestResult;
};

export function WorkflowTestPanel({
  workflow,
  onClose,
}: {
  workflow: AutomationWorkflow;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const notes = useTestNotes();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [simulate, setSimulate] = useState(false);
  const openNew = useTabs((state) => state.openNew);
  const selectedId = chosenId ?? defaultTestNoteId(notes);

  const run = useMutation({
    mutationKey: ["automation-workflow-test", workflow.id],
    // L'automatisation est figée avec son résultat : la modifier ensuite
    // ne fausse pas l'affichage du test.
    mutationFn: async (sessionId: string): Promise<TestRun> => ({
      workflow,
      note: notes.find((note) => note.id === sessionId) ?? null,
      result: await testWorkflowOnNote(workflow, sessionId, { simulate }),
    }),
    onError: (error) => {
      console.error("[automations] test failed", error);
      toast.error(t`The test could not run`);
    },
  });

  const artifactActions: ArtifactActions = {
    openFile: (path) => {
      void openerCommands
        .openPath(path, null)
        .catch((error) => console.error("[automations] open failed", error));
    },
    revealFile: (path) => {
      void openerCommands
        .revealItemInDir(path)
        .catch((error) => console.error("[automations] reveal failed", error));
    },
    openNote: (sessionId) => openNew({ type: "sessions", id: sessionId }),
  };

  return (
    <WorkflowTestPanelView
      workflow={workflow}
      notes={notes}
      selectedId={selectedId}
      onSelect={setChosenId}
      query={query}
      onQueryChange={setQuery}
      simulate={simulate}
      onSimulateChange={setSimulate}
      running={run.isPending}
      testRun={run.data ?? null}
      onLaunch={() => {
        if (selectedId) run.mutate(selectedId);
      }}
      onClose={onClose}
      artifactActions={artifactActions}
    />
  );
}

export function WorkflowTestPanelView({
  workflow,
  notes,
  selectedId,
  onSelect,
  query,
  onQueryChange,
  simulate,
  onSimulateChange,
  running,
  testRun,
  onLaunch,
  onClose,
  artifactActions,
}: {
  workflow: AutomationWorkflow;
  notes: TestNote[];
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  simulate: boolean;
  onSimulateChange: (simulate: boolean) => void;
  running: boolean;
  testRun: TestRun | null;
  onLaunch: () => void;
  onClose: () => void;
  artifactActions: ArtifactActions;
}) {
  const { t } = useLingui();
  const labels = useAutomationLabels();
  const simulateId = useId();

  return (
    <section
      aria-labelledby="workflow-test-title"
      className="border-border bg-background flex flex-col gap-4 rounded-2xl border p-5"
    >
      <div className="flex items-center gap-2">
        <h3 id="workflow-test-title" className="text-sm font-semibold">
          <Trans>Test on a note</Trans>
        </h3>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="text-muted-foreground ml-auto size-7"
          onClick={onClose}
          aria-label={t`Close the test`}
        >
          <X size={14} />
        </Button>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        <Trans>
          Syntheo runs the automation as it is edited, even unsaved, on the note
          you choose.
        </Trans>
      </p>

      <TestNotePicker
        notes={notes}
        selectedId={selectedId}
        onSelect={onSelect}
        query={query}
        onQueryChange={onQueryChange}
      />

      <RealEffectsWarning
        workflow={workflow}
        simulate={simulate}
        labels={labels}
      />

      <div className="flex items-start gap-2">
        <Checkbox
          id={simulateId}
          checked={simulate}
          onCheckedChange={(checked) => onSimulateChange(checked === true)}
          className="mt-0.5"
        />
        <label htmlFor={simulateId} className="flex flex-col gap-0.5">
          <span className="text-xs font-medium">
            <Trans>Simulate the steps with real effects</Trans>
          </span>
          <span className="text-muted-foreground text-xs">
            <Trans>
              They describe what they would do, without acting. The local model
              still generates its text.
            </Trans>
          </span>
        </label>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          <Trans>Cancel</Trans>
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onLaunch}
          disabled={running || !selectedId}
        >
          {running ? (
            <CircleNotch size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          {running ? <Trans>Test running…</Trans> : <Trans>Run the test</Trans>}
        </Button>
      </div>

      {testRun && !running ? (
        <WorkflowTestResultView
          workflow={testRun.workflow}
          result={testRun.result}
          note={testRun.note}
          labels={labels}
          actions={artifactActions}
        />
      ) : null}
    </section>
  );
}

function TestNotePicker({
  notes,
  selectedId,
  onSelect,
  query,
  onQueryChange,
}: {
  notes: TestNote[];
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const { t, i18n } = useLingui();
  const searchId = useId();
  const visible = useMemo(() => filterTestNotes(notes, query), [notes, query]);
  const defaultId = defaultTestNoteId(notes);
  const formatDate = useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    return (value: string) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "" : format.format(date);
    };
  }, [i18n.locale]);

  if (notes.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        <Trans>No note yet: record or write a note first.</Trans>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={searchId} className="text-xs font-medium">
        <Trans>Note</Trans>
      </label>
      <div className="relative max-w-md">
        <MagnifyingGlass
          size={13}
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
        />
        <Input
          id={searchId}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t`Search by title`}
          className="h-8 pl-8 text-xs"
        />
      </div>
      <ul
        role="listbox"
        aria-label={t`Note to test on`}
        className="border-border divide-border max-h-44 max-w-md divide-y overflow-y-auto rounded-lg border"
      >
        {visible.length === 0 ? (
          <li className="text-muted-foreground px-3 py-2 text-xs">
            <Trans>No note matches this search.</Trans>
          </li>
        ) : (
          visible.map((note) => {
            const selected = note.id === selectedId;
            return (
              <li
                key={note.id}
                role="option"
                aria-selected={selected}
                tabIndex={0}
                onClick={() => onSelect(note.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(note.id);
                  }
                }}
                className={cn([
                  "focus-visible:ring-ring flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-xs outline-none focus-visible:ring-1",
                  selected
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50",
                ])}
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {note.title || t`Untitled note`}
                </span>
                {note.id === defaultId ? (
                  <span className="text-muted-foreground shrink-0">
                    <Trans>most recent</Trans>
                  </span>
                ) : null}
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {formatDate(note.createdAt)}
                </span>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

function RealEffectsWarning({
  workflow,
  simulate,
  labels,
}: {
  workflow: AutomationWorkflow;
  simulate: boolean;
  labels: AutomationLabels;
}) {
  const effectTexts = useEffectTexts();
  const effects = stepsWithRealEffects(workflow.steps);
  if (effects.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        <Trans>
          No step acts outside Syntheo: the test only shows the results.
        </Trans>
      </p>
    );
  }
  return (
    <div
      role="note"
      className={cn([
        "flex gap-2 rounded-lg border px-3 py-2 text-xs",
        simulate
          ? "border-border bg-muted/40 text-muted-foreground"
          : "border-alert-border bg-alert text-alert-foreground",
      ])}
    >
      <Warning size={14} className="mt-0.5 shrink-0" />
      <div className="flex flex-col gap-1">
        <span className="font-medium">
          {simulate ? (
            <Trans>
              These steps will be simulated: nothing is written, sent or run.
            </Trans>
          ) : (
            <Trans>This is a real test: these steps really act.</Trans>
          )}
        </span>
        <ul className="flex flex-col gap-0.5">
          {effects.map(({ step, number, effect }) => (
            <li key={step.id}>
              <span className="font-medium">
                {number} · {labels.step[step.type].title}
              </span>{" "}
              — {effectTexts[effect]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function useEffectTexts(): Record<StepEffectKind, string> {
  const { t } = useLingui();
  return {
    file: t`writes a Markdown file to the chosen folder`,
    vault: t`creates or completes a note in your vault`,
    clipboard: t`replaces the content of the clipboard`,
    notification: t`shows a system notification`,
    webhook: t`sends the JSON to the address, outside your computer`,
    command: t`runs the program on your computer`,
  };
}
