import Link from "next/link";
import { redirect } from "next/navigation";
import { listSessions } from "@/actions/session.action";
import { Avatar, Button } from "@/components";
import { Sidebar } from "@/components/Sidebar";
import { auth, signOut } from "@/lib/auth";

async function handleSignOut() {
  "use server";
  await signOut({ redirectTo: "/signin" });
}

/**
 * Shared shell for all authenticated screens: topbar + session sidebar.
 * Redirects to /signin when there is no session — this is the private
 * route group's auth guard.
 */
export default async function PrivateLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }

  const displayName = session.user.name ?? session.user.email ?? "Utilisateur";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const sessions = await listSessions();

  const sidebarSessions = sessions.map((s) => ({
    id: s.id,
    icon: s.icon,
    name: s.name,
    dateLabel: s.dateLabel,
    segments: s.segments.map((seg) => ({
      id: seg.id,
      label: seg.label,
      color: seg.color,
      inProgress: seg.inProgress,
    })),
  }));

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--syn-bg)">
      <header className="flex h-(--syn-topbar-h) shrink-0 items-center gap-2 border-b border-(--syn-border) bg-(--syn-surface) px-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-(--syn-radius-sm) px-2.5 py-1.5 hover:bg-(--syn-bg)"
        >
          <div className="flex h-7.5 w-7.5 items-center justify-center rounded-[5px] bg-(--syn-blue)">
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="white"
              aria-hidden="true"
            >
              <path d="M3 4h14v2H3V4zm0 5h14v2H3V9zm0 5h9v2H3v-2z" />
            </svg>
          </div>
          <span className="text-lg font-normal text-(--syn-text-2)">
            <b className="font-medium text-(--syn-blue)">Syntheo</b>
          </span>
        </Link>
        <div className="mx-1 h-5 w-px bg-(--syn-border)" />
        <Link
          href="/dashboard"
          className="rounded-full px-3 py-1.5 text-[13px] text-(--syn-text-2) hover:bg-(--syn-bg)"
        >
          Sessions
        </Link>
        <Link
          href="/templates"
          className="rounded-full px-3 py-1.5 text-[13px] text-(--syn-text-2) hover:bg-(--syn-bg)"
        >
          Modèles
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Avatar initials={initials || "U"} color="var(--syn-blue)" />
          <form action={handleSignOut}>
            <Button variant="ghost" type="submit">
              Se déconnecter
            </Button>
          </form>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar sessions={sidebarSessions} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
