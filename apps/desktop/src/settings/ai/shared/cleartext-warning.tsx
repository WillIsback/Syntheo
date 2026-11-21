import { Trans, useLingui } from "@lingui/react/macro";

import { commands as openerCommands } from "@syntheo/plugin-opener2";
import { Button } from "@syntheo/ui/components/ui/button";

import { documentationUrl } from "~/shared/documentation";

// HTTP clair hors de cette machine (issue 646) : l'audio, les notes et la clé
// d'API passent en clair sur le réseau, et rien ne prouve que le serveur qui
// répond est le bon. Confirmé à l'enregistrement, signalé ensuite en
// permanence.

function httpsHelpUrl(locale: string): string {
  return locale === "fr"
    ? documentationUrl(locale, "ai-setup#passer-son-serveur-en-https")
    : documentationUrl(locale, "ai-setup#switch-your-server-to-https");
}

function HttpsHelpLink() {
  const { i18n } = useLingui();
  return (
    <button
      type="button"
      className="text-foreground underline underline-offset-2"
      onClick={() =>
        void openerCommands
          .openUrl(httpsHelpUrl(i18n.locale), null)
          .catch((error) =>
            console.error("[server] failed to open the HTTPS guide", error),
          )
      }
    >
      <Trans>Switch to HTTPS</Trans>
    </button>
  );
}

/** Avant l'enregistrement : à confirmer. */
export function CleartextConfirmation({
  host,
  onConfirm,
}: {
  host: string;
  onConfirm: () => void;
}) {
  return (
    <div
      role="alert"
      className="border-alert-border bg-alert flex flex-col gap-2 rounded-md border px-3 py-2.5 text-[13px]"
    >
      <p className="text-alert-foreground font-medium">
        <Trans>Unencrypted connection to {host}</Trans>
      </p>
      <p className="text-muted-foreground">
        <Trans>
          The audio, your notes and the API key would travel in clear text on
          the network. On another network, or with Tailscale stopped, another
          machine can answer at this address. Prefer HTTPS: tailscale serve
          publishes your server at https://machine.tailnet.ts.net with an
          automatic certificate.
        </Trans>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="outline" onClick={onConfirm}>
          <Trans>Use unencrypted HTTP anyway</Trans>
        </Button>
        <HttpsHelpLink />
      </div>
    </div>
  );
}

/** Après l'enregistrement : rappel permanent sur la carte. */
export function CleartextNotice() {
  return (
    <p
      role="note"
      data-cleartext-notice
      className="text-alert-foreground text-[13px]"
    >
      <Trans>
        Unencrypted connection: the audio, your notes and the API key travel in
        clear text on the network.
      </Trans>{" "}
      <HttpsHelpLink />
    </p>
  );
}
