import { headers } from "next/headers";
import { notFound } from "next/navigation";
import ReportView from "@/components/report-view";
import SessionPanel from "@/components/session-panel";
import TranscriptView from "@/components/transcript-view";
import { getDb } from "@/lib/db/client";
import { getSessionDetail } from "@/lib/db/queries";
import { logDataAccess } from "@/lib/otel/logger";

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

	logDataAccess(userId, "read", `session:${id}`);

	const transcriptionText = detail.transcription
		? detail.transcription.segments
				.map((s) => `[${s.speaker}] ${s.text}`)
				.join("\n")
		: "";

	const sessionDate = new Date(detail.session.createdAt)
		.toISOString()
		.slice(0, 10);
	const segments = detail.transcription?.segments ?? [];

	return (
		<div className="mx-auto flex max-w-[1200px] gap-[var(--space-6)] px-[var(--space-5)] py-[var(--space-6)]">
			<div className="min-w-0 flex-1 max-w-[var(--doc-max-w)]">
				<header className="mb-[var(--space-5)]">
					<h1 className="text-2xl font-normal tracking-tight text-[var(--color-text)]">
						Session
					</h1>
					<p className="mt-[var(--space-1)] text-xs text-[var(--color-text-3)]">
						{new Date(detail.session.createdAt).toLocaleDateString("fr-FR", {
							day: "numeric",
							month: "long",
							year: "numeric",
						})}
					</p>
				</header>

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

				{transcriptionText && (
					<div className="mt-[var(--space-6)]">
						<ReportView
							transcriptionText={transcriptionText}
							sessionId={id}
							savedContent={detail.report?.content}
						/>
					</div>
				)}

				{/* Panel content inline on narrow screens */}
				{segments.length > 0 && (
					<div className="mt-[var(--space-6)] xl:hidden">
						<SessionPanel segments={segments} sessionDate={sessionDate} />
					</div>
				)}
			</div>

			{/* Right panel on wide screens */}
			{segments.length > 0 && (
				<aside className="hidden w-[var(--panel-w)] shrink-0 xl:block">
					<SessionPanel segments={segments} sessionDate={sessionDate} />
				</aside>
			)}
		</div>
	);
}
