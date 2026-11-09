import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type PanInfo,
} from "motion/react";
import { useId, useState } from "react";

import { CheckCircle, Info, WarningCircle } from "@syntheo/ui/components/icons";
import { useSquircleRef } from "@syntheo/ui/hooks/use-squircle";
import { panelSquircle } from "@syntheo/ui/lib/squircle";
import { appToastSwipeDismissDirection } from "@syntheo/ui/lib/toast-gesture";
import { cn } from "@syntheo/utils";

import {
  APP_TOAST_COMPACT_CORNER_RADIUS,
  APP_TOAST_CORNER_RADIUS,
  APP_TOAST_EXIT_DURATION_MS,
  APP_TOAST_STACK_OFFSET_PX,
  APP_TOAST_STACK_SCALE_STEP,
  type AppToastDirection,
  type AppToastItem,
  dismissAppToast,
  toggleAppToastTimer,
} from "./app-toast-store";
import {
  type AppToastAction,
  type AppToastLabels,
  type AppToastSize,
  type AppToastTone,
} from "./app-toast-types";

type AppToastProps = Readonly<{
  toast: AppToastItem;
  size: AppToastSize;
  stackDepth: number;
  stacked: boolean;
  labels: AppToastLabels;
}>;

export function AppToast({
  toast,
  size,
  stackDepth,
  stacked,
  labels,
}: AppToastProps) {
  const compact = size === "compact";
  const squircleRef = useSquircleRef<HTMLDivElement>(undefined, {
    ...panelSquircle,
    radius: compact ? APP_TOAST_COMPACT_CORNER_RADIUS : APP_TOAST_CORNER_RADIUS,
  });
  const reduceMotion = useReducedMotion() ?? false;
  const [expanded, setExpanded] = useState(true);
  const detailsId = useId();
  const hasTimer = Number.isFinite(toast.durationMs);
  const hasDetails = hasTimer || toast.description !== undefined;
  const remainingSeconds = Math.max(0, Math.ceil(toast.remainingMs / 1_000));
  const secondaryAction =
    toast.secondaryAction ??
    (toast.closeButton && toast.dismissible
      ? { label: labels.dismiss, onClick: () => {} }
      : undefined);
  const actions = [toast.action, secondaryAction].filter(
    (action): action is AppToastAction => action !== undefined,
  );
  const stackedBehind = stacked && stackDepth > 0;
  const visuallyExpanded = expanded && !stackedBehind;
  const stackScale = Math.max(
    0.88,
    1 - stackDepth * APP_TOAST_STACK_SCALE_STEP,
  );
  const exitDistance =
    typeof window === "undefined" ? 1_024 : window.innerWidth + 256;
  const progress =
    hasTimer && toast.durationMs > 0
      ? Math.max(0, Math.min(1, toast.remainingMs / toast.durationMs))
      : 0;

  const dismiss = (direction: AppToastDirection = 1) =>
    dismissAppToast(toast.id, direction, "user");
  const handleDragEnd = (
    _event: globalThis.MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (!toast.dismissible) return;
    const direction = appToastSwipeDismissDirection(
      info.offset.x,
      info.velocity.x,
    );
    if (direction !== undefined) dismiss(direction);
  };

  return (
    <motion.div
      layout
      role={toast.tone === "error" ? "alert" : "status"}
      data-slot="app-toast"
      data-app-toast=""
      data-tone={toast.tone}
      data-size={size}
      data-expanded={visuallyExpanded}
      data-phase={toast.phase}
      data-exit-direction={toast.exitDirection}
      data-stack-depth={stackDepth}
      data-stacked-behind={stackedBehind}
      inert={stackedBehind}
      initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.96 }}
      animate={
        toast.phase === "exiting"
          ? {
              opacity: 0,
              x: toast.exitDirection * exitDistance,
              scale: 0.96,
            }
          : {
              opacity: 1,
              x: 0,
              y: stacked ? -stackDepth * APP_TOAST_STACK_OFFSET_PX : 0,
              scale: stacked ? stackScale : 1,
            }
      }
      transition={
        reduceMotion
          ? { duration: 0 }
          : {
              layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.18, ease: "easeOut" },
              x: {
                duration: APP_TOAST_EXIT_DURATION_MS / 1_000,
                ease: [0.4, 0, 1, 1],
              },
              y: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
              scale: { duration: 0.2, ease: "easeOut" },
            }
      }
      drag={toast.dismissible && toast.phase === "visible" ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      onClick={(event) => {
        if (
          hasDetails &&
          event.target instanceof Element &&
          !event.target.closest(
            "button, a, input, textarea, select, [role='button'], [contenteditable='true']",
          )
        ) {
          setExpanded((current) => !current);
        }
      }}
      whileDrag={reduceMotion ? undefined : { scale: 0.985 }}
      className={cn([
        "no-drag pointer-events-auto col-start-1 row-start-1 mx-auto origin-top touch-pan-y self-start select-none",
        compact
          ? "w-[min(20rem,calc(100vw-2rem))] rounded-[14px] shadow-md"
          : "w-[min(32rem,calc(100vw-2rem))] rounded-[20px] shadow-lg",
        toast.dismissible && toast.phase === "visible"
          ? "cursor-grab active:cursor-grabbing"
          : null,
        toast.phase === "exiting" || stackedBehind
          ? "pointer-events-none"
          : null,
      ])}
      style={{ zIndex: stackDepth === 0 ? 10 : 10 - stackDepth }}
    >
      <div
        ref={squircleRef}
        data-slot="smooth-corners"
        className="bg-popover text-popover-foreground ring-border/70 relative ring-1"
      >
        <button
          type="button"
          aria-label={
            hasDetails
              ? visuallyExpanded
                ? labels.collapseNotification
                : labels.expandNotification
              : undefined
          }
          aria-expanded={hasDetails ? visuallyExpanded : undefined}
          aria-controls={hasDetails ? detailsId : undefined}
          disabled={!hasDetails}
          onClick={() => setExpanded((current) => !current)}
          className={cn([
            "focus-visible:ring-ring flex w-full items-center text-left focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
            hasDetails ? "cursor-pointer" : "cursor-default",
            compact
              ? "min-h-11 gap-2 px-2.5 py-1.5"
              : "min-h-16 gap-3 px-4 py-3",
          ])}
        >
          {/* The slot sizes the glyph, so callers only pass color. */}
          <span
            data-slot="app-toast-leading"
            className={cn([
              "flex shrink-0 items-center justify-center",
              compact ? "size-8 [&>svg]:size-4" : "size-7 [&>svg]:size-6",
            ])}
            aria-hidden
          >
            {toast.leading ?? <AppToastToneIcon tone={toast.tone} />}
          </span>
          <span
            data-slot="app-toast-message"
            className={cn([
              "min-w-0 flex-1 font-semibold break-words whitespace-normal",
              compact ? "text-[13px] leading-5" : "text-sm",
            ])}
          >
            {toast.message}
          </span>
        </button>

        <AnimatePresence initial={false}>
          {visuallyExpanded && toast.description !== undefined ? (
            <motion.div
              id={detailsId}
              key="details"
              data-slot="app-toast-details"
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      height: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                      opacity: { duration: 0.16, ease: "easeOut" },
                    }
              }
              className="overflow-hidden"
            >
              <div
                className={cn([
                  "text-muted-foreground",
                  compact
                    ? "px-2.5 pb-2.5 text-xs leading-4"
                    : "px-4 pb-3 text-sm leading-5",
                ])}
              >
                {toast.description}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {!stackedBehind && actions.length > 0 ? (
          <div
            data-slot="app-toast-actions"
            className={cn([
              "flex items-center gap-2",
              compact ? "px-2.5 pb-2.5" : "px-4 pb-3",
            ])}
          >
            {actions.map((action, index) => (
              <button
                key={index}
                type="button"
                onClick={(event) => {
                  try {
                    action.onClick(event);
                  } finally {
                    if (
                      !event.defaultPrevented &&
                      action.dismissOnClick !== false
                    )
                      dismiss();
                  }
                }}
                className={cn([
                  "focus-visible:ring-ring inline-flex min-w-0 items-center justify-center font-medium transition-[color,background-color,transform] focus-visible:ring-2 focus-visible:outline-none active:scale-[0.98]",
                  action === toast.action
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border-border bg-background text-foreground hover:bg-accent border",
                  compact
                    ? "min-h-7 rounded-md px-2.5 py-1 text-xs"
                    : "min-h-9 rounded-lg px-3 py-1.5 text-sm",
                ])}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
        {visuallyExpanded && hasTimer ? (
          <button
            type="button"
            id={toast.description === undefined ? detailsId : undefined}
            aria-label={
              toast.paused ? labels.resumeAutoDismiss : labels.pauseAutoDismiss
            }
            onClick={() => toggleAppToastTimer(toast.id)}
            className={cn([
              "border-border/60 bg-muted/50 text-muted-foreground hover:bg-muted focus-visible:ring-ring relative flex w-full items-center justify-between gap-3 border-t text-left transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
              compact
                ? "min-h-8 px-2.5 py-1.5 text-[11px]"
                : "min-h-10 px-4 py-2 text-xs",
            ])}
          >
            <span aria-hidden>
              {toast.paused ? labels.timerPaused : labels.closingIn}{" "}
              <span className="text-foreground font-semibold tabular-nums">
                {remainingSeconds}
              </span>{" "}
              {labels.seconds(remainingSeconds)}
            </span>
            <span aria-hidden className="text-foreground font-medium">
              {toast.paused ? labels.resume : labels.pause}
            </span>
            <motion.span
              aria-hidden
              data-slot="app-toast-progress"
              className={cn([
                "absolute inset-x-0 bottom-0 h-0.5 origin-left",
                toast.tone === "error"
                  ? "bg-destructive"
                  : toast.tone === "success"
                    ? "bg-primary"
                    : "bg-chart-2",
              ])}
              initial={false}
              animate={{ scaleX: progress }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.1, ease: "linear" }
              }
            />
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}

function AppToastToneIcon({ tone }: Readonly<{ tone: AppToastTone }>) {
  switch (tone) {
    case "success":
      return <CheckCircle className="text-primary" />;
    case "warning":
      return <WarningCircle className="text-chart-3" />;
    case "error":
      return <WarningCircle className="text-destructive" />;
    case "info":
      return <Info className="text-chart-2" />;
  }
}
