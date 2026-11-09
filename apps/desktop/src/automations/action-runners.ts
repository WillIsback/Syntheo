import { t } from "@lingui/core/macro";

import { NoLocalModelError, stepEffects } from "./step-effects";
import type { StepRunContext, StepRunResult } from "./step-runners";
import type {
  ClipboardStep,
  CommandStep,
  GenerateTextStep,
  NotificationStep,
  VaultWriteStep,
  WebhookStep,
} from "./steps";
import {
  escapeJsonStringContent,
  parseWebhookUrl,
  WEBHOOK_TIMEOUT_MS,
} from "./webhook";

// Exécuteurs des actions locales et avancées. Chacun lit ses champs avec les
// variables remplacées, puis agit par `stepEffects()`. À blanc (`dryRun`),
// les étapes à effet réel décrivent ce qu'elles feraient sans rien écrire,
// copier, afficher, envoyer ni lancer ; la génération, sans effet hors de
// l'application, s'exécute pour que les étapes suivantes aient sa sortie.

export const COMMAND_TIMEOUT_SECS = 60;

export async function runGenerateTextStep(
  step: GenerateTextStep,
  { variables }: StepRunContext,
): Promise<StepRunResult> {
  const prompt = (await variables.render(step.prompt)).trim();
  if (!prompt) {
    throw new Error(t`Write an instruction for the local model first.`);
  }
  let text: string;
  try {
    text = await stepEffects().generateText(
      prompt,
      new AbortController().signal,
    );
  } catch (error) {
    if (error instanceof NoLocalModelError) {
      throw new Error(
        t`No local model is configured. Choose one in Settings › Synthesis.`,
      );
    }
    const reason = errorMessage(error);
    throw new Error(t`The local model did not respond: ${reason}`);
  }
  const output = text.trim();
  if (!output) {
    throw new Error(t`The local model returned an empty answer.`);
  }
  const length = output.length;
  return { detail: t`Generated text (${length} characters)`, output };
}

export async function runVaultWriteStep(
  step: VaultWriteStep,
  { variables, dryRun }: StepRunContext,
): Promise<StepRunResult> {
  const title = (await variables.render(step.title)).replace(/\s+/g, " ");
  const noteTitle = title.trim();
  const content = await variables.render(step.content);
  const folder = await variables.render(step.folder);
  if (!noteTitle) {
    throw new Error(t`Give the vault note a title first.`);
  }
  if (dryRun) {
    return {
      detail:
        step.mode === "append"
          ? t`Would complete the note "${noteTitle}"`
          : t`Would create the note "${noteTitle}"`,
    };
  }
  const result = await stepEffects().writeVaultNote({
    folder,
    title: noteTitle,
    content,
    mode: step.mode,
  });
  return {
    detail: result.created
      ? t`Note created: ${noteTitle}`
      : t`Note completed: ${noteTitle}`,
  };
}

export async function runClipboardStep(
  step: ClipboardStep,
  { variables, dryRun }: StepRunContext,
): Promise<StepRunResult> {
  const content = await variables.render(step.content);
  if (!content.trim()) {
    throw new Error(t`There is nothing to copy.`);
  }
  if (!dryRun) {
    await stepEffects().copyText(content);
  }
  return {
    detail: dryRun
      ? t`Would copy to the clipboard`
      : t`Copied to the clipboard`,
  };
}

export async function runNotificationStep(
  step: NotificationStep,
  { variables, dryRun }: StepRunContext,
): Promise<StepRunResult> {
  const title = (await variables.render(step.title)).trim();
  const message = (await variables.render(step.message)).trim();
  if (!title && !message) {
    throw new Error(t`Write a title or a text for the notification.`);
  }
  if (!dryRun) {
    await stepEffects().notify(title || message, title ? message : "");
  }
  return {
    detail: dryRun ? t`Would show a notification` : t`Notification shown`,
  };
}

class WebhookTimeoutError extends Error {}

export async function runWebhookStep(
  step: WebhookStep,
  { variables, dryRun }: StepRunContext,
): Promise<StepRunResult> {
  const url = parseWebhookUrl(step.url);
  if (!url) {
    throw new Error(t`Invalid address: use an http:// or https:// URL.`);
  }
  const body = await variables.render(step.body, {
    escape: escapeJsonStringContent,
  });
  try {
    JSON.parse(body);
  } catch {
    throw new Error(
      t`The JSON body is not valid once the variables are filled in.`,
    );
  }
  const host = url.host;
  if (dryRun) {
    return { detail: t`Would send the JSON to ${host}` };
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new WebhookTimeoutError()),
    WEBHOOK_TIMEOUT_MS,
  );
  let status: number;
  let location: string | null;
  try {
    ({ status, location } = await Promise.race([
      stepEffects().postJson(url, body, controller.signal),
      rejectOnAbort(controller.signal),
    ]));
  } catch (error) {
    if (controller.signal.aborted) {
      const seconds = WEBHOOK_TIMEOUT_MS / 1000;
      throw new Error(t`The address did not answer within ${seconds} seconds.`);
    }
    const reason = errorMessage(error);
    throw new Error(t`Could not reach the address: ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  if (status >= 300 && status < 400) {
    const target = location ?? "?";
    throw new Error(
      t`The address redirects to ${target}. Syntheo does not follow redirects: use the final address.`,
    );
  }
  if (status < 200 || status >= 300) {
    throw new Error(t`The address answered with the status ${status}.`);
  }
  return { detail: t`Sent to ${host} (status ${status})` };
}

export async function runCommandStep(
  step: CommandStep,
  { variables, dryRun, workflowTitle }: StepRunContext,
): Promise<StepRunResult> {
  const program = step.program.trim();
  if (!program) {
    throw new Error(t`Choose the program to run first.`);
  }
  const args = await Promise.all(step.args.map((arg) => variables.render(arg)));
  if (dryRun) {
    return { detail: t`Would run ${program}` };
  }
  const effects = stepEffects();
  // La confirmation porte sur la commande telle que saisie (variables
  // comprises) : le chemin du fichier exporté change d'une note à l'autre.
  const approved = await effects.confirmCommand(
    { program, args: step.args },
    workflowTitle,
  );
  if (!approved) {
    throw new Error(t`The command was not confirmed, so it did not run.`);
  }
  const result = await effects.runCommand(program, args, COMMAND_TIMEOUT_SECS);
  if (result.timed_out) {
    const seconds = COMMAND_TIMEOUT_SECS;
    throw new Error(t`The command did not finish within ${seconds} seconds.`);
  }
  if (result.exit_code !== 0) {
    const code = result.exit_code ?? "?";
    const reason = firstLine(result.stderr) || firstLine(result.stdout);
    throw new Error(
      reason
        ? t`The command failed (code ${code}): ${reason}`
        : t`The command failed (code ${code}).`,
    );
  }
  return {
    detail: t`Command finished: ${program}`,
    output: result.stdout.trimEnd(),
  };
}

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0]?.trim().slice(0, 200) ?? "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
