"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SessionDetail } from "@/components/SessionDetail";
import type { Session } from "@/data/sessions";
import { mapAppSessionToViewModel } from "@/lib/session-view";

/** Returns the next poll interval in ms using a simple step backoff. */
export const nextPollDelay = (attempt: number): number => {
  if (attempt < 3) return 2_000;
  if (attempt < 6) return 5_000;
  return 10_000;
};

const TERMINAL = new Set(["completed", "failed"]);

export function SessionLiveView({
  sessionId,
  initialViewModel,
  userName,
}: Readonly<{
  sessionId: string;
  initialViewModel: Session;
  userName: string;
}>) {
  const [vm, setVm] = useState<Session>(initialViewModel);
  const [status, setStatus] = useState<string>(initialViewModel.status);
  const attemptRef = useRef(0);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/status`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const row = await res.json();
      const next = mapAppSessionToViewModel(row);
      setVm(next);
      setStatus(row.status as string);
      if (!TERMINAL.has(row.status as string)) {
        const delay = nextPollDelay(++attemptRef.current);
        setTimeout(poll, delay);
      }
    } catch {
      // network hiccup — retry with backoff
      const delay = nextPollDelay(++attemptRef.current);
      setTimeout(poll, delay);
    }
  }, [sessionId]);

  useEffect(() => {
    if (TERMINAL.has(status)) return;
    const delay = nextPollDelay(attemptRef.current);
    const t = setTimeout(poll, delay);
    return () => clearTimeout(t);
  }, [poll, status]);

  return <SessionDetail session={vm} userName={userName} />;
}
