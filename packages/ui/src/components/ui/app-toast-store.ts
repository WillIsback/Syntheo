import { type ReactNode } from "react";

import {
  type AppToastAction,
  type AppToastHandle,
  type AppToastOptions,
  type AppToastTone,
} from "./app-toast-types";

type AppToastPhase = "visible" | "exiting";
export type AppToastDirection = -1 | 1;

export type AppToastItem = Readonly<{
  id: string;
  message: ReactNode;
  description?: ReactNode;
  tone: AppToastTone;
  leading?: ReactNode;
  action?: AppToastAction;
  secondaryAction?: AppToastAction;
  durationMs: number;
  remainingMs: number;
  dismissible: boolean;
  closeButton: boolean;
  onDismiss?: (reason: "user" | "timer" | "programmatic") => void;
  paused: boolean;
  phase: AppToastPhase;
  exitDirection: AppToastDirection;
}>;

type AppToastTimer = Readonly<{
  deadline: number;
  timeoutId: ReturnType<typeof setTimeout>;
  tickId: ReturnType<typeof setInterval>;
}>;

const DEFAULT_APP_TOAST_DURATION_MS = 3_000;
export const APP_TOAST_CORNER_RADIUS = 20;
export const APP_TOAST_COMPACT_CORNER_RADIUS = 14;
export const APP_TOAST_EXIT_DURATION_MS = 220;
const APP_TOAST_TICK_MS = 100;
const APP_TOAST_DESKTOP_HOVER_QUERY = "(hover: hover) and (pointer: fine)";
export const APP_TOAST_STACK_OFFSET_PX = 10;
export const APP_TOAST_STACK_SCALE_STEP = 0.035;

let nextToastId = 0;
let appToastSnapshot: readonly AppToastItem[] = [];
const appToastListeners = new Set<() => void>();
const appToastTimers = new Map<string, AppToastTimer>();
const appToastExitTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function subscribeToAppToasts(listener: () => void): () => void {
  appToastListeners.add(listener);
  return () => appToastListeners.delete(listener);
}

export function getAppToastSnapshot(): readonly AppToastItem[] {
  return appToastSnapshot;
}

function publishAppToasts(next: readonly AppToastItem[]): void {
  appToastSnapshot = next;
  appToastListeners.forEach((listener) => listener());
}

function updateAppToast(
  id: string,
  update: (toast: AppToastItem) => AppToastItem,
): void {
  let changed = false;
  const next = appToastSnapshot.map((toast) => {
    if (toast.id !== id) return toast;
    changed = true;
    return update(toast);
  });
  if (changed) publishAppToasts(next);
}

function clearAppToastTimer(id: string): void {
  const timer = appToastTimers.get(id);
  if (!timer) return;
  clearTimeout(timer.timeoutId);
  clearInterval(timer.tickId);
  appToastTimers.delete(id);
}

function removeAppToast(id: string): void {
  clearAppToastTimer(id);
  const exitTimer = appToastExitTimers.get(id);
  if (exitTimer) clearTimeout(exitTimer);
  appToastExitTimers.delete(id);
  publishAppToasts(appToastSnapshot.filter((toast) => toast.id !== id));
}

export function dismissAppToast(
  id: string,
  direction: AppToastDirection = 1,
  reason: "user" | "timer" | "programmatic" = "programmatic",
): void {
  const toast = appToastSnapshot.find((candidate) => candidate.id === id);
  if (!toast || toast.phase === "exiting") return;

  clearAppToastTimer(id);
  updateAppToast(id, (current) => ({
    ...current,
    phase: "exiting",
    exitDirection: direction,
  }));
  appToastExitTimers.set(
    id,
    setTimeout(() => removeAppToast(id), APP_TOAST_EXIT_DURATION_MS),
  );
  toast.onDismiss?.(reason);
}

function updateRemainingTime(id: string): void {
  const timer = appToastTimers.get(id);
  if (!timer) return;
  const remainingMs = Math.max(0, timer.deadline - Date.now());
  updateAppToast(id, (toast) =>
    toast.remainingMs === remainingMs ? toast : { ...toast, remainingMs },
  );
}

function startAppToastTimer(id: string, remainingMs: number): void {
  if (!Number.isFinite(remainingMs)) return;

  const safeRemainingMs = Math.max(0, remainingMs);
  const deadline = Date.now() + safeRemainingMs;
  const timeoutId = setTimeout(
    () => dismissAppToast(id, 1, "timer"),
    safeRemainingMs,
  );
  const tickId = setInterval(() => updateRemainingTime(id), APP_TOAST_TICK_MS);
  appToastTimers.set(id, { deadline, timeoutId, tickId });
}

export function toggleAppToastTimer(id: string): void {
  const toast = appToastSnapshot.find((candidate) => candidate.id === id);
  if (!toast || !Number.isFinite(toast.durationMs) || toast.phase === "exiting")
    return;

  if (toast.paused) {
    updateAppToast(id, (current) => ({ ...current, paused: false }));
    startAppToastTimer(id, toast.remainingMs);
    return;
  }

  const timer = appToastTimers.get(id);
  const remainingMs = timer
    ? Math.max(0, timer.deadline - Date.now())
    : toast.remainingMs;
  clearAppToastTimer(id);
  updateAppToast(id, (current) => ({ ...current, paused: true, remainingMs }));
}

export function subscribeToDesktopHover(listener: () => void) {
  const query = window.matchMedia?.(APP_TOAST_DESKTOP_HOVER_QUERY);
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}

export function getDesktopHoverSnapshot() {
  return window.matchMedia?.(APP_TOAST_DESKTOP_HOVER_QUERY).matches ?? false;
}

export const subscribeToClient = () => () => {};
export const getClientSnapshot = () => true;
export const getServerSnapshot = () => false;

export function showAppToast({
  id = `app-toast-${++nextToastId}`,
  closeButton = true,
  message,
  description,
  tone = "info",
  leading,
  action,
  secondaryAction,
  durationMs = DEFAULT_APP_TOAST_DURATION_MS,
  dismissible = true,
  onDismiss,
}: AppToastOptions): AppToastHandle {
  clearAppToastTimer(id);
  const exitTimer = appToastExitTimers.get(id);
  if (exitTimer) clearTimeout(exitTimer);
  appToastExitTimers.delete(id);
  const normalizedDurationMs = Number.isFinite(durationMs)
    ? Math.max(0, durationMs)
    : durationMs;
  const toast: AppToastItem = {
    id,
    message,
    description,
    tone,
    leading,
    action,
    secondaryAction,
    durationMs: normalizedDurationMs,
    remainingMs: normalizedDurationMs,
    dismissible,
    closeButton,
    onDismiss,
    paused: false,
    phase: "visible",
    exitDirection: 1,
  };

  publishAppToasts(
    appToastSnapshot.some((item) => item.id === id)
      ? appToastSnapshot.map((item) => (item.id === id ? toast : item))
      : [...appToastSnapshot, toast],
  );
  startAppToastTimer(id, normalizedDurationMs);

  return {
    update: (changes) =>
      updateAppToast(id, (current) =>
        current.phase === "exiting" ? current : { ...current, ...changes },
      ),
    dismiss: () => dismissAppToast(id),
  };
}

export function showErrorToast(message: string): AppToastHandle {
  return showAppToast({ message, tone: "error" });
}

export function showSuccessToast(message: string): AppToastHandle {
  return showAppToast({ message, tone: "success" });
}

export function dismissAppToasts(): void {
  const leaving = appToastSnapshot.filter((toast) => toast.phase === "visible");
  appToastTimers.forEach((_, id) => clearAppToastTimer(id));
  appToastExitTimers.forEach((timer) => clearTimeout(timer));
  appToastExitTimers.clear();
  publishAppToasts([]);
  leaving.forEach((toast) => toast.onDismiss?.("programmatic"));
}
