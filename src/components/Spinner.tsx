export interface SpinnerProps {
  readonly size?: number;
  readonly label?: string;
  readonly hint?: string;
}

/** Loading spinner used for transcription finalization and report generation. */
export function Spinner({ size = 36, label, hint }: SpinnerProps) {
  return (
    <div className="py-10 text-center">
      <div
        className="mx-auto mb-4 animate-spin rounded-full border-[3px] border-(--syn-border) border-t-(--syn-blue)"
        style={{ width: size, height: size }}
      />
      {label && (
        <div className="font-(--syn-font-ui) text-[14px] font-medium text-(--syn-text-2)">
          {label}
        </div>
      )}
      {hint && (
        <div className="mt-1 font-(--syn-font-ui) text-[12px] text-(--syn-text-3)">
          {hint}
        </div>
      )}
    </div>
  );
}
