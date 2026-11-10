import { Trans, useLingui } from "@lingui/react/macro";

import { commands as openerCommands } from "@syntheo/plugin-opener2";
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
} from "@syntheo/ui/components/icons";

import { ActionButton, MessageBubble, MessageContainer } from "./shared";

import { documentationUrl } from "~/shared/documentation";

// Pas d'application web hébergée : l'aide renvoie à la documentation publique,
// dans la langue de l'interface (l'ancre suit le titre de la page traduite).
function contextLengthHelpUrl(locale: string): string {
  return locale === "fr"
    ? documentationUrl(locale, "chat#guider-le-contexte")
    : documentationUrl(locale, "chat#guide-the-context");
}

// `useChat().error` is typed as Error but holds whatever the transport threw.
export function getChatErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : String(error);
}

function isContextLengthError(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return (
    (lowerMessage.includes("n_keep") && lowerMessage.includes("n_ctx")) ||
    (lowerMessage.includes("context") && lowerMessage.includes("exceeds")) ||
    lowerMessage.includes("context length") ||
    lowerMessage.includes("context size")
  );
}

export function ErrorMessage({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const { t, i18n } = useLingui();
  const message = getChatErrorText(error);
  const showContextLengthHelp = isContextLengthError(message);

  const handleOpenFaq = () => {
    void openerCommands
      .openUrl(contextLengthHelpUrl(i18n.locale), null)
      .catch((error) =>
        console.error("[chat] failed to open help link", error),
      );
  };

  return (
    <MessageContainer align="start">
      <MessageBubble variant="error" withActionButton={!!onRetry}>
        <p className="text-sm">{message}</p>
        {showContextLengthHelp && (
          <button
            onClick={handleOpenFaq}
            className="text-alert-foreground hover:text-destructive mt-2 flex items-center gap-1 text-xs underline"
          >
            <ArrowSquareOut className="h-3 w-3" />
            <Trans>Learn how to fix this</Trans>
          </button>
        )}
        {onRetry && (
          <ActionButton
            onClick={onRetry}
            variant="error"
            icon={ArrowCounterClockwise}
            label={t`Retry`}
          />
        )}
      </MessageBubble>
    </MessageContainer>
  );
}
