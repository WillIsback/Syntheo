import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useRef } from "react";

import { commands as openerCommands } from "@syntheo/plugin-opener2";
import { ArrowSquareOut } from "@syntheo/ui/components/icons";
import { cn } from "@syntheo/utils";

import {
  STT_NEMO_SPEECH_BASE_URL_PLACEHOLDER,
  STT_OPENAI_BASE_URL_PLACEHOLDER,
} from "./shared";

import type { ServerProtocol } from "~/settings/ai/shared/connection-test";
import { PersistAiSelection } from "~/settings/ai/shared/persist-selection";
import { ServerAddressForm } from "~/settings/ai/shared/server-address";
import {
  type ModelOption,
  ModelRadioList,
  ServerCard,
  ServerFailureBanner,
  ServerHelp,
  ServerStatusChip,
} from "~/settings/ai/shared/server-card";
import {
  STT_SERVER_PROTOCOLS,
  useServerConnection,
} from "~/settings/ai/shared/server-connection";
import { setAiProvider } from "~/settings/providers";
import { useSetSettingValues } from "~/settings/queries";
import { useConfigValues } from "~/shared/config";
import { documentationUrl } from "~/shared/documentation";
import { isConfiguredSttModel } from "~/stt/capabilities";
import { getDefaultSttModel } from "~/stt/model-selection";

type Protocol = (typeof STT_SERVER_PROTOCOLS)[number];

export function SttServerCard() {
  const { t, i18n } = useLingui();
  const protocolLabelId = useId();
  const queryClient = useQueryClient();
  const connection = useServerConnection("stt");
  const { state, baseUrl } = connection;
  const providerId = connection.providerId as Protocol;
  const { current_stt_provider, current_stt_model } = useConfigValues([
    "current_stt_provider",
    "current_stt_model",
  ] as const);
  const setSelection = useSetSettingValues();
  const lastModels = useRef<Record<string, string>>({});

  const model =
    current_stt_provider === providerId &&
    isConfiguredSttModel(current_stt_provider, current_stt_model)
      ? (current_stt_model ?? "")
      : "";

  const protocols: Record<Protocol, { label: string; hint: string }> = {
    openai: {
      label: t`OpenAI compatible (realtime and batch)`,
      hint: t`vLLM, speaches, faster-whisper-server`,
    },
    nvidia: { label: t`NVIDIA NeMo-Speech.cpp`, hint: t`Nemotron` },
  };

  const announced =
    state.status === "connected" && state.protocol === providerId
      ? state.models
      : [];
  // NeMo-Speech.cpp sert le seul modèle qu'il a chargé, quel que soit celui
  // que nomme le client : sans test de connexion, on propose le modèle de
  // référence.
  const nvidiaModels = announced.length
    ? announced
    : [getDefaultSttModel("nvidia") ?? ""];
  const models: ModelOption[] =
    providerId === "nvidia"
      ? nvidiaModels.map((id) => ({ id }))
      : state.status === "connected"
        ? state.models.map((id) => ({ id }))
        : [];

  // Le modèle par défaut est enregistré dès qu'une adresse existe : le
  // premier que le serveur annonce, sinon celui du protocole.
  const fallbackModel = announced[0] ?? getDefaultSttModel(providerId);
  // Un modèle enregistré que le serveur NeMo-Speech.cpp n'annonce pas (le
  // modèle de référence avant le test) cède la place au modèle servi.
  const staleNvidiaModel =
    providerId === "nvidia" &&
    !!model &&
    announced.length > 0 &&
    !announced.includes(model);
  const persistedModel = staleNvidiaModel
    ? announced[0]
    : model || fallbackModel || "";
  const persistDefault =
    !!baseUrl &&
    (current_stt_provider !== providerId ||
      (!model && !!fallbackModel) ||
      staleNvidiaModel);

  const chooseProtocol = (next: Protocol) => {
    if (next === providerId) return;
    // Revenir au protocole précédent retrouve le modèle qu'il utilisait.
    if (model) lastModels.current[providerId] = model;
    setSelection({
      current_stt_provider: next,
      current_stt_model:
        lastModels.current[next] ?? getDefaultSttModel(next) ?? "",
    });
  };

  const detected: ServerProtocol | null =
    state.status === "connected" ? state.protocol : null;
  const detectedLabel = detected ? protocols[detected].label : "";
  const adoptDetected = async () => {
    if (!detected || detected === providerId) return;
    await setAiProvider("stt", detected, {
      base_url: baseUrl,
      api_key: connection.apiKey,
    });
    await queryClient.invalidateQueries({
      queryKey: ["ai-provider-api-keys", "stt"],
    });
    chooseProtocol(detected);
  };

  return (
    <ServerCard
      title={<Trans>My server</Trans>}
      status={<ServerStatusChip state={state} />}
    >
      {persistDefault ? (
        <PersistAiSelection
          key={`stt:${providerId}:${persistedModel}`}
          type="stt"
          provider={providerId}
          model={persistedModel}
        />
      ) : null}
      {state.status === "failed" ? (
        <ServerFailureBanner
          kind="stt"
          failure={state.failure}
          baseUrl={baseUrl}
        />
      ) : null}
      <div data-setting-id="stt-server">
        <ServerAddressForm
          kind="stt"
          providerId={providerId}
          label={<Trans>Server address</Trans>}
          placeholder={
            providerId === "nvidia"
              ? STT_NEMO_SPEECH_BASE_URL_PLACEHOLDER
              : STT_OPENAI_BASE_URL_PLACEHOLDER
          }
          testing={state.status === "testing"}
          onTest={connection.test}
          isCurrentProvider={current_stt_provider === providerId}
        />
      </div>
      <div data-setting-id="stt-protocol" className="flex flex-col gap-2">
        <span
          id={protocolLabelId}
          className="text-muted-foreground text-[13px] font-medium"
        >
          <Trans>Protocol</Trans>
          {detected === providerId ? (
            <span className="text-accent-foreground">
              {" · "}
              <Trans>detected automatically</Trans>
            </span>
          ) : null}
        </span>
        <div
          role="radiogroup"
          aria-labelledby={protocolLabelId}
          className="flex flex-wrap gap-1.5"
        >
          {STT_SERVER_PROTOCOLS.map((id) => {
            const checked = id === providerId;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={checked}
                title={protocols[id].hint}
                onClick={() => chooseProtocol(id)}
                className={cn([
                  "focus-visible:ring-ring rounded-md border px-2.5 py-0.5 text-[13px] transition-colors focus-visible:ring-2 focus-visible:outline-hidden",
                  checked
                    ? "border-primary bg-accent text-accent-foreground font-medium"
                    : "border-border text-muted-foreground hover:bg-muted",
                ])}
              >
                {protocols[id].label}
              </button>
            );
          })}
        </div>
        {detected && detected !== providerId ? (
          <p className="text-muted-foreground text-[13px]">
            {t`This server answers as ${detectedLabel}.`}{" "}
            <button
              type="button"
              onClick={() => void adoptDetected()}
              className="text-primary underline underline-offset-[3px]"
            >
              <Trans>Use this protocol</Trans>
            </button>
          </p>
        ) : null}
      </div>
      {baseUrl ? (
        <div data-setting-id="stt-model">
          <ModelRadioList
            key={providerId}
            label={t`Model`}
            models={models}
            value={model}
            onChange={(next) =>
              setSelection({
                current_stt_provider: providerId,
                current_stt_model: next,
              })
            }
            footer={
              providerId === "nvidia"
                ? t`The server transcribes with the model it loaded, whatever the model chosen here.`
                : state.status === "connected"
                  ? undefined
                  : t`Test the connection to list the models served.`
            }
          />
        </div>
      ) : null}
      <ServerHelp>
        <p>
          <Trans>
            OpenAI: a server that speaks the OpenAI speech protocol (vLLM,
            speaches, faster-whisper-server), for example
            http://localhost:8000/v1. Live transcription uses /v1/realtime,
            imported files /v1/audio/transcriptions.
          </Trans>
        </p>
        <p>
          <Trans>
            NVIDIA NeMo-Speech.cpp: your nemo-speech serve server, for example
            http://localhost:9000. Live transcription and imported files use its
            realtime WebSocket. NVIDIA's hosted gRPC endpoint is not supported.
          </Trans>
        </p>
        <p>
          <Trans>
            The API key is optional for servers without authentication. It is
            kept in your system keychain.
          </Trans>
        </p>
        <button
          type="button"
          data-setting-id="stt-local-service"
          onClick={() =>
            void openerCommands
              .openUrl(
                documentationUrl(i18n.locale, "local-transcription-service"),
                null,
              )
              .catch((error) =>
                console.error(
                  "[settings] failed to open the local service guide",
                  error,
                ),
              )
          }
          className="text-primary inline-flex items-center gap-1 self-start underline underline-offset-[3px]"
        >
          <Trans>No server yet? Install the local transcription service</Trans>
          <ArrowSquareOut className="size-3" aria-hidden="true" />
        </button>
      </ServerHelp>
    </ServerCard>
  );
}
