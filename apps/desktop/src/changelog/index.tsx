import { Trans, useLingui } from "@lingui/react/macro";

import { ChangelogContent } from "@syntheo/changelog";
import { commands as openerCommands } from "@syntheo/plugin-opener2";
import { X } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import { type ChangelogEntry, changelogEntries } from "./data";

import { useShell } from "~/contexts/shell";
import { StandardContentWrapper } from "~/shared/main";
import { type Tab, useTabs } from "~/store/zustand/tabs";

export function TabContentChangelog({
  tab,
}: {
  tab: Extract<Tab, { type: "changelog" }>;
}) {
  const { current } = tab.state;
  const { chat } = useShell();
  const close = useTabs((state) => state.close);

  useMountEffect(() => {
    if (chat.mode !== "FloatingClosed") {
      chat.sendEvent({ type: "CLOSE" });
    }
  });

  return (
    <StandardContentWrapper>
      <div className="flex h-full flex-col">
        <div data-tauri-drag-region className="shrink-0 pr-1 pl-3">
          <ChangelogHeader version={current} onClose={() => close(tab)} />
        </div>

        <div className="relative mt-2 min-h-0 flex-1 overflow-hidden">
          <div className="scroll-fade-y h-full overflow-y-auto px-3 pb-4">
            <ChangelogEntries entries={changelogEntries} />
          </div>
        </div>
      </div>
    </StandardContentWrapper>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      className="text-primary decoration-primary/40 hover:text-primary-hover underline underline-offset-2"
      href={href}
      onClick={(e) => {
        e.preventDefault();
        void openerCommands
          .openUrl(href, null)
          .catch((error) =>
            console.error("[changelog] failed to open link", error),
          );
      }}
    >
      {children}
    </a>
  );
}

const linkComponents = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) =>
    href ? (
      <ExternalLink href={href}>{children}</ExternalLink>
    ) : (
      <>{children}</>
    ),
};

function ChangelogEntries({ entries }: { entries: readonly ChangelogEntry[] }) {
  const [latest, ...previous] = entries;
  if (!latest) {
    return (
      <p className="text-muted-foreground">
        <Trans>No changelog available for this version.</Trans>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <EntryHeading entry={latest} />
        <EntryBody entry={latest} />
      </section>
      {previous.map((entry) => (
        <details
          key={entry.version}
          className="border-border flex flex-col gap-3 border-t pt-4"
        >
          <summary className="cursor-pointer">
            <EntryHeading entry={entry} />
          </summary>
          <div className="mt-3">
            <EntryBody entry={entry} />
          </div>
        </details>
      ))}
    </div>
  );
}

function EntryHeading({ entry }: { entry: ChangelogEntry }) {
  const { i18n } = useLingui();
  // `AAAA-MM-JJ` lu en heure locale, pour ne pas glisser d'un jour.
  const date = entry.date ? new Date(`${entry.date}T00:00:00`) : null;
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-foreground text-lg font-semibold">
        {entry.version}
      </span>
      {date && !Number.isNaN(date.getTime()) && (
        <span className="text-muted-foreground text-sm">
          {i18n.date(date, { dateStyle: "long" })}
        </span>
      )}
    </span>
  );
}

function EntryBody({ entry }: { entry: ChangelogEntry }) {
  return (
    <div className="flex flex-col gap-3">
      {entry.summary && (
        <p className="text-muted-foreground">{entry.summary}</p>
      )}
      <ChangelogContent content={entry.content} components={linkComponents} />
    </div>
  );
}

function ChangelogHeader({
  version,
  onClose,
}: {
  version: string;
  onClose: () => void;
}) {
  const { t } = useLingui();
  return (
    <div
      data-tauri-drag-region
      className="relative flex h-12 w-full items-center"
    >
      <div
        data-tauri-drag-region
        className="pointer-events-none absolute inset-y-0 left-1/2 flex w-[min(640px,calc(100%_-_160px))] -translate-x-1/2 items-center justify-center"
      >
        <h1 className="text-foreground truncate text-center text-xl font-semibold">
          <Trans>What's new in {version}?</Trans>
        </h1>
      </div>

      <div className="relative z-10 ml-auto flex shrink-0 items-center gap-0 pr-1">
        <Button
          size="icon"
          variant="ghost"
          data-tauri-drag-region="false"
          className="text-muted-foreground hover:text-foreground"
          aria-label={t`Close changelog`}
          title={t`Close`}
          onClick={onClose}
        >
          <X size={16} />
        </Button>
      </div>
    </div>
  );
}
