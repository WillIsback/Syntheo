import * as z from "zod";

// --- POST /asr/v1/transcribe request (FormData) ---
export const TranscribeRequestSchema = z.object({
  audio_file: z.instanceof(File, { message: "Audio file is required" }),
  language: z.string().optional().default("fr"),
  initial_prompt: z.string().optional().nullable(),
  hotwords: z.string().optional().nullable(),
  num_speakers: z.coerce.number().int().positive().optional().nullable(),
});

export type TranscribeRequest = z.infer<typeof TranscribeRequestSchema>;
