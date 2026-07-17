import {
  type JobStatus,
  JobStatusSchema,
  type TranscribeResponse,
  TranscribeResponseSchema,
} from "../schemas/whisperx.server.schema";

const BASE_URL =
  process.env.WHISPERX_BASE_URL ?? "https://api.willisback.fr/whisper/asr/v1";

const getAuthHeaders = () => {
  if (!process.env.WHISPERX_API_KEY) {
    throw new Error(
      "WHISPERX_API_KEY is not set in the environment variables.",
    );
  }

  return { Authorization: `Bearer ${process.env.WHISPERX_API_KEY}` };
};

const transcribeAudio = async (body: FormData): Promise<TranscribeResponse> => {
  if (!body) {
    throw new Error("FormData body is required for transcription.");
  }

  const response = await fetch(`${BASE_URL}/transcribe`, {
    method: "POST",
    headers: getAuthHeaders(),
    body,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to transcribe audio: ${response.status} ${response.statusText}`,
    );
  }

  const data = TranscribeResponseSchema.parse(await response.json());
  return data;
};

const getJobStatus = async (jobId: string): Promise<JobStatus> => {
  const response = await fetch(`${BASE_URL}/jobs/${jobId}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok)
    throw new Error(`Failed to get job status: ${response.status}`);
  return JobStatusSchema.parse(await response.json());
};

const waitForJob = async (
  jobId: string,
  intervalMs = 2000,
): Promise<Extract<JobStatus, { status: "completed" | "failed" }>> => {
  while (true) {
    const result = await getJobStatus(jobId);
    if (result.status === "completed" || result.status === "failed") {
      return result;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
};

const getFormattedExport = async (
  jobId: string,
  format: "srt" | "vtt" | "txt",
): Promise<string> => {
  const response = await fetch(`${BASE_URL}/jobs/${jobId}/${format}`, {
    headers: getAuthHeaders(),
  });
  if (response.status === 409) throw new Error("Job not yet completed");
  if (!response.ok)
    throw new Error(`Failed to get ${format}: ${response.status}`);
  return response.text();
};

const buildMultipartStream = (
  audioStream: ReadableStream<Uint8Array>,
  filename: string,
  mimeType: string,
  textFields: [string, string][],
  boundary: string,
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const [name, value] of textFields) {
        controller.enqueue(
          encoder.encode(
            `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
          ),
        );
      }
      controller.enqueue(
        encoder.encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="audio_file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
        ),
      );
      const reader = audioStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        reader.releaseLock();
      }
      controller.enqueue(encoder.encode(`\r\n--${boundary}--\r\n`));
      controller.close();
    },
  });
};

const transcribeAudioStream = async (
  audioStream: ReadableStream<Uint8Array>,
  filename: string,
  mimeType: string,
  options: {
    language?: string;
    numSpeakers?: number;
    initialPrompt?: string;
    hotwords?: string;
  } = {},
): Promise<TranscribeResponse> => {
  const boundary = `SyntheoUpload${crypto.randomUUID().replaceAll("-", "")}`;

  const textFields: [string, string][] = [];
  if (options.language) textFields.push(["language", options.language]);
  if (options.initialPrompt)
    textFields.push(["initial_prompt", options.initialPrompt]);
  if (options.hotwords) textFields.push(["hotwords", options.hotwords]);
  if (options.numSpeakers != null)
    textFields.push(["num_speakers", String(options.numSpeakers)]);

  const body = buildMultipartStream(
    audioStream,
    filename,
    mimeType,
    textFields,
    boundary,
  );

  const response = await fetch(`${BASE_URL}/transcribe`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
    // @ts-expect-error — Node.js undici requires duplex:'half' for streaming request bodies
    duplex: "half",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to transcribe audio: ${response.status} ${response.statusText}`,
    );
  }

  return TranscribeResponseSchema.parse(await response.json());
};

export {
  getFormattedExport,
  getJobStatus,
  transcribeAudio,
  transcribeAudioStream,
  waitForJob,
};
