import { Trans } from "@lingui/react/macro";
import { usePrevious } from "@uidotdev/usehooks";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { cn } from "@syntheo/utils";

import {
  TITLE_HEIGHT_CLASS,
  TITLE_TEXT_CLASS,
  TitleInputInner,
  type TitleInputHandle,
  type TitleVariant,
} from "./title-input-field";

import { useTitleGenerating } from "~/ai/hooks";
import { useSession } from "~/session/queries";
import { type Tab } from "~/store/zustand/tabs";

export type { TitleInputHandle } from "./title-input-field";

export const TitleInput = forwardRef<
  TitleInputHandle,
  {
    tab: Extract<Tab, { type: "sessions" }>;
    onTransferContentToEditor?: (content: string) => void;
    onFocusEditorAtStart?: () => void;
    onFocusEditorAtPixelWidth?: (pixelWidth: number) => void;
    variant?: TitleVariant;
  }
>(
  (
    {
      tab,
      onTransferContentToEditor,
      onFocusEditorAtStart,
      onFocusEditorAtPixelWidth,
      variant = "title",
    },
    ref,
  ) => {
    const {
      id: sessionId,
      state: { view },
    } = tab;
    const isGenerating = useTitleGenerating(sessionId);
    const wasGenerating = usePrevious(isGenerating);
    const [showRevealAnimation, setShowRevealAnimation] = useState(false);
    const [generatedTitle, setGeneratedTitle] = useState<string | null>(null);
    const storeTitle = useSession(sessionId)?.title;

    const editorId = view ? "active" : "inactive";
    const inputRef = useRef<TitleInputHandle>(null);

    useImperativeHandle(ref, () => inputRef.current!, []);

    useEffect(() => {
      if (wasGenerating && !isGenerating) {
        setGeneratedTitle(storeTitle ?? null);
        setShowRevealAnimation(true);
        const timer = setTimeout(() => {
          setShowRevealAnimation(false);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }, [wasGenerating, isGenerating, storeTitle]);

    if (isGenerating) {
      return (
        <div
          data-tauri-drag-region="false"
          className={cn([
            "flex w-full items-center justify-start",
            TITLE_HEIGHT_CLASS[variant],
          ])}
        >
          <span
            className={cn([
              "text-muted-foreground animate-pulse",
              TITLE_TEXT_CLASS[variant],
            ])}
          >
            <Trans>Generating title...</Trans>
          </span>
        </div>
      );
    }

    if (showRevealAnimation && generatedTitle) {
      return (
        <div
          data-tauri-drag-region="false"
          className={cn([
            "flex w-full items-center justify-start overflow-hidden",
            TITLE_HEIGHT_CLASS[variant],
          ])}
        >
          <span
            className={cn([
              "animate-reveal-left whitespace-nowrap",
              TITLE_TEXT_CLASS[variant],
            ])}
          >
            {generatedTitle}
          </span>
        </div>
      );
    }

    return (
      <TitleInputInner
        key={sessionId}
        ref={inputRef}
        sessionId={sessionId}
        editorId={editorId}
        onTransferContentToEditor={onTransferContentToEditor}
        onFocusEditorAtStart={onFocusEditorAtStart}
        onFocusEditorAtPixelWidth={onFocusEditorAtPixelWidth}
        variant={variant}
      />
    );
  },
);
