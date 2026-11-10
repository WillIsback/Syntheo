import { create } from "zustand";

import type { CommandStep } from "./steps";

import { getStoredSettingValues, updateSettingValue } from "~/settings/queries";

// Étape « Lancer une commande » : la première exécution de chaque commande
// demande une confirmation explicite. La réponse « oui » est mémorisée pour
// la commande exacte (programme et arguments tels que saisis, variables
// comprises) : changer un seul caractère redemande la confirmation.

export type CommandLine = Pick<CommandStep, "program" | "args">;

export type PendingCommandConfirmation = {
  key: string;
  program: string;
  args: string[];
  workflowTitle: string;
  resolve: (approved: boolean) => void;
};

/** Sans réponse au bout de ce délai, la commande n'est pas lancée. */
export const COMMAND_CONFIRMATION_TIMEOUT_MS = 5 * 60_000;

const MAX_APPROVED_COMMANDS = 200;

export function commandKey(command: CommandLine): string {
  return JSON.stringify([command.program.trim(), ...command.args]);
}

function parseApprovedCommands(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

async function isCommandApproved(command: CommandLine) {
  const { values } = await getStoredSettingValues();
  return parseApprovedCommands(values.automation_approved_commands).includes(
    commandKey(command),
  );
}

async function rememberApprovedCommand(command: CommandLine) {
  const key = commandKey(command);
  await updateSettingValue("automation_approved_commands", (current) => {
    const approved = parseApprovedCommands(current);
    return approved.includes(key)
      ? (current ?? "[]")
      : JSON.stringify([...approved, key].slice(-MAX_APPROVED_COMMANDS));
  });
}

type CommandConfirmationState = {
  pending: PendingCommandConfirmation | null;
  answer: (approved: boolean) => void;
};

export const useCommandConfirmation = create<CommandConfirmationState>(
  (set, get) => ({
    pending: null,
    answer: (approved) => {
      const pending = get().pending;
      if (!pending) return;
      set({ pending: null });
      pending.resolve(approved);
    },
  }),
);

let confirmations: Promise<unknown> = Promise.resolve();

/**
 * Demande à l'utilisateur s'il autorise la commande (fenêtre de
 * confirmation), une demande à la fois. Une commande déjà confirmée passe
 * sans question.
 */
export function confirmCommand(
  command: CommandLine,
  workflowTitle: string,
): Promise<boolean> {
  const next = confirmations.then(async () => {
    if (await isCommandApproved(command)) {
      return true;
    }
    const approved = await askUser(command, workflowTitle);
    if (approved) {
      await rememberApprovedCommand(command);
    }
    return approved;
  });
  confirmations = next.catch(() => undefined);
  return next;
}

function askUser(command: CommandLine, workflowTitle: string) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (approved: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(approved);
    };
    const timer = setTimeout(() => {
      if (useCommandConfirmation.getState().pending?.resolve === settle) {
        useCommandConfirmation.setState({ pending: null });
      }
      settle(false);
    }, COMMAND_CONFIRMATION_TIMEOUT_MS);
    useCommandConfirmation.setState({
      pending: {
        key: commandKey(command),
        program: command.program.trim(),
        args: command.args,
        workflowTitle,
        resolve: settle,
      },
    });
  });
}
