"use client";

import { useRef, useState } from "react";

interface AudioRecorderProps {
	sessionId: string;
	onComplete: (jobId: string) => void;
}

export default function AudioRecorder({
	sessionId,
	onComplete,
}: AudioRecorderProps) {
	const [state, setState] = useState<
		"idle" | "recording" | "uploading" | "processing" | "error"
	>("idle");
	const mediaRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);

	async function startRecording() {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		const recorder = new MediaRecorder(stream);
		chunksRef.current = [];
		recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
		recorder.onstop = handleStop;
		recorder.start();
		mediaRef.current = recorder;
		setState("recording");
	}

	function stopRecording() {
		mediaRef.current?.stop();
		mediaRef.current?.stream.getTracks().forEach((t) => {
			t.stop();
		});
		setState("uploading");
	}

	async function handleStop() {
		const blob = new Blob(chunksRef.current, { type: "audio/webm" });
		chunksRef.current = [];

		const form = new FormData();
		form.append("audio_blob", blob);
		form.append("session_id", sessionId);

		const res = await fetch("/api/transcribe", { method: "POST", body: form });
		const { jobId } = await res.json();
		setState("processing");
		await pollUntilDone(jobId);
	}

	async function pollUntilDone(jobId: string) {
		const MAX_POLLS = 120; // 6 minutes at 3s intervals
		let attempts = 0;
		while (attempts < MAX_POLLS) {
			await new Promise((r) => setTimeout(r, 3000));
			attempts++;
			try {
				const res = await fetch(
					`/api/jobs/${jobId}?session_id=${encodeURIComponent(sessionId ?? "")}`,
				);
				if (!res.ok) {
					setState("error");
					return;
				}
				const data = await res.json();
				if (data.status !== "pending" && data.status !== "processing") {
					onComplete(jobId);
					return;
				}
			} catch {
				setState("error");
				return;
			}
		}
		setState("error"); // timeout
	}

	return (
		<div className="flex flex-col items-center gap-4 p-6">
			{state === "idle" && (
				<button
					type="button"
					onClick={startRecording}
					className="w-20 h-20 rounded-full bg-[var(--color-primary)] text-white text-2xl shadow-lg hover:opacity-90"
				>
					🎙
				</button>
			)}
			{state === "recording" && (
				<button
					type="button"
					onClick={stopRecording}
					className="w-20 h-20 rounded-full bg-[var(--color-danger)] text-white text-2xl shadow-lg animate-pulse"
				>
					⏹
				</button>
			)}
			{state === "uploading" && (
				<p className="text-[var(--color-text-2)]">
					Envoi en cours… / Uploading…
				</p>
			)}
			{state === "processing" && (
				<p className="text-[var(--color-text-2)]">
					Transcription en cours… / Transcribing…
				</p>
			)}
			{state === "error" && (
				<p className="text-[var(--color-danger)] text-sm">
					Erreur de transcription / Transcription error
				</p>
			)}
		</div>
	);
}
