import { useLingui } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { providerCredentialIdentity } from "@syntheo/provider-validation";
import { cn } from "@syntheo/utils";

import {
  decideImageInput,
  detectImageInput,
  type ImageInputChoice,
  type ImageInputDetection,
  type ImageProbeResult,
  imageInputKey,
  parseImageInputSettings,
  probeImageInput,
  withImageInputEntry,
} from "~/settings/ai/shared/image-input";
import { updateSettingValue, useSettingsReady } from "~/settings/queries";
import { useConfigValue } from "~/shared/config";

// « Le modèle lit les images » (issue 754), dans la carte « Mon serveur » de
// la synthèse. Automatique interroge le serveur une fois par adresse et par
// modèle (métadonnées, puis requête avec l'image de test) et garde le
// résultat ; « Tester avec une image » envoie toujours l'image de test et
// garde sa réponse quand elle est nette (issue 771). Le texte distingue ce
// que le serveur annonce (métadonnées) de ce que le modèle a montré en
// recevant l'image (envoi réel).

const CHOICES: ImageInputChoice[] = ["auto", "yes", "no"];

function saveImageInput(
  key: string,
  update: Parameters<typeof withImageInputEntry>[2],
): Promise<unknown> {
  return updateSettingValue("llm_image_input", (current) =>
    withImageInputEntry(parseImageInputSettings(current), key, update),
  ).catch((error) => {
    console.error("[settings] failed to update llm_image_input", error);
  });
}

export function ImageInputSetting({
  baseUrl,
  apiKey,
  model,
  connected,
  recheck = 0,
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  connected: boolean;
  /**
   * Incrémenté par « Tester la connexion » (issue 768) : la détection est
   * refaite une fois la connexion rétablie, sans effacer le résultat gardé.
   * Seul un résultat net le remplace ; un choix forcé n'est jamais touché.
   */
  recheck?: number;
}) {
  const { t, i18n } = useLingui();
  const settingsReady = useSettingsReady();
  const stored = useConfigValue("llm_image_input");
  const key = imageInputKey(baseUrl, model);
  const entry = parseImageInputSettings(stored)[key];
  const choice = entry?.choice ?? "auto";
  const decision = decideImageInput(entry, model);

  const persist = (detected: ImageInputDetection) =>
    saveImageInput(key, (current) => ({ ...current, detected }));

  // Une demande de « Tester la connexion » ne compte que si le choix est
  // Automatique au moment du clic : un clic fait sous Oui ou Non ne doit pas
  // relancer la sonde plus tard, au retour sur Automatique, quand un
  // résultat est gardé. La dernière demande vue est retenue par serveur et
  // modèle ; seule celle acceptée sert à la détection.
  const [seenRecheck, setSeenRecheck] = useState({ key, recheck });
  const [acceptedRecheck, setAcceptedRecheck] = useState<{
    key: string;
    count: number;
  } | null>(null);
  if (seenRecheck.key !== key || seenRecheck.recheck !== recheck) {
    setSeenRecheck({ key, recheck });
    if (recheck > 0 && settingsReady && choice === "auto") {
      setAcceptedRecheck({ key, count: recheck });
    }
  }
  const effectiveRecheck =
    acceptedRecheck?.key === key ? acceptedRecheck.count : 0;
  // Dernière détection demandée : deux clics rapprochés sur « Tester la
  // connexion » lancent deux détections, et seule la plus récente peut
  // écrire son résultat ; une réponse plus ancienne arrivée après est
  // ignorée.
  const latestRecheck = useRef<Record<string, number>>({});
  useEffect(() => {
    latestRecheck.current[key] = effectiveRecheck;
  }, [key, effectiveRecheck]);
  const isLatestRecheck = (requested: number) =>
    requested >= (latestRecheck.current[key] ?? requested);

  // La détection ne part qu'une fois les réglages lus (issue 769) : au
  // premier rendu, le réglage vaut encore « {} » (choix Automatique, rien de
  // gardé), et la sonde partait à chaque ouverture de la page, même avec un
  // résultat gardé ou un choix forcé. Un résultat net est gardé par serveur
  // et modèle ; une réponse ambiguë reste en cache pour la session, sans
  // nouvelle sonde à chaque visite. Seuls un autre serveur, un autre modèle
  // « Tester la connexion » ou « Tester avec une image » la refont.
  const detection = useQuery({
    queryKey: [
      "llm-image-input",
      baseUrl,
      model,
      providerCredentialIdentity({ provider: "custom", baseUrl, apiKey }),
      effectiveRecheck,
    ],
    queryFn: async () => {
      const requested = effectiveRecheck;
      const result = await detectImageInput({ baseUrl, apiKey, model });
      // Résultat net seulement : sans réponse claire, rien n'est gardé et le
      // nom du modèle sert de repli. Une détection dépassée par une demande
      // plus récente n'écrit rien.
      if (result && isLatestRecheck(requested)) {
        await persist(result);
      }
      return result;
    },
    enabled:
      settingsReady &&
      connected &&
      choice === "auto" &&
      (!entry?.detected || effectiveRecheck > 0),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  const testing = useMutation({
    mutationFn: () => probeImageInput({ baseUrl, apiKey, model }),
    onSuccess: (result) => {
      if (result.status !== "unclear") void persist(result.detection);
    },
  });

  const labels: Record<ImageInputChoice, string> = {
    auto: t`Automatic`,
    yes: t`Yes`,
    no: t`No`,
  };
  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.locale, { dateStyle: "medium" }).format(
      new Date(iso),
    );

  let help: string;
  if (choice === "yes") {
    help = t`The note's images are always attached when the summary is generated.`;
  } else if (choice === "no") {
    help = t`The note's images are never attached.`;
  } else if (detection.isFetching) {
    help = t`Checking whether the model reads images…`;
  } else if (entry?.detected) {
    const checkedOn = date(entry.detected.checkedAt);
    if (entry.detected.source === "metadata") {
      help = entry.detected.reads
        ? t`Announced by the server: the model reads images (checked on ${checkedOn}).`
        : t`Announced by the server: the model does not read images (checked on ${checkedOn}). Choose Yes if your server serves the vision part of the model.`;
    } else {
      help = entry.detected.reads
        ? t`The model accepted the test image and described it (checked on ${checkedOn}).`
        : t`The server refused the test image (checked on ${checkedOn}). Choose Yes if your server serves the vision part of the model.`;
    }
  } else if (decision.reads) {
    help = t`The server could not be checked: going by its name, “${model}” reads images.`;
  } else {
    help = t`The server could not be checked and “${model}” is not recognized: its images are not attached. Choose Yes if your server serves the vision part of the model.`;
  }

  const testResultText = (result: ImageProbeResult): string => {
    if (result.status === "reads") {
      return t`The model accepted the test image: it saw the blue disc.`;
    }
    if (result.status === "refused") {
      return t`The server refused the test image: the model does not read images.`;
    }
    if (result.reason === "unrelated") {
      return t`The server accepted the test image, but the model did not describe it: it may not read images. Choose Yes or No to decide.`;
    }
    return t`The server did not give a clear answer. Try again later.`;
  };
  const testResult = testing.isSuccess
    ? {
        ok: testing.data.status === "reads",
        text: testResultText(testing.data),
      }
    : null;

  return (
    <div
      data-setting-id="llm-image-input"
      className="border-border flex flex-col gap-2.5 border-t pt-3.5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold">{t`The model reads images`}</span>
          <span className="text-muted-foreground text-[13px]">
            {t`Sketches, screenshots and images in the note are attached when the summary is generated.`}
          </span>
        </div>
        <div
          role="radiogroup"
          aria-label={t`The model reads images`}
          className="border-input inline-flex shrink-0 overflow-hidden rounded-lg border"
        >
          {CHOICES.map((value, index) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={choice === value}
              onClick={() =>
                void saveImageInput(key, (current) => ({
                  ...current,
                  choice: value,
                }))
              }
              className={cn([
                "focus-visible:ring-ring px-3 py-1.5 text-[13px] focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset",
                index > 0 && "border-input border-l",
                choice === value
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-card hover:bg-muted",
              ])}
            >
              {labels[value]}
            </button>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground text-[13px]" aria-live="polite">
        {help}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!connected || testing.isPending}
          onClick={() => testing.mutate()}
          className="border-input bg-card hover:bg-muted rounded-md border px-3 py-1.5 text-[13px] font-medium disabled:opacity-60"
        >
          {testing.isPending ? t`Testing…` : t`Test with an image`}
        </button>
        {testResult ? (
          <span
            role="status"
            className={cn([
              "text-[13px]",
              testResult.ok
                ? "text-accent-foreground"
                : "text-alert-foreground",
            ])}
          >
            {testResult.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
