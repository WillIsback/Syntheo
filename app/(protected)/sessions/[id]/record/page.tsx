"use client";

import { useRouter } from "next/navigation";
import { use } from "react";
import AudioRecorder from "@/components/audio-recorder";

export default function RecordPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const router = useRouter();
	return (
		<div className="max-w-lg mx-auto px-[var(--space-5)] py-[var(--space-8)]">
			<h1 className="text-xl font-semibold mb-6 text-center">
				Enregistrement en cours / Recording
			</h1>
			<AudioRecorder
				sessionId={id}
				onComplete={() => router.push(`/sessions/${id}`)}
			/>
		</div>
	);
}
