import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";

import {
  isEligible,
  runOnDeviceProbe,
  useOnDeviceStatus,
} from "~/stt/on-device";

// Proposition « Sur ce poste » à l'accueil (issue 685) : la sonde tourne en
// fond si l'organisation autorise le module, et la proposition n'apparaît que
// si le poste est éligible. Rien n'est installé ni activé ici.
export function OnDeviceProposal() {
  const status = useOnDeviceStatus();
  const probe = useQuery({
    queryKey: ["on-device-probe", "onboarding"],
    queryFn: runOnDeviceProbe,
    enabled: !!status.data?.allowed,
    staleTime: Infinity,
    retry: false,
  });
  if (!status.data?.allowed || !isEligible(probe.data)) return null;
  return (
    <p data-testid="on-device-proposal" className="text-muted-foreground">
      <Trans>
        This computer can also transcribe your meetings on its own, without a
        server. You can set it up in Settings › Transcription.
      </Trans>
    </p>
  );
}
