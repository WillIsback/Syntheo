import { motion } from "motion/react";
import { useState, useSyncExternalStore, type FocusEvent } from "react";
import { createPortal } from "react-dom";

import { cn } from "@syntheo/utils";

import { AppToast } from "./app-toast-item";
import {
  getAppToastSnapshot,
  getClientSnapshot,
  getDesktopHoverSnapshot,
  getServerSnapshot,
  subscribeToAppToasts,
  subscribeToClient,
  subscribeToDesktopHover,
} from "./app-toast-store";
import {
  type AppToastLabels,
  type AppToasterProps,
  DEFAULT_APP_TOAST_LABELS,
} from "./app-toast-types";

export {
  type AppToastTone,
  type AppToastAction,
  type AppToastOptions,
  type AppToastUpdate,
  type AppToastHandle,
  type AppToastLabels,
  DEFAULT_APP_TOAST_LABELS,
  type AppToastAlign,
  type AppToastSize,
  type AppToasterProps,
} from "./app-toast-types";
export {
  dismissAppToast,
  showAppToast,
  showErrorToast,
  showSuccessToast,
  dismissAppToasts,
} from "./app-toast-store";

/**
 * App-wide toast viewport shared by desktop and web.
 * Mount once per renderer root; feedback is published through
 * `showAppToast` and friends.
 */
export function AppToaster({
  theme = "system",
  position = "bottom",
  align = "center",
  size = "default",
  visibleToasts = 4,
  gap = 8,
  className,
  style,
  labels,
}: AppToasterProps) {
  const resolvedLabels: AppToastLabels = {
    ...DEFAULT_APP_TOAST_LABELS,
    ...labels,
  };
  const toasts = useSyncExternalStore(
    subscribeToAppToasts,
    getAppToastSnapshot,
    getAppToastSnapshot,
  );
  const [desktopStackExpanded, setDesktopStackExpanded] = useState(false);
  const visibleToastItems = toasts.slice(-visibleToasts);
  const supportsDesktopHover = useSyncExternalStore(
    subscribeToDesktopHover,
    getDesktopHoverSnapshot,
    getServerSnapshot,
  );
  const isClient = useSyncExternalStore(
    subscribeToClient,
    getClientSnapshot,
    getServerSnapshot,
  );
  const stacked =
    supportsDesktopHover &&
    visibleToastItems.length > 1 &&
    !desktopStackExpanded;

  const expandDesktopStack = () => {
    if (supportsDesktopHover) setDesktopStackExpanded(true);
  };
  const collapseDesktopStack = () => {
    if (supportsDesktopHover) setDesktopStackExpanded(false);
  };
  const handleStackBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget))
      collapseDesktopStack();
  };

  if (!isClient) return null;

  return createPortal(
    <div
      data-slot="app-toaster"
      data-app-toaster=""
      data-theme={theme}
      data-x-position={align}
      data-y-position={position}
      aria-live="polite"
      aria-relevant="additions"
      className={cn([
        "pointer-events-none fixed inset-x-0 isolate z-50 flex",
        align === "end"
          ? "justify-end pr-[max(1rem,env(safe-area-inset-right))]"
          : "justify-center",
        position === "top"
          ? "top-[max(1rem,env(safe-area-inset-top))] items-start"
          : "bottom-[max(1rem,env(safe-area-inset-bottom))] items-end",
        theme === "dark" ? "dark" : undefined,
        className,
      ])}
      style={style}
    >
      <motion.div
        layout
        data-slot="app-toast-stack"
        data-app-toast-stack=""
        data-hover-capable={supportsDesktopHover}
        data-stacked={stacked}
        onMouseEnter={expandDesktopStack}
        onMouseLeave={collapseDesktopStack}
        onFocusCapture={expandDesktopStack}
        onBlurCapture={handleStackBlur}
        className={cn([
          "pointer-events-auto relative w-fit",
          stacked ? "grid" : "flex flex-col",
        ])}
        style={{ gap }}
      >
        {visibleToastItems.map((toast, index) => {
          const stackDepth = visibleToastItems.length - index - 1;
          return (
            <AppToast
              key={toast.id}
              toast={toast}
              size={size}
              stackDepth={stackDepth}
              stacked={stacked}
              labels={resolvedLabels}
            />
          );
        })}
      </motion.div>
    </div>,
    document.body,
  );
}
