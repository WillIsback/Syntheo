import { t } from "@lingui/core/macro";

import { json2md, parseJsonContent } from "@syntheo/editor/markdown";
import { toast } from "@syntheo/ui/components/ui/toast";
import { cn } from "@syntheo/utils";

export function getStoredNoteMarkdown(content: string | undefined) {
  const trimmed = content?.trim() ?? "";

  if (!trimmed) {
    return "";
  }

  if (!trimmed.startsWith("{")) {
    return trimmed;
  }

  return json2md(parseJsonContent(trimmed)).trim();
}

const UUID_TITLE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TITLE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function iconHeaderViewClassName(
  isActive: boolean,
  size: "tray" | "standalone" = "tray",
  className?: string,
) {
  const heightClassName = size === "tray" ? "h-6" : "h-7";

  return cn([
    "group/header-view rounded-pill flex shrink-0 items-center justify-center transition-colors select-none [corner-shape:round] [&>svg]:shrink-0",
    isActive
      ? [
          "text-foreground bg-card shadow-xs",
          "dark:bg-accent dark:text-foreground dark:shadow-none",
        ]
      : [
          "text-muted-foreground/70",
          "hover:bg-background/60 hover:text-foreground",
          "dark:hover:bg-accent/80 dark:hover:text-foreground",
        ],
    heightClassName,
    className,
  ]);
}

export function getEnhancedNoteTitle({
  rawTitle,
  templateTitle,
  templateId,
}: {
  rawTitle: unknown;
  templateTitle: string | null;
  templateId: string | undefined;
}) {
  if (templateTitle) {
    return templateTitle;
  }

  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (!title) {
    return t`Summary`;
  }

  const isGeneratedTitle =
    title === "Summary" ||
    title === templateId ||
    UUID_TITLE_RE.test(title) ||
    ISO_TITLE_RE.test(title);

  if (isGeneratedTitle) {
    return t`Summary`;
  }

  return title;
}

export async function copyTextToClipboard(
  text: string,
  messages?: {
    success: string;
    error: string;
  },
) {
  try {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], {
            type: "text/plain",
          }),
          "text/markdown": new Blob([text], {
            type: "text/markdown",
          }),
        }),
      ]);
    } catch {
      // Fallback for environments that do not support text/markdown
      await navigator.clipboard.writeText(text);
    }

    if (messages) {
      toast.success(messages.success);
    }

    return true;
  } catch (error) {
    console.error("Failed to copy note content", error);

    if (messages) {
      toast.error(messages.error);
    }

    return false;
  }
}
