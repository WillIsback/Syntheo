import * as z from "zod";

const IsoDatetimeSchema = z.iso.datetime({ offset: true });

// --- Segments ---
const SegmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  speaker: z.string(),
  text: z.string(),
});

// --- POST /asr/v1/transcribe response ---
const TranscribeResponseSchema = z.object({
  job_id: z.uuid(),
  status: z.literal("pending"),
});

// --- GET /asr/v1/jobs/{job_id} response ---
const JobStatusSchema = z.discriminatedUnion("status", [
  z.object({
    job_id: z.uuid(),
    status: z.enum(["pending", "processing"]),
    created_at: IsoDatetimeSchema,
    completed_at: z.null(),
    error: z.null(),
  }),
  z.object({
    job_id: z.uuid(),
    status: z.literal("completed"),
    created_at: IsoDatetimeSchema,
    completed_at: IsoDatetimeSchema,
    error: z.null(),
    duration_s: z.number(),
    num_speakers: z.number(),
    segments: z.array(SegmentSchema),
  }),
  z.object({
    job_id: z.uuid(),
    status: z.literal("failed"),
    created_at: IsoDatetimeSchema,
    completed_at: IsoDatetimeSchema,
    error: z.string(),
  }),
]);

// --- Inferred types ---
export type Segment = z.infer<typeof SegmentSchema>;
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;

// --- Export schemas ---
export { JobStatusSchema, SegmentSchema, TranscribeResponseSchema };
