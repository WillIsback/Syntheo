import { z } from "zod";

import { jsonObject, type ToStorageType } from "./shared";

export const templateSectionSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export const chatMessageStatusSchema = z.enum([
  "streaming",
  "ready",
  "error",
  "aborted",
]);

export const taskStatusSchema = z.enum(["todo", "in_progress", "done"]);

export const wordSchema = z.object({
  text: z.string(),
  start_ms: z.number(),
  end_ms: z.number(),
  channel: z.number(),
  speaker: z.preprocess((val) => val ?? undefined, z.string().optional()),
  metadata: z.preprocess(
    (val) => val ?? undefined,
    jsonObject(z.record(z.string(), z.unknown())).optional(),
  ),
});

export const speakerHintSchema = z.object({
  word_id: z.string(),
  type: z.string(),
  value: jsonObject(z.record(z.string(), z.unknown())),
});

// Les serveurs on-prem (STT et LLM) n'exigent pas forcément de clé, même en
// HTTPS : un vLLM lancé sans --api-key l'ignore.
export const aiProviderSchema = z.object({
  type: z.enum(["stt", "llm"]),
  base_url: z.url().min(1),
  api_key: z.string(),
});

export type TemplateSection = z.infer<typeof templateSectionSchema>;
export type ChatMessageStatus = z.infer<typeof chatMessageStatusSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type AIProvider = z.infer<typeof aiProviderSchema>;
export type WordStorage = ToStorageType<typeof wordSchema>;
export type SpeakerHintStorage = ToStorageType<typeof speakerHintSchema>;
export type AIProviderStorage = ToStorageType<typeof aiProviderSchema>;
