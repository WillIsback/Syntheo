import { Fragment, memo, useMemo } from "react";

import type { HighlightSegment } from "./utils";

import { nameMemoComponent } from "~/devtools-bar/render-tracker";
import type { SegmentWord } from "~/stt/live-segment";

interface WordSpanProps {
  word: SegmentWord;
  displayText: string;
  highlightSegments?: HighlightSegment[];
  isActiveMatch?: boolean;
}

export const WordSpan = memo(function WordSpan(props: WordSpanProps) {
  const content = useHighlightedContent(
    props.word,
    props.displayText,
    props.highlightSegments,
    props.isActiveMatch ?? false,
  );
  const className = props.word.is_final ? undefined : "italic opacity-60";

  return (
    <span
      className={className}
      data-transcript-word-id={props.word.id}
      data-transcript-word-start-ms={props.word.start_ms}
    >
      {content}
    </span>
  );
});
nameMemoComponent(WordSpan, "WordSpan");

function useHighlightedContent(
  word: SegmentWord,
  displayText: string,
  segments: HighlightSegment[] | undefined,
  isActive: boolean,
) {
  return useMemo(() => {
    if (!segments) {
      return displayText;
    }

    const baseKey = word.id ?? word.text ?? "word";

    return segments.map((segment, index) =>
      segment.isMatch ? (
        <span
          key={`${baseKey}-match-${index}`}
          className={isActive ? "bg-chart-3/35" : "bg-chart-3/15"}
        >
          {segment.text}
        </span>
      ) : (
        <Fragment key={`${baseKey}-text-${index}`}>{segment.text}</Fragment>
      ),
    );
  }, [displayText, isActive, segments, word.id, word.text]);
}
