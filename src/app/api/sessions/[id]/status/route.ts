import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { refreshSessionFromRemote } from "@/lib/sessions";

export const statusRouteDeps = {
  auth,
  refreshSessionFromRemote,
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await statusRouteDeps.auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const refreshed = await statusRouteDeps.refreshSessionFromRemote({
    sessionId: id,
    userUid: session.user.id,
  });

  if (!refreshed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(refreshed);
}
