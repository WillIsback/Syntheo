"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { validateSessionName } from "@/lib/session-name";

export type SidebarSegment = {
  id: string;
  label: string;
  color: string;
  inProgress?: boolean;
};
export type SidebarSession = {
  id: string;
  icon: string;
  name: string;
  dateLabel: string;
  segments: SidebarSegment[];
};

export function Sidebar({ sessions }: { readonly sessions: SidebarSession[] }) {
  const pathname = usePathname();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [localNames, setLocalNames] = useState<Record<string, string>>({});
  const escapedRenameRef = useRef(false);

  function displayName(s: SidebarSession) {
    return localNames[s.id] ?? s.name;
  }

  async function saveRename(sessionId: string) {
    const trimmed = draftName.trim();
    const error = validateSessionName(trimmed);
    if (!error) {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
        if (res.ok) {
          const data = (await res.json()) as { name: string };
          setLocalNames((prev) => ({ ...prev, [sessionId]: data.name }));
        }
      } catch {
        // silently ignore — name reverts to previous
      }
    }
    setEditingId(null);
  }

  return (
    <nav className="flex w-(--syn-sidebar-w) shrink-0 flex-col overflow-y-auto border-r border-(--syn-border) bg-(--syn-surface) p-2">
      <Link
        href="/record"
        className="mb-4 flex items-center gap-2.5 rounded-full border border-(--syn-border) bg-(--syn-surface) px-3.5 py-2.5 text-sm font-medium text-(--syn-text) hover:shadow-(--syn-shadow-sm)"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--syn-blue) text-white">
          +
        </span>{" "}
        Nouvelle session
      </Link>

      <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[.06em] text-(--syn-text-3)">
        Sessions
      </div>

      {sessions.map((s) => {
        const active = pathname === `/sessions/${s.id}`;
        return (
          <div key={s.id}>
            {editingId === s.id ? (
              <div
                className={[
                  "flex items-center gap-2.5 rounded-(--syn-radius-sm) px-2.5 py-2",
                  active ? "bg-(--syn-blue-light)" : "bg-(--syn-bg)",
                ].join(" ")}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] bg-(--syn-bg) text-sm">
                  {s.icon}
                </div>
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => {
                    if (escapedRenameRef.current) {
                      escapedRenameRef.current = false;
                      return;
                    }
                    saveRename(s.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      escapedRenameRef.current = true;
                      setEditingId(null);
                    }
                  }}
                  className="min-w-0 flex-1 rounded border border-(--syn-blue) bg-white px-1.5 py-0.5 text-[13px] font-medium text-(--syn-text) outline-none"
                />
              </div>
            ) : (
              <Link
                href={`/sessions/${s.id}`}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  setDraftName(displayName(s));
                  setEditingId(s.id);
                }}
                className={[
                  "flex flex-1 items-center gap-2.5 rounded-(--syn-radius-sm) px-2.5 py-2",
                  active ? "bg-(--syn-blue-light)" : "hover:bg-(--syn-bg)",
                ].join(" ")}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] bg-(--syn-bg) text-sm">
                  {s.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={[
                      "truncate text-[13px] font-medium",
                      active ? "text-(--syn-blue-dark)" : "text-(--syn-text)",
                    ].join(" ")}
                  >
                    {displayName(s)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-(--syn-text-3)">
                    {s.dateLabel}
                  </div>
                </div>
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
