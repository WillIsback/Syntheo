import { useLingui } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { providerCredentialIdentity } from "@syntheo/provider-validation";
import { cn } from "@syntheo/utils";

import {
  decideImageInput,
  detectImageInput,
  type ImageInputChoice,
  type ImageInputDetection,
  imageInputKey,
  parseImageInputSettings,
  withImageInputEntry,
} from "~/settings/ai/shared/image-input";
import { updateSettingValue } from "~/settings/queries";
import { useConfigValue } from "~/shared/config";

// « Le modèle lit les images » (issue 754), dans la carte « Mon serveur » de
// la synthèse. Automatique interroge le serveur une fois par adresse et par
// modèle (métadonnées, puis requête avec l'image de test) et garde le
// résultat ; « Tester avec une image » refait la vérification.

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

/** Oublie la détection gardée : la prochaine vue de la carte la refait. */
export function forgetImageInputDetection(
  baseUrl: string,
  model: string,
): Promise<unknown> {
  return saveImageInput(imageInputKey(baseUrl, model), ({ choice }) =>
    choice ? { choice } : {},
  );
}

export function ImageInputSetting({
  baseUrl,
  apiKey,
  model,
  connected,
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  connected: boolean;
}) {
  const { t, i18n } = useLingui();
  const stored = useConfigValue("llm_image_input");
  const key = imageInputKey(baseUrl, model);
  const entry = parseImageInputSettings(stored)[key];
  const choice = entry?.choice ?? "auto";
  const decision = decideImageInput(entry, model);

  const persist = (detected: ImageInputDetection) =>
    saveImageInput(key, (current) => ({ ...current, detected }));

  const detection = useQuery({
    queryKey: [
      "llm-image-input",
      baseUrl,
      model,
      providerCredentialIdentity({ provider: "custom", baseUrl, apiKey }),
    ],
    queryFn: () => detectImageInput({ baseUrl, apiKey, model }),
    enabled: connected && choice === "auto" && !entry?.detected,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  });
  // Résultat net seulement : sans réponse claire, rien n'est gardé et le nom
  // du modèle sert de repli.
  useEffect(() => {
    if (detection.data) void persist(detection.data);
  }, [detection.data]);

  const testing = useMutation({
    mutationFn: () => detectImageInput({ baseUrl, apiKey, model }),
    onSuccess: (result) => {
      if (result) void persist(result);
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
  } else if (entry?.detected?.reads) {
    help = t`Reads images (checked on ${date(entry.detected.checkedAt)}).`;
  } else if (entry?.detected) {
    help = t`Does not read images (checked on ${date(entry.detected.checkedAt)}). Choose Yes if your server serves the vision part of the model.`;
  } else if (decision.reads) {
    help = t`The server could not be checked: going by its name, “${model}” reads images.`;
  } else {
    help = t`The server could not be checked and “${model}” is not recognized: its images are not attached. Choose Yes if your server serves the vision part of the model.`;
  }

  let testResult: { ok: boolean; text: string } | null = null;
  if (testing.isSuccess) {
    testResult =
      testing.data === null
        ? {
            ok: false,
            text: t`The server did not give a clear answer. Try again later.`,
          }
        : testing.data.reads
          ? {
              ok: true,
              text: t`The model accepted the test image (two shapes and an arrow).`,
            }
          : { ok: false, text: t`The model does not accept images.` };
  }

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
