import type { SessionStatus } from "./tokens";

export interface StatusPillProps {
  readonly status: SessionStatus;
  readonly label: string;
  readonly className?: string;
}

/** Small colored status indicator with a blinking dot while recording. */
export function StatusPill({ status, label, className }: StatusPillProps) {
  const statusClass: Record<SessionStatus, string> = {
    recording:
      "bg-(--syn-status-recording-bg) text-(--syn-status-recording-fg)",
    processing:
      "bg-(--syn-status-processing-bg) text-(--syn-status-processing-fg)",
    done: "bg-(--syn-status-done-bg) text-(--syn-status-done-fg)",
  };

  return (
    <div
      className={[
        "inline-flex w-fit items-center gap-1.25 rounded-(--syn-radius-pill) px-2.5 py-1 font-(--syn-font-ui) text-[12px]",
        statusClass[status],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={[
          "size-1.5 rounded-full bg-current",
          status === "recording" && "animate-pulse",
        ]
          .filter(Boolean)
          .join(" ")}
      />
      {label}
    </div>
  );
}
