import type { ReactNode } from "react";

export interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly width?: number;
}

/** Centered overlay modal — used for the report-template picker. */
export function Modal({ open, onClose, children, width = 560 }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-500 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(32,33,36,.45)]"
        aria-label="Close modal"
        onClick={onClose}
      />
      <div
        className="relative max-h-[86vh] max-w-[92vw] overflow-y-auto rounded-(--syn-radius-xl) bg-(--syn-surface) p-6"
        style={{ width }}
      >
        {children}
      </div>
    </div>
  );
}
