import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  commands as webhookCommands,
  type WebhookInfo,
} from "@syntheo/plugin-local-api";
import {
  isCleartextRemoteUrl,
  validateProviderRequestUrl,
} from "@syntheo/provider-validation";
import { Copy, Trash } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import { Input } from "@syntheo/ui/components/ui/input";
import { toast } from "@syntheo/ui/components/ui/toast";
import { cn } from "@syntheo/utils";

import { copyText } from "./clipboard";

import {
  CleartextConfirmation,
  CleartextNotice,
} from "~/settings/ai/shared/cleartext-warning";
import {
  describeProviderCredentialError,
  describeProviderCredentialErrorCode,
} from "~/settings/ai/shared/provider-credential-error";

const WEBHOOKS_QUERY_KEY = ["webhooks"] as const;

function unwrap<T>(
  result: { status: "ok"; data: T } | { status: "error"; error: string },
): T {
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return result.data;
}

export function WebhooksSection() {
  // `t` de @lingui/core/macro lit la langue au rendu : s'abonner au changement de
  // langue pour se redessiner aussitôt, sous-composants compris (issue 558).
  useLingui();
  const queryClient = useQueryClient();
  const webhooksQuery = useQuery({
    queryKey: WEBHOOKS_QUERY_KEY,
    queryFn: async () => unwrap(await webhookCommands.listWebhooks()),
  });
  const createMutation = useMutation({
    mutationFn: async (url: string) =>
      unwrap(await webhookCommands.createWebhook(url, [])),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: WEBHOOKS_QUERY_KEY }),
    onError: (error) => toast.error(describeAddressRefusal(error.message)),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await webhookCommands.deleteWebhook(id)),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: WEBHOOKS_QUERY_KEY }),
    onError: (error) => toast.error(error.message),
  });
  const setActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      unwrap(await webhookCommands.setWebhookActive(id, active)),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: WEBHOOKS_QUERY_KEY }),
    onError: (error) => toast.error(error.message),
  });
  const testMutation = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await webhookCommands.testWebhook(id)),
    onSuccess: (delivery) => {
      if (delivery.delivered) {
        toast.success(t`Test delivered (${delivery.status})`);
      } else {
        toast.error(t`Test failed (${delivery.status})`);
      }
      void queryClient.invalidateQueries({ queryKey: WEBHOOKS_QUERY_KEY });
    },
    onError: (error) => toast.error(error.message),
  });

  // HTTP clair vers ce poste ou un réseau privé (issue 703) : confirmé avant
  // la création, comme pour un serveur d'inférence. Le HTTP public est
  // refusé par la règle commune, ici et côté Rust.
  const [pendingHttpUrl, setPendingHttpUrl] = useState<string | null>(null);
  const create = (url: string) => {
    setPendingHttpUrl(null);
    createMutation.mutate(url);
    form.setFieldValue("url", "");
  };
  const form = useForm({
    defaultValues: { url: "" },
    onSubmit: ({ value }) => {
      const url = value.url.trim();
      if (!url) {
        return;
      }
      // Adresse refusée par la règle commune (HTTP public, identifiants,
      // adresse invalide) : refus direct et traduit, sans proposer le HTTP
      // clair, que le Rust refuserait de toute façon (passe QA 0.8.1-1).
      try {
        validateProviderRequestUrl(url);
      } catch (error) {
        setPendingHttpUrl(null);
        toast.error(
          describeProviderCredentialError(error) ?? describeAddressRefusal(""),
        );
        return;
      }
      if (isCleartextRemoteUrl(url) && pendingHttpUrl !== url) {
        setPendingHttpUrl(url);
        return;
      }
      create(url);
    },
  });

  const createdWebhook = createMutation.data;
  const webhooks = webhooksQuery.data ?? [];

  return (
    <section data-setting-id="webhooks" className="flex flex-col gap-4">
      <h2 className="font-sans text-lg font-semibold">{t`Webhooks`}</h2>
      <div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field name="url">
            {(field) => (
              <Input
                className="h-8 max-w-md text-sm"
                placeholder="https://example.com/webhooks/syntheo"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            )}
          </form.Field>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={createMutation.isPending}
          >
            <Trans>Add webhook</Trans>
          </Button>
        </form>

        {pendingHttpUrl ? (
          <div className="mt-3 max-w-md">
            <CleartextConfirmation
              subject="webhook"
              host={hostOf(pendingHttpUrl)}
              onConfirm={() => create(pendingHttpUrl)}
            />
          </div>
        ) : null}

        {createdWebhook && (
          <div className="border-border bg-muted/30 mt-3 rounded-xl border p-3">
            <p className="text-muted-foreground text-xs">
              <Trans>
                Copy this signing secret now — it is only shown once.
              </Trans>
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="bg-muted scrollbar-hide overflow-x-auto rounded-md px-1.5 py-0.5 text-xs">
                {createdWebhook.secret}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0"
                onClick={async () => {
                  if (
                    await copyText(
                      createdWebhook.secret,
                      t`Signing secret copied`,
                    )
                  ) {
                    createMutation.reset();
                  }
                }}
              >
                <Copy className="size-3.5" />
                <Trans>Copy</Trans>
              </Button>
            </div>
          </div>
        )}

        {webhooks.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {webhooks.map((webhook) => (
              <WebhookRow
                key={webhook.id}
                webhook={webhook}
                onTest={() => testMutation.mutate(webhook.id)}
                onDelete={() => deleteMutation.mutate(webhook.id)}
                onToggleActive={() =>
                  setActiveMutation.mutate({
                    id: webhook.id,
                    active: !webhook.active,
                  })
                }
                isTesting={testMutation.isPending}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function WebhookRow({
  webhook,
  onTest,
  onDelete,
  onToggleActive,
  isTesting,
}: {
  webhook: WebhookInfo;
  onTest: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  isTesting: boolean;
}) {
  const statusParts = [
    !webhook.active ? t`Paused` : null,
    !webhook.active ? t`not receiving events` : null,
    webhook.events.length > 0 ? webhook.events.join(", ") : t`All events`,
    webhook.last_delivery_at
      ? t`Last delivery ${webhook.last_delivery_status}`
      : null,
  ].filter(Boolean);

  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <div className="flex min-w-0 flex-col">
        <span
          className={cn([
            "truncate",
            !webhook.active && "text-muted-foreground line-through",
          ])}
        >
          {webhook.url}
        </span>
        <span className="text-muted-foreground text-xs">
          {statusParts.join(" · ")}
        </span>
        {blockedByAddressRule(webhook.url) ? (
          <span className="text-destructive text-xs" data-webhook-blocked>
            {t`Blocked: use https://, or http:// only to this computer or a private network.`}
          </span>
        ) : isCleartextRemoteUrl(webhook.url) ? (
          <CleartextNotice subject="webhook" />
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={onToggleActive}
        >
          {webhook.active ? t`Pause` : t`Enable`}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7"
          disabled={isTesting}
          onClick={onTest}
        >
          {t`Test`}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive h-7"
          onClick={onDelete}
        >
          <Trash className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Endpoint enregistré avant la règle d'adresse (issue 703) : il ne reçoit
 * plus rien, la livraison est refusée côté Rust. */
// Refus d'adresse renvoyé par le Rust (`owhisper_client::BaseUrlError`), en
// anglais : traduit avec les messages de la règle commune.
function describeAddressRefusal(message: string): string {
  if (message.includes("unencrypted HTTP is only allowed")) {
    return describeProviderCredentialErrorCode("https_required");
  }
  if (message.includes("must not contain credentials")) {
    return describeProviderCredentialErrorCode("url_with_credentials");
  }
  if (!message || message.includes("invalid server address")) {
    return describeProviderCredentialErrorCode("invalid_url");
  }
  return message;
}

function blockedByAddressRule(url: string): boolean {
  try {
    // Les identifiants hérités sont masqués (`***@`) : la règle porte sur
    // le protocole et l'hôte.
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    validateProviderRequestUrl(parsed);
    return false;
  } catch {
    return true;
  }
}
