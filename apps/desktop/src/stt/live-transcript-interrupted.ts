import { t } from "@lingui/core/macro";

import type { DegradedError } from "@syntheo/plugin-transcription";

import { PROVIDERS } from "~/settings/ai/stt/shared";

function providerDisplayName(providerId: string | null | undefined) {
  if (!providerId) return null;
  return (
    PROVIDERS.find((provider) => provider.id === providerId)?.displayName ??
    null
  );
}

function isProviderSideStreamError(message: string) {
  return (
    /provider error/i.test(message) ||
    /code=Some\(4\d{3}\)/.test(message) ||
    /^[\w-]+: /.test(message)
  );
}

// Le listener (crates/listener-core, supervisor) ne retente pas la connexion
// après un refus de clé ou de réglages : seule une action de l'utilisateur
// peut alors relancer la transcription en direct.
// La source « Sur ce poste » (issue 684) n'est pas non plus retentée après
// un refus définitif ni après une preuve du module refusée.
function isRetriedAutomatically(degraded: DegradedError | null) {
  if (degraded?.type === "on_device_unavailable") {
    return !degraded.permanent;
  }
  return (
    degraded?.type !== "authentication_failed" &&
    degraded?.type !== "provider_configuration" &&
    degraded?.type !== "on_device_authentication_failed"
  );
}

function onDeviceCause(reason: string) {
  switch (reason) {
    case "disabled":
      return t`on-device transcription is disabled by your organization`;
    case "invalid":
      return t`the transcription module of this computer is missing or has been modified`;
    case "crashing":
      return t`the transcription module of this computer keeps stopping`;
    case "failed_to_start":
      return t`the transcription module of this computer did not start`;
    case "installing":
      return t`the transcription module of this computer is being installed`;
    case "measuring":
      return t`the transcription module of this computer is being measured`;
    case "not_commissioned":
      return t`this computer has not been measured, or is too slow for live transcription`;
    case "execution_blocked":
      return t`this computer does not allow the transcription program to run (application control policy)`;
    default:
      return t`on-device transcription is not available`;
  }
}

function getPauseCause({
  degraded,
  sttProvider,
  online,
}: {
  degraded: DegradedError | null;
  sttProvider: string | null | undefined;
  online: boolean;
}) {
  const providerName =
    providerDisplayName(sttProvider) ?? t`the transcription service`;

  // Le module local ne dépend pas du réseau : cause avant « hors ligne ».
  if (degraded?.type === "on_device_authentication_failed") {
    return t`the transcription module of this computer could not be authenticated`;
  }

  if (degraded?.type === "on_device_unavailable") {
    return onDeviceCause(degraded.reason);
  }

  if (!online) {
    return t`you are offline`;
  }

  if (degraded?.type === "authentication_failed") {
    return t`${providerName} rejected your API key`;
  }

  if (degraded?.type === "provider_configuration") {
    return t`${providerName} rejected the transcription settings`;
  }

  if (
    degraded?.type === "stream_error" &&
    isProviderSideStreamError(degraded.message)
  ) {
    return t`${providerName} is having an outage`;
  }

  if (degraded) {
    return t`Syntheo cannot reach ${providerName}`;
  }

  return t`${providerName} stopped sending text`;
}

export function getLiveTranscriptPausedMessage({
  degraded,
  sttProvider,
  online = typeof navigator === "undefined" ? true : navigator.onLine,
}: {
  degraded: DegradedError | null;
  sttProvider: string | null | undefined;
  online?: boolean;
}) {
  const cause = getPauseCause({ degraded, sttProvider, online });
  // Sans nouvelle tentative (clé ou réglages refusés), le passage manque tant
  // que la personne n'agit pas : formulation ferme.
  if (!isRetriedAutomatically(degraded)) {
    if (
      degraded?.type === "on_device_unavailable" ||
      degraded?.type === "on_device_authentication_failed"
    ) {
      return t`Live transcription paused: ${cause}. No audio is kept: this passage will be missing from the transcription.`;
    }
    return t`Live transcription paused: ${cause}. No audio is kept: this passage will be missing from the transcription. Check the transcription server settings.`;
  }
  // Une coupure courte est rejouée au flux suivant (issue 446) : la perte
  // n'est pas encore connue, on ne l'affirme pas (issue 621). Rien n'est
  // écrit sur le disque.
  return t`Live transcription paused: ${cause}. No audio is saved to disk: if the outage lasts, this passage will be missing from the transcription. Reconnecting…`;
}

export function getLiveTranscriptResumedMessage() {
  return t`Live transcription resumed.`;
}
