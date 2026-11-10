import type { AutomationCommandOutput } from "@syntheo/plugin-local-api";

import type { CommandLine } from "./command-approval";
import type { VaultWriteRequest, VaultWriteResult } from "./vault-writer";

// Ce que les actions font réellement sur la machine (modèle local, coffre,
// presse-papiers, notification, adresse, commande). Les exécuteurs passent
// par cet objet : les tests le remplacent, et chaque dépendance n'est
// chargée qu'au premier usage.

type WebhookResponse = {
  status: number;
  /** En-tête `Location` d'une redirection, qui n'est jamais suivie. */
  location: string | null;
};

type StepEffects = {
  generateText: (prompt: string, signal: AbortSignal) => Promise<string>;
  writeVaultNote: (request: VaultWriteRequest) => Promise<VaultWriteResult>;
  copyText: (text: string) => Promise<void>;
  notify: (title: string, message: string) => Promise<void>;
  postJson: (
    url: URL,
    body: string,
    signal: AbortSignal,
  ) => Promise<WebhookResponse>;
  confirmCommand: (
    command: CommandLine,
    workflowTitle: string,
  ) => Promise<boolean>;
  runCommand: (
    program: string,
    args: string[],
    timeoutSecs: number,
  ) => Promise<AutomationCommandOutput>;
};

export class NoLocalModelError extends Error {}

const GENERATION_TIMEOUT_MS = 180_000;
const MAX_OUTPUT_TOKENS = 4_096;

const defaultEffects: StepEffects = {
  generateText: async (prompt, signal) => {
    const [{ generateText }, { automationLanguageModel }] = await Promise.all([
      import("ai"),
      import("./language-model"),
    ]);
    const model = automationLanguageModel();
    if (!model) {
      throw new NoLocalModelError("no local model");
    }
    const result = await generateText({
      model,
      prompt,
      maxRetries: 1,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      timeout: { totalMs: GENERATION_TIMEOUT_MS },
      abortSignal: signal,
    });
    return result.text;
  },
  writeVaultNote: async (request) => {
    const { writeVaultNote } = await import("./vault-writer");
    return await writeVaultNote(request);
  },
  copyText: async (text) => {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(text);
  },
  notify: async (title, message) => {
    const { commands } = await import("@syntheo/plugin-notification");
    const result = await commands.showNotification({
      key: `automation:${crypto.randomUUID()}`,
      title,
      message,
      timeout: { secs: 10, nanos: 0 },
      source: null,
      start_time: null,
      participants: null,
      event_details: null,
      action_label: null,
      action_variant: null,
      action: null,
      action_menu: null,
      options: null,
      footer: null,
      icon: null,
    });
    if (result.status === "error") {
      throw new Error(result.error);
    }
  },
  postJson: async (url, body, signal) => {
    const { fetch } = await import("@tauri-apps/plugin-http");
    const headers = new Headers({ "Content-Type": "application/json" });
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      // Comme pour le modèle local : un Origin vide plutôt que celui de la
      // webview, que certains serveurs locaux refusent.
      headers.set("Origin", "");
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal,
      maxRedirections: 0,
      connectTimeout: 10_000,
    });
    return {
      status: response.status,
      location: response.headers.get("location"),
    };
  },
  confirmCommand: async (command, workflowTitle) => {
    const { confirmCommand } = await import("./command-approval");
    return await confirmCommand(command, workflowTitle);
  },
  runCommand: async (program, args, timeoutSecs) => {
    const { commands } = await import("@syntheo/plugin-local-api");
    const result = await commands.runAutomationCommand(
      program,
      args,
      timeoutSecs,
    );
    if (result.status === "error") {
      throw new Error(result.error);
    }
    return result.data;
  },
};

let effects: StepEffects = defaultEffects;

export function stepEffects(): StepEffects {
  return effects;
}

/** Tests : remplace tout ou partie des effets réels. */
export function setStepEffectsForTests(overrides: Partial<StepEffects> | null) {
  effects = overrides ? { ...defaultEffects, ...overrides } : defaultEffects;
}
