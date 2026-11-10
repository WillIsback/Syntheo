import {
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
} from "react";

export function VirtualSegmentRow({
  rowKey,
  top,
  index,
  measuredHeight,
  onMeasure,
  onFocus,
  onBlur,
  children,
}: {
  rowKey: string;
  top: number;
  index: number;
  measuredHeight?: number;
  onMeasure: (key: string, height: number) => void;
  onFocus: (index: number) => void;
  onBlur: (event: FocusEvent<HTMLDivElement>) => void;
  children: ReactNode;
}) {
  const observerRef = useRef<ResizeObserver | null>(null);
  const rowRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node) return;

      const measure = () => onMeasure(rowKey, node.offsetHeight);
      measure();
      if (typeof ResizeObserver !== "undefined") {
        observerRef.current = new ResizeObserver((entries) => {
          const height = entries[0]?.borderBoxSize?.[0]?.blockSize;
          if (height === undefined) measure();
          else onMeasure(rowKey, height);
        });
        observerRef.current.observe(node, { box: "border-box" });
      }
    },
    [onMeasure, rowKey],
  );
  const style = useMemo<CSSProperties>(
    () => ({
      left: 0,
      position: "absolute",
      top,
      width: "100%",
      // Chaque ligne est isolée : un partiel qui fait grandir la dernière ne
      // remet en page ni ne repeint les autres (issue 281).
      contain: "content",
      // Les blocs du débord (overscan), hors de l'écran, ne sont ni mis en
      // page ni peints. Seulement une fois mesurés : la taille réservée est
      // alors exactement la hauteur mesurée, donc ni la position des blocs,
      // ni le défilement vers la fin, ni le centrage d'un résultat de
      // recherche ne bougent. Un bloc jamais mesuré est rendu normalement,
      // sinon sa première mesure renverrait la taille réservée au lieu de
      // sa vraie hauteur.
      ...(measuredHeight === undefined
        ? null
        : {
            contentVisibility: "auto",
            containIntrinsicSize: `auto ${measuredHeight}px`,
          }),
    }),
    [measuredHeight, top],
  );

  return (
    <div
      ref={rowRef}
      data-transcript-virtual-index={index}
      style={style}
      onFocusCapture={() => onFocus(index)}
      onBlurCapture={onBlur}
    >
      {children}
    </div>
  );
}
