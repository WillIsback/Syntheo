import { notFound } from "next/navigation";
import { getSession } from "@/actions/session.action";
import { SessionLiveView } from "@/components/SessionLiveView";
import { auth } from "@/lib/auth";

export default async function SessionPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  const [session, viewer] = await Promise.all([getSession(id), auth()]);
  if (!session) notFound();

  const userName = viewer?.user?.name ?? viewer?.user?.email ?? "Utilisateur";

  return (
    <SessionLiveView
      sessionId={id}
      initialViewModel={session}
      userName={userName}
    />
  );
}
