import { Trans, useLingui } from "@lingui/react/macro";
import { useId } from "react";

import { Plus, Trash, Warning } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import { Input } from "@syntheo/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@syntheo/ui/components/ui/select";

import { VariableField } from "./variable-field";

import { type AutomationLabels, defaultOutputName } from "~/automations/labels";
import {
  stepDefinition,
  type CommandStep,
  type GenerateTextStep,
  type VaultWriteMode,
  type VaultWriteStep,
  type WebhookStep,
  type WorkflowStep,
} from "~/automations/steps";
import type { AvailableVariable } from "~/automations/variables";
import {
  isWebhookBodyTemplateValid,
  parseWebhookUrl,
} from "~/automations/webhook";

// Formulaires des actions (hors export Markdown, qui a le sien). Chaque champ
// texte accepte les variables de base et les sorties des étapes précédentes.

type FormProps<S extends WorkflowStep> = {
  step: S;
  onChange: (step: S) => void;
  variables: AvailableVariable[];
  labels: AutomationLabels;
};

function Field({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Nom sous lequel la sortie de l'étape est proposée aux suivantes. */
function OutputNameField<S extends WorkflowStep>({
  step,
  onChange,
  labels,
}: Omit<FormProps<S>, "variables">) {
  const { t } = useLingui();
  const fieldId = useId();
  const kind = stepDefinition(step).output;
  if (!kind) return null;
  return (
    <Field
      label={t`Result available to the next steps under the name`}
      htmlFor={fieldId}
    >
      <Input
        key={step.id}
        id={fieldId}
        defaultValue={step.outputName ?? ""}
        placeholder={defaultOutputName(step.type, kind, labels)}
        onBlur={(event) => {
          const outputName = event.target.value.trim();
          if (outputName !== (step.outputName ?? "")) {
            const { outputName: _previous, ...rest } = step;
            onChange((outputName ? { ...rest, outputName } : rest) as S);
          }
        }}
        className="h-8 max-w-xs text-xs"
      />
    </Field>
  );
}

export function GenerateTextForm(props: FormProps<GenerateTextStep>) {
  const { t } = useLingui();
  const { step, onChange, variables, labels } = props;
  return (
    <div className="flex flex-col gap-3">
      <Field label={t`Instruction`}>
        <VariableField
          multiline
          ariaLabel={t`Instruction`}
          value={step.prompt}
          onChange={(prompt) => onChange({ ...step, prompt })}
          variables={variables}
          labels={labels}
          placeholder={t`List the decisions and the tasks, one per line…`}
        />
      </Field>
      <p className="text-muted-foreground text-xs">
        <Trans>
          Uses the local model chosen in Settings › Synthesis. Nothing leaves
          your computer.
        </Trans>
      </p>
      <OutputNameField step={step} onChange={onChange} labels={labels} />
    </div>
  );
}

export function VaultWriteForm(props: FormProps<VaultWriteStep>) {
  const { t } = useLingui();
  const { step, onChange, variables, labels } = props;
  return (
    <div className="flex flex-col gap-3">
      <Select
        value={step.mode}
        onValueChange={(mode) =>
          onChange({ ...step, mode: mode as VaultWriteMode })
        }
      >
        <SelectTrigger
          className="h-8 w-full max-w-xs text-xs"
          aria-label={t`What to do in the vault`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="create">{t`Create a new note`}</SelectItem>
          <SelectItem value="append">
            {t`Complete the note with the same title`}
          </SelectItem>
        </SelectContent>
      </Select>
      <Field label={t`Vault folder`}>
        <VariableField
          ariaLabel={t`Vault folder`}
          value={step.folder}
          onChange={(folder) => onChange({ ...step, folder })}
          variables={variables}
          labels={labels}
          placeholder={t`At the root of the vault`}
        />
      </Field>
      <Field label={t`Note title`}>
        <VariableField
          ariaLabel={t`Note title`}
          value={step.title}
          onChange={(title) => onChange({ ...step, title })}
          variables={variables}
          labels={labels}
        />
      </Field>
      <Field label={t`Content`}>
        <VariableField
          multiline
          ariaLabel={t`Content`}
          value={step.content}
          onChange={(content) => onChange({ ...step, content })}
          variables={variables}
          labels={labels}
        />
      </Field>
    </div>
  );
}

export function ClipboardForm(
  props: FormProps<Extract<WorkflowStep, { type: "clipboard" }>>,
) {
  const { t } = useLingui();
  const { step, onChange, variables, labels } = props;
  return (
    <Field label={t`Content`}>
      <VariableField
        multiline
        ariaLabel={t`Content`}
        value={step.content}
        onChange={(content) => onChange({ ...step, content })}
        variables={variables}
        labels={labels}
      />
    </Field>
  );
}

export function NotificationForm(
  props: FormProps<Extract<WorkflowStep, { type: "notification" }>>,
) {
  const { t } = useLingui();
  const { step, onChange, variables, labels } = props;
  return (
    <div className="flex flex-col gap-3">
      <Field label={t`Notification title`}>
        <VariableField
          ariaLabel={t`Notification title`}
          value={step.title}
          onChange={(title) => onChange({ ...step, title })}
          variables={variables}
          labels={labels}
        />
      </Field>
      <Field label={t`Text`}>
        <VariableField
          multiline
          ariaLabel={t`Text`}
          value={step.message}
          onChange={(message) => onChange({ ...step, message })}
          variables={variables}
          labels={labels}
        />
      </Field>
    </div>
  );
}

export function WebhookForm(props: FormProps<WebhookStep>) {
  const { t } = useLingui();
  const urlId = useId();
  const { step, onChange, variables, labels } = props;
  const urlInvalid = step.url.trim() !== "" && !parseWebhookUrl(step.url);
  const bodyInvalid = !isWebhookBodyTemplateValid(step.body);
  return (
    <div className="flex flex-col gap-3">
      <p
        data-leaves-computer
        className="bg-chart-4/10 text-foreground flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
      >
        <Warning size={14} className="mt-0.5 shrink-0" />
        <Trans>
          The only step that leaves your computer: the JSON is sent to the
          address below. Use an address you trust, such as n8n, Home Assistant
          or a home server.
        </Trans>
      </p>
      <Field label={t`Address (URL)`} htmlFor={urlId}>
        <Input
          id={urlId}
          value={step.url}
          onChange={(event) => onChange({ ...step, url: event.target.value })}
          placeholder="http://localhost:5678/webhook/syntheo"
          aria-invalid={urlInvalid}
          className="h-8 text-xs"
        />
        {urlInvalid ? (
          <span className="text-destructive text-xs">
            <Trans>Use an http:// or https:// address.</Trans>
          </span>
        ) : null}
      </Field>
      <Field label={t`JSON body`}>
        <VariableField
          multiline
          monospace
          ariaLabel={t`JSON body`}
          value={step.body}
          onChange={(body) => onChange({ ...step, body })}
          variables={variables}
          labels={labels}
        />
        {bodyInvalid ? (
          <span className="text-destructive text-xs">
            <Trans>The body must be valid JSON.</Trans>
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">
            <Trans>
              Variables are inserted as JSON text, inside quotes. Redirects are
              not followed; the request stops after 15 seconds.
            </Trans>
          </span>
        )}
      </Field>
    </div>
  );
}

export function CommandForm(props: FormProps<CommandStep>) {
  const { t } = useLingui();
  const programId = useId();
  const { step, onChange, variables, labels } = props;
  const setArg = (index: number, value: string) =>
    onChange({
      ...step,
      args: step.args.map((arg, position) =>
        position === index ? value : arg,
      ),
    });
  return (
    <div className="flex flex-col gap-3">
      <p className="bg-muted/40 flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
        <Warning size={14} className="mt-0.5 shrink-0" />
        <Trans>
          Syntheo asks for your confirmation the first time this exact command
          runs. Each argument is passed as is, without a shell; the run stops
          after 60 seconds.
        </Trans>
      </p>
      <Field label={t`Program`} htmlFor={programId}>
        <Input
          id={programId}
          value={step.program}
          onChange={(event) =>
            onChange({ ...step, program: event.target.value })
          }
          placeholder="/home/me/scripts/publish.sh"
          className="h-8 font-mono text-xs"
        />
      </Field>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium">
          <Trans>Arguments</Trans>
        </span>
        {step.args.map((arg, index) => {
          const position = index + 1;
          return (
            <div key={index} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <VariableField
                  monospace
                  ariaLabel={t`Argument ${position}`}
                  value={arg}
                  onChange={(value) => setArg(index, value)}
                  variables={variables}
                  labels={labels}
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-muted-foreground size-8"
                aria-label={t`Remove argument ${position}`}
                onClick={() =>
                  onChange({
                    ...step,
                    args: step.args.filter((_, item) => item !== index),
                  })
                }
              >
                <Trash size={13} />
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 self-start text-xs"
          onClick={() => onChange({ ...step, args: [...step.args, ""] })}
        >
          <Plus size={12} />
          <Trans>Add an argument</Trans>
        </Button>
      </div>
      <OutputNameField step={step} onChange={onChange} labels={labels} />
    </div>
  );
}
