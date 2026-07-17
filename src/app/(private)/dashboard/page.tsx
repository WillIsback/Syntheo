import Link from "next/link";
import { listSessions } from "@/actions/session.action";
import { Card, StatusPill } from "@/components";
import type { SessionStatus } from "@/components/tokens";
import { auth } from "@/lib/auth";

const STATUS_PILL: Record<
  "pending" | "processing" | "completed" | "failed",
  { status: SessionStatus; label: string }
> = {
  pending: { status: "recording", label: "En attente" },
  processing: { status: "processing", label: "En cours" },
  completed: { status: "done", label: "Terminé" },
  failed: { status: "done", label: "Échec" },
};

export default async function DashboardPage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] ?? "";
  const sessions = await listSessions();

  return (
    <div className="mx-auto max-w-230 px-12 py-10">
      <div className="mb-7">
        <h1 className="mb-1.5 text-[26px] font-normal text-(--syn-text)">
          Bonjour {firstName}
        </h1>
        <p className="text-[13.5px] text-(--syn-text-2)">
          Vos réunions transcrites et augmentées par IA. Aucun fichier audio
          n&apos;est conservé.
        </p>
      </div>

      <Link
        href="/record"
        className="mb-8 flex items-center gap-3.5 rounded-xl bg-(--syn-blue) px-5.5 py-5 text-white hover:bg-(--syn-blue-dark)"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg">
          🎙
        </span>
        <span>
          <b className="block text-[15px] font-semibold">
            Démarrer une nouvelle session
          </b>
          <span className="text-[12.5px] opacity-85">
            Transcription et diarisation en direct
          </span>
        </span>
      </Link>

      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-(--syn-text-3)">
        Sessions récentes
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        {sessions.map((s) => {
          const pill = STATUS_PILL[s.status];
          return (
            <Link key={s.id} href={`/sessions/${s.id}`}>
              <Card className="h-full cursor-pointer hover:shadow-(--syn-shadow-md)">
                <div className="mb-2.5 flex items-center gap-2.5">
                  <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-md bg-(--syn-bg) text-[15px]">
                    {s.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-(--syn-text)">
                      {s.name}
                    </div>
                    <div className="text-[11.5px] text-(--syn-text-3)">
                      {s.dateLabel}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <StatusPill status={pill.status} label={pill.label} />
                  <span className="text-[11.5px] text-(--syn-text-3)">
                    {s.speakers.length} intervenants
                  </span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
