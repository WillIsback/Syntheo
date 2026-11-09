import { STEP_INPUT_SCHEMAS } from "./chat-schema";
import {
  STEP_DEFINITIONS,
  WORKFLOW_STEP_TYPES,
  type WorkflowStepType,
} from "./steps";
import { BASE_VARIABLES } from "./variables";
import { WORKFLOW_TRIGGERS, type WorkflowTrigger } from "./workflows";

// Consigne système du chat de l'éditeur d'automatisations. Les déclencheurs,
// les actions et leurs champs viennent du registre : une nouvelle action
// apparaît ici sans retoucher le texte (le type oblige à la décrire).

const TRIGGER_SUMMARIES: Record<WorkflowTrigger, string> = {
  note_enhanced: "when the meeting summary is ready",
  meeting_completed: "when the meeting ends (before any summary)",
  manual: "launched by hand from a note, never on its own",
};

const STEP_SUMMARIES: Record<WorkflowStepType, string> = {
  markdown_export:
    "Export the note as a Markdown file in a folder of the computer.",
  generate_text:
    "Apply an instruction with the local model (task list, short summary, follow-up message).",
  vault_write: "Create a note in the Syntheo vault, or append to one.",
  clipboard: "Copy a text to the clipboard.",
  notification: "Show a system notification.",
  webhook:
    "Send JSON to an address the user gives (n8n, Home Assistant, home server). The only step that leaves the computer.",
  command: "Run a local program or script, without a shell.",
};

function stepCatalog(): string {
  return WORKFLOW_STEP_TYPES.map((type) => {
    const definition = STEP_DEFINITIONS[type];
    const fields = Object.keys(STEP_INPUT_SCHEMAS[type].shape).filter(
      (key) => key !== "type" && key !== "id" && key !== "outputName",
    );
    const tags = [
      definition.advanced ? "ADVANCED, the user must confirm it" : null,
      definition.output ? `produces a ${definition.output} result` : null,
    ].filter(Boolean);
    return `- ${type}: ${STEP_SUMMARIES[type]} Fields: ${fields.join(", ")}.${tags.length > 0 ? ` (${tags.join("; ")})` : ""}`;
  }).join("\n");
}

export function buildAutomationSystemPrompt(language?: string): string {
  const triggers = WORKFLOW_TRIGGERS.map(
    (trigger) => `- ${trigger}: ${TRIGGER_SUMMARIES[trigger]}`,
  ).join("\n");
  const variables = BASE_VARIABLES.map((name) => `{{${name}}}`).join(", ");

  return `
You help the user build an automation in Syntheo, a local meeting notes app. The automation editor is open next to you and shows every change you make.

An automation is one trigger followed by actions that run in order on the user's computer. In the editor the trigger is step 1, the first action is step 2.

Triggers:
${triggers}

Actions (the only ones that exist):
${stepCatalog()}

Variables usable in any text field: ${variables}. A step that produces a result exposes it to later steps as {{step:<id>}}: give that step a short id (for example tasks) and an outputName.

Tools:
- get_automation reads the automation open in the editor. Read it before changing an existing automation.
- create_automation builds a new automation with its trigger and steps in one call.
- update_automation renames it or changes its trigger. add_automation_step, update_automation_step, remove_automation_step and move_automation_step change its steps.

Rules:
- If the request is ambiguous or misses something you need (which trigger, which folder, which address, what to generate), ask one short clarification question and call no tool.
- Use only the triggers, actions, fields and variables listed above. Never invent an action, a field, a folder path, a URL or a program. Syntheo cannot send e-mails, messages or calendar invites: say so and offer what exists, such as copying the text to the clipboard.
- Prefer local steps. Propose webhook or command only when the user explicitly asks for them; they are only added after the user confirms them in the editor.
- You never save or enable the automation. When it is ready, tell the user to review it and click Save & enable (an automation launched by hand needs no enabling).
- When a tool returns an error, fix the call or ask the user; never claim a change that a tool did not confirm.
- Keep replies short and reply in the user's language${language ? ` (app language: ${language})` : ""}.
`.trim();
}
