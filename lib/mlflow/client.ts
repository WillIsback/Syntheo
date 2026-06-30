const MLFLOW_URI = process.env.MLFLOW_TRACKING_URI ?? "http://mlflow:5000";
const EXPERIMENT_NAME = "syntheo";

async function getOrCreateExperiment(): Promise<string> {
	const res = await fetch(
		`${MLFLOW_URI}/api/2.0/mlflow/experiments/get-by-name?experiment_name=${EXPERIMENT_NAME}`,
	);
	if (res.ok) {
		const data = await res.json();
		return data.experiment_id as string;
	}
	const create = await fetch(
		`${MLFLOW_URI}/api/2.0/mlflow/experiments/create`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: EXPERIMENT_NAME }),
		},
	);
	const data = await create.json();
	return data.experiment_id as string;
}

async function createRun(
	experimentId: string,
	runName: string,
): Promise<string> {
	const res = await fetch(`${MLFLOW_URI}/api/2.0/mlflow/runs/create`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ experiment_id: experimentId, run_name: runName }),
	});
	const data = await res.json();
	return data.run.info.run_id as string;
}

async function logParams(
	runId: string,
	params: Record<string, string>,
): Promise<void> {
	await fetch(`${MLFLOW_URI}/api/2.0/mlflow/runs/log-batch`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			run_id: runId,
			params: Object.entries(params).map(([key, value]) => ({ key, value })),
		}),
	});
}

export async function logWhisperXRun(args: {
	durationAudioS: number;
	durationInferenceMs: number;
	numSpeakers: number;
	languageDetected: string;
	modelName: string;
	modelVersion: string;
}): Promise<{ runId: string }> {
	const experimentId = await getOrCreateExperiment();
	const runId = await createRun(experimentId, "whisperx-inference");
	await logParams(runId, {
		model_name: args.modelName,
		model_version: args.modelVersion,
		duration_audio_s: String(args.durationAudioS),
		duration_inference_ms: String(args.durationInferenceMs),
		num_speakers: String(args.numSpeakers),
		language_detected: args.languageDetected,
	});
	return { runId };
}

export async function logVllmRun(args: {
	promptTokens: number;
	completionTokens: number;
	latencyMs: number;
	modelName: string;
	modelVersion: string;
	temperature?: number;
}): Promise<{ runId: string }> {
	const experimentId = await getOrCreateExperiment();
	const runId = await createRun(experimentId, "vllm-inference");
	await logParams(runId, {
		model_name: args.modelName,
		model_version: args.modelVersion,
		prompt_tokens: String(args.promptTokens),
		completion_tokens: String(args.completionTokens),
		latency_ms: String(args.latencyMs),
		temperature: String(args.temperature ?? 0.7),
	});
	return { runId };
}
