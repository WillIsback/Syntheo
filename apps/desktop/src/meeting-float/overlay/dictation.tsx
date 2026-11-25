import { useLingui } from "@lingui/react/macro";

import type { FloatingBarState } from "@syntheo/plugin-windows";

import { tokensFor } from "./palette";

export function DictationTranscript({
  dictation,
  colorScheme,
}: {
  dictation: NonNullable<FloatingBarState["dictation"]>;
  colorScheme: FloatingBarState["colorScheme"];
}) {
  const { t } = useLingui();
  const status =
    dictation.phase === "transcribing"
      ? t`Finishing…`
      : dictation.phase === "starting"
        ? t`Starting…`
        : t`Listening…`;
  const empty = dictation.previewUnavailable
    ? t`Live preview is unavailable. Your text will appear when you finish.`
    : !dictation.previewEnabled
      ? t`Enable Live transcript preview in Settings → Dictation to see words as you speak.`
      : status;

  const cleartextHost = dictation.cleartextHost;
  return (
    <>
      {cleartextHost ? (
        <p
          role="note"
          data-cleartext-notice
          className="px-1 text-[12px] leading-5"
          style={{ color: tokensFor(colorScheme).foreground }}
        >
          {t`Unencrypted connection to ${cleartextHost}: your voice travels in clear text.`}
        </p>
      ) : null}
      <p
        className="px-1 text-[15px] leading-6 break-words whitespace-pre-wrap"
        style={{ color: tokensFor(colorScheme).foreground }}
        aria-live="polite"
        aria-atomic="false"
      >
        {dictation.text || dictation.partial ? (
          <>
            {dictation.text}
            {dictation.text && dictation.partial ? " " : ""}
            <span className="opacity-60">{dictation.partial}</span>
          </>
        ) : (
          <span className="opacity-60">{empty}</span>
        )}
      </p>
    </>
  );
}
