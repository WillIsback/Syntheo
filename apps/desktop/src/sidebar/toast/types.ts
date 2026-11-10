import type { ReactNode } from "react";

type ToastAction = {
  label: string;
  icon?: ReactNode;
  onClick: () => void | Promise<void>;
};

type ToastLifecycle =
  | { type: "condition-bound" }
  | {
      type: "persistent";
      dismissal: "permanent" | "session" | "day";
      dismissalId?: string;
    };

export type ToastType = {
  id: string;
  icon?: ReactNode;
  description: ReactNode;
  detail?: string;
  primaryAction?: ToastAction;
  lifecycle: ToastLifecycle;
  variant?: "default" | "error" | "warning";
  loading?: boolean;
};

export type ToastCondition = () => boolean;
