import { tool } from "ai";
import { z } from "zod";

import {
  changeEditedWorkflow,
  createWorkflowFromChat,
  describeWorkflow,
  loadEditedWorkflow,
  NO_OPEN_AUTOMATION,
  planInsert,
  planMove,
  planReplace,
  positionToIndex,
} from "~/automations/chat-editing";
import { stepInputSchema, triggerSchema } from "~/automations/chat-schema";

// Outils du chat de l'éditeur d'automatisations (portée `automations`
// seulement). Ils lisent et modifient l'automatisation ouverte ; aucun ne
// l'enregistre comme activée, et une étape avancée attend la confirmation de
// l'utilisateur dans l'éditeur.

const name = z.string().trim().max(120).describe("Name of the automation.");
const position = z
  .number()
  .int()
  .min(2)
  .max(50)
  .describe(
    "Step number as shown in the editor: 2 is the first action. Omit to add at the end.",
  );
const stepId = z
  .string()
  .min(1)
  .max(64)
  .describe("Id of the step, as returned by get_automation.");

const getAutomationTool = () =>
  tool({
    description:
      "Read the automation open in the editor: name, trigger, steps with their ids and fields, and steps waiting for the user's confirmation.",
    inputSchema: z.strictObject({}),
    execute: async () => {
      const workflow = await loadEditedWorkflow();
      return workflow
        ? { status: "ok" as const, automation: describeWorkflow(workflow) }
        : { status: "none" as const, message: NO_OPEN_AUTOMATION };
    },
  });

const createAutomationTool = () =>
  tool({
    description:
      "Create the automation the user described, with its trigger and its steps in order. It opens in the editor as a disabled draft. Webhook and command steps wait for the user's confirmation.",
    inputSchema: z.strictObject({
      name: name.optional(),
      trigger: triggerSchema,
      steps: z.array(stepInputSchema).max(12),
    }),
    execute: (input) => createWorkflowFromChat(input),
  });

const updateAutomationTool = () =>
  tool({
    description:
      "Rename the automation open in the editor or change its trigger.",
    inputSchema: z
      .strictObject({
        name: name.optional(),
        trigger: triggerSchema.optional(),
      })
      .refine((input) => input.name !== undefined || input.trigger, {
        message: "Give a name or a trigger.",
      }),
    execute: (input) =>
      changeEditedWorkflow({ title: input.name, trigger: input.trigger }),
  });

const addStepTool = () =>
  tool({
    description:
      "Add one action to the automation open in the editor. Webhook and command steps are only proposed: the user confirms them in the editor.",
    inputSchema: z.strictObject({
      step: stepInputSchema,
      position: position.optional(),
    }),
    execute: ({ step, position: at }) =>
      changeEditedWorkflow({
        plan: (steps) =>
          planInsert(steps, [step], positionToIndex(at, steps.length)),
      }),
  });

const updateStepTool = () =>
  tool({
    description:
      "Replace one action of the automation open in the editor. Send the complete step with every field (read them with get_automation); its id stays the same.",
    inputSchema: z.strictObject({ step_id: stepId, step: stepInputSchema }),
    execute: ({ step_id, step }) =>
      changeEditedWorkflow({
        plan: (steps) =>
          planReplace(steps, step_id, { ...step, id: undefined }),
      }),
  });

const removeStepTool = () =>
  tool({
    description: "Remove one action from the automation open in the editor.",
    inputSchema: z.strictObject({ step_id: stepId }),
    execute: ({ step_id }) =>
      changeEditedWorkflow({
        plan: (steps) =>
          steps.some((step) => step.id === step_id)
            ? {
                steps: steps.filter((step) => step.id !== step_id),
                proposals: [],
              }
            : `No step with id ${step_id}. Call get_automation to read the step ids.`,
      }),
  });

const moveStepTool = () =>
  tool({
    description:
      "Move one action of the automation open in the editor to another step number.",
    inputSchema: z.strictObject({ step_id: stepId, position }),
    execute: ({ step_id, position: at }) =>
      changeEditedWorkflow({
        plan: (steps) =>
          planMove(steps, step_id, positionToIndex(at, steps.length)),
      }),
  });

export const buildAutomationChatTools = () => ({
  get_automation: getAutomationTool(),
  create_automation: createAutomationTool(),
  update_automation: updateAutomationTool(),
  add_automation_step: addStepTool(),
  update_automation_step: updateStepTool(),
  remove_automation_step: removeStepTool(),
  move_automation_step: moveStepTool(),
});

export type AutomationChatTools = ReturnType<typeof buildAutomationChatTools>;
