export interface StatCellProps {
  readonly value: string | number;
  readonly label: string;
}

/** Small stat tile used in the session right-panel grid (duration, speaker count). */
export function StatCell({ value, label }: StatCellProps) {
  return (
    <div className="rounded-(--syn-radius-sm) bg-(--syn-bg) p-2.5 text-center">
      <div className="font-(--syn-font-ui) text-[18px] tracking-[-0.01em] text-(--syn-text)">
        {value}
      </div>
      <div className="mt-0.5 font-(--syn-font-ui) text-[10px] text-(--syn-text-3)">
        {label}
      </div>
    </div>
  );
}
