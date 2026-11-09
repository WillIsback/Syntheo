// Fenêtre visible, largeur et sélection de la liste virtuelle (DOM).
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { observeScrollContent } from "./viewport-hooks";
import { FALLBACK_VIEWPORT_HEIGHT } from "./virtual-layout";

export function useSelectedSegmentIndexes(listElement: HTMLDivElement | null) {
  const subscribe = useCallback((notify: () => void) => {
    document.addEventListener("selectionchange", notify);
    return () => document.removeEventListener("selectionchange", notify);
  }, []);
  const getSnapshot = useCallback(() => {
    if (!listElement) return "";
    const selection = window.getSelection();
    const indexes = [selection?.anchorNode, selection?.focusNode]
      .flatMap((node) => {
        const element =
          node instanceof Element ? node : (node?.parentElement ?? null);
        const row = element?.closest<HTMLElement>(
          "[data-transcript-virtual-index]",
        );
        if (!row || !listElement.contains(row)) return [];
        const index = Number(row.dataset.transcriptVirtualIndex);
        return Number.isInteger(index) ? [index] : [];
      })
      .sort((left, right) => left - right);
    return Array.from(new Set(indexes)).join(",");
  }, [listElement]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(
    () =>
      snapshot ? snapshot.split(",").map(Number).filter(Number.isInteger) : [],
    [snapshot],
  );
}

export function useElementWidth(
  element: HTMLElement | null,
): number | undefined {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!element || typeof ResizeObserver === "undefined") {
        return () => {};
      }
      const observer = new ResizeObserver(notify);
      observer.observe(element);
      return () => observer.disconnect();
    },
    [element],
  );
  // Arrondie à 10px près pour ne pas tout réestimer au moindre pixel.
  const getSnapshot = useCallback(
    () =>
      element && element.clientWidth > 0
        ? Math.round(element.clientWidth / 10) * 10
        : undefined,
    [element],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useVirtualViewport(
  scrollElement: HTMLDivElement | null,
  listElement: HTMLDivElement | null,
) {
  const store = useMemo(
    () => createVirtualViewportStore(scrollElement, listElement),
    [listElement, scrollElement],
  );
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const [scrollTop, height, listTop] = snapshot.split("|").map(Number);
  return { scrollTop, height, listTop };
}

function createVirtualViewportStore(
  scrollElement: HTMLDivElement | null,
  listElement: HTMLDivElement | null,
) {
  let listTop: number | null = null;
  let snapshot = "0|800|0";
  let animationFrame: number | null = null;
  let shouldMeasureList = true;
  const listeners = new Set<() => void>();

  const refresh = (measureList: boolean) => {
    if (!scrollElement) {
      snapshot = `0|${FALLBACK_VIEWPORT_HEIGHT}|0`;
      return;
    }

    if (measureList || listTop === null) {
      const scrollRect = scrollElement.getBoundingClientRect();
      const listRect = listElement?.getBoundingClientRect();
      listTop = listRect
        ? scrollElement.scrollTop + listRect.top - scrollRect.top
        : scrollElement.scrollTop;
    }
    const next = `${scrollElement.scrollTop}|${scrollElement.clientHeight || FALLBACK_VIEWPORT_HEIGHT}|${listTop}`;
    if (next !== snapshot) {
      snapshot = next;
      listeners.forEach((listener) => listener());
    }
  };

  const scheduleRefresh = (measureList = false) => {
    shouldMeasureList ||= measureList;
    if (animationFrame !== null) return;
    animationFrame = requestAnimationFrame(() => {
      animationFrame = null;
      const measure = shouldMeasureList;
      shouldMeasureList = false;
      refresh(measure);
    });
  };

  refresh(true);
  const subscribe = (listener: () => void) => {
    if (!scrollElement) return () => {};
    listeners.add(listener);
    const handleScroll = () => scheduleRefresh();
    const handleLayout = () => scheduleRefresh(true);
    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleLayout);
    // La position de la liste ne change que si un bloc au-dessus d'elle
    // change de hauteur : pas à chaque partiel (issue 281).
    const stopObservingContent = observeScrollContent(
      scrollElement,
      handleLayout,
    );
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(handleLayout);
    if (listElement) resizeObserver?.observe(listElement);
    scheduleRefresh(true);

    return () => {
      listeners.delete(listener);
      scrollElement.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleLayout);
      resizeObserver?.disconnect();
      stopObservingContent();
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    };
  };

  return { getSnapshot: () => snapshot, subscribe };
}
