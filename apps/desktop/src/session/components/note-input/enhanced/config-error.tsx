import { Trans } from "@lingui/react/macro";

import { Button } from "@syntheo/ui/components/ui/button";

import { useTabs } from "~/store/zustand/tabs";

export function ConfigError() {
  const openNew = useTabs((state) => state.openNew);

  return (
    <div
      role="alert"
      className="flex h-full min-h-[400px] flex-col items-center justify-center px-6"
    >
      <div className="mb-6 flex max-w-md flex-col gap-2 text-center">
        <p className="text-base font-medium">
          <Trans>Set up AI summaries</Trans>
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          <Trans>
            Set up a language model (an OpenAI-compatible endpoint on your
            infrastructure) to generate a summary of this transcript.
          </Trans>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          className="shadow-none"
          onClick={() =>
            openNew({ type: "settings", state: { tab: "intelligence" } })
          }
        >
          <Trans>Set up the model</Trans>
        </Button>
      </div>
    </div>
  );
}
