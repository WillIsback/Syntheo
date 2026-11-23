import { Trans } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";

import {
  isEligible,
  isOnDeviceInstallable,
  runOnDeviceProbe,
  useOnDeviceStatus,
} from "~/stt/on-device";
import { useSTTConnection } from "~/stt/useSTTConnection";

// Proposition « Sur ce poste » à l'accueil (issue 685) : seulement si
// l'organisation autorise la source et que cette version de l'application
// livre le programme compagnon (issue 683). La sonde ne tourne qu'au clic : pas de calcul
// surprise, sur batterie notamment. Rien n'est installé ni activé ici.
export function OnDeviceProposal() {
  const status = useOnDeviceStatus();
  const probe = useMutation({ mutationFn: runOnDeviceProbe });
  // Sans serveur de transcription configuré, ne pas parler d'un serveur
  // qui n'existe pas (QA 0.8.0-3).
  const serverConfigured = !!useSTTConnection().serverConn;
  if (!isOnDeviceInstallable(status.data)) return null;
  return (
    <div data-testid="on-device-proposal" className="flex flex-col gap-1.5">
      {!probe.data && !probe.isError ? (
        <div>
          <button
            type="button"
            disabled={probe.isPending}
            onClick={() => probe.mutate()}
            className="border-border hover:bg-muted rounded-md border px-2.5 py-1 text-sm disabled:opacity-60"
          >
            <Trans>
              Check whether this computer can transcribe on its own (about 5 s)
            </Trans>
          </button>
        </div>
      ) : null}
      <div aria-live="polite" className="text-muted-foreground">
        {probe.data ? (
          isEligible(probe.data) ? (
            serverConfigured ? (
              <p>
                <Trans>
                  This computer can also transcribe your meetings on its own,
                  without a server. You can set it up in Settings ›
                  Transcription.
                </Trans>
              </p>
            ) : (
              <p>
                <Trans>
                  This computer can transcribe your meetings on its own. You can
                  set it up in Settings › Transcription.
                </Trans>
              </p>
            )
          ) : serverConfigured ? (
            <p>
              <Trans>
                This computer cannot transcribe on its own; Syntheo uses your
                transcription server.
              </Trans>
            </p>
          ) : (
            <p>
              <Trans>
                This computer cannot transcribe on its own. To transcribe your
                meetings, set up a transcription server in Settings ›
                Transcription.
              </Trans>
            </p>
          )
        ) : probe.isError ? (
          <p>
            <Trans>
              The check could not run. You can run it later in Settings ›
              Transcription.
            </Trans>
          </p>
        ) : null}
      </div>
    </div>
  );
}
