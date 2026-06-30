import { headers } from "next/headers";
import { notFound } from "next/navigation";
import ReportView from "@/components/report-view";
import TranscriptView from "@/components/transcript-view";
import { getDb } from "@/lib/db/client";
import { getSessionDetail } from "@/lib/db/queries";

interface Props {
	params: Promise<{ id: string }>;
}

export default async function SessionDetailPage({ params }: Props) {
	const { id } = await params;
	const headersList = await headers();
	const userId = headersList.get("x-user-id");
	if (!userId) return null;

	const client = await getDb(userId);
	let detail: Awaited<ReturnType<typeof getSessionDetail>>;
	try {
		detail = await getSessionDetail(client, id);
	} finally {
		client.release();
	}

	if (!detail) return notFound();

	const transcriptionText = detail.transcription
		? detail.transcription.segments
				.map((s) => `[${s.speaker}] ${s.text}`)
				.join("\n")
		: "";

	return (
		<div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4">
			<div>
				<h1 className="text-lg font-semibold mb-4">
					Session —{" "}
					{new Date(detail.session.createdAt).toLocaleDateString("fr-FR")}
				</h1>
				{detail.transcription ? (
					<TranscriptView
						transcriptionId={detail.transcription.id}
						segments={detail.transcription.segments}
						whisperRunId={detail.transcription.whisperRunId}
						createdAt={detail.transcription.createdAt}
					/>
				) : (
					<p className="text-[var(--color-text-3)]">
						Transcription non disponible / Not available
					</p>
				)}
			</div>
			<div>
				{transcriptionText && (
					<ReportView transcriptionText={transcriptionText} sessionId={id} />
				)}
			</div>
		</div>
	);
}
