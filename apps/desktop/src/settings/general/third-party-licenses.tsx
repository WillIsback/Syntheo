import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";

import { Button } from "@syntheo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@syntheo/ui/components/ui/dialog";

import type {
  ThirdPartyComponent,
  ThirdPartyLicenses,
} from "../../../../../scripts/third-party-licenses.mjs";

// Page des licences (issue 747), Paramètres › Profil › À propos. Les données
// sont générées au build (Cargo.lock, pnpm-lock.yaml, modèles) et chargées
// seulement à l'ouverture : aucune requête réseau.

type Kind = ThirdPartyComponent["kind"];
const KINDS: Kind[] = ["native", "model", "crate", "npm"];

async function loadLicenses(): Promise<ThirdPartyLicenses> {
  const data = (await import("virtual:third-party-licenses")).default;
  if ("error" in data) throw new Error(data.error);
  return data;
}

export function AboutSection() {
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-labelledby="settings-about-title"
      className="flex flex-col gap-3"
    >
      <h2 id="settings-about-title" className="font-sans text-lg font-semibold">
        <Trans>About</Trans>
      </h2>
      <p className="text-muted-foreground text-sm">
        <Trans>
          Syntheo is released under the MIT license. It is derived from Anarlog,
          by Fastrepl, Inc., also under the MIT license.
        </Trans>
      </p>
      <div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Trans>Licenses</Trans>
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? <LicensesDialogContent /> : null}
      </Dialog>
    </section>
  );
}

function LicensesDialogContent() {
  const { t } = useLingui();
  const licenses = useQuery({
    queryKey: ["third-party-licenses"],
    queryFn: loadLicenses,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLowerCase());
  const groups: Record<Kind, string> = {
    native: t`Native components`,
    model: t`Models`,
    crate: t`Rust crates`,
    npm: t`npm packages`,
  };

  return (
    <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-4 overflow-hidden">
      <DialogHeader>
        <DialogTitle>
          <Trans>Licenses</Trans>
        </DialogTitle>
        <DialogDescription>
          <Trans>
            Third-party components included in Syntheo, with their version and
            license. The transcription models are not shipped with the app: they
            are downloaded or installed separately.
          </Trans>
        </DialogDescription>
      </DialogHeader>
      {licenses.isPending ? (
        <p className="text-muted-foreground text-sm" role="status">
          <Trans>Loading…</Trans>
        </p>
      ) : licenses.isError ? (
        <p className="text-alert-foreground text-sm" role="alert">
          <Trans>The list of licenses could not be read.</Trans>
        </p>
      ) : (
        <>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t`Search a component or a license`}
            aria-label={t`Search a component or a license`}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          />
          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-1">
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">
                <Trans>Syntheo license (MIT) and origin of the code</Trans>
              </summary>
              <p className="text-muted-foreground mt-2">
                {/* Nom du projet d'origine écrit en toutes lettres : le
                    français élide « de » devant une voyelle (issue 777). */}
                <Trans>
                  Syntheo is derived from Anarlog (
                  {licenses.data.syntheo.origin.url}), by{" "}
                  {licenses.data.syntheo.origin.holder}, under the{" "}
                  {licenses.data.syntheo.origin.license} license.
                </Trans>
              </p>
              <LicenseText text={licenses.data.syntheo.text} />
            </details>
            {KINDS.map((kind) => {
              const items = licenses.data.components.filter(
                (component) =>
                  component.kind === kind &&
                  (!query ||
                    component.name.toLowerCase().includes(query) ||
                    component.license.toLowerCase().includes(query)),
              );
              if (items.length === 0) return null;
              return (
                <section key={kind} className="flex flex-col gap-1.5">
                  <h3 className="text-sm font-semibold">
                    {groups[kind]} ({items.length})
                  </h3>
                  <ul className="flex flex-col">
                    {items.map((component) => (
                      <ComponentRow
                        key={`${component.name}@${component.version}`}
                        component={component}
                        texts={licenses.data.texts}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </DialogContent>
  );
}

function ComponentRow({
  component,
  texts,
}: {
  component: ThirdPartyComponent;
  texts: string[];
}) {
  // Le texte ne se rend qu'à l'ouverture : plus de deux mille composants.
  const [open, setOpen] = useState(false);
  return (
    <li className="border-border border-b py-1.5 text-[13px] last:border-b-0">
      <details onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{component.name}</span>
          <span className="text-muted-foreground">{component.version}</span>
          <span className="text-muted-foreground ml-auto">
            {component.license}
          </span>
        </summary>
        {open ? (
          <div className="mt-2 flex flex-col gap-2">
            {component.url ? (
              <p className="text-muted-foreground break-all">{component.url}</p>
            ) : null}
            {component.texts.length > 0 ? (
              component.texts.map((index) => (
                <LicenseText key={index} text={texts[index] ?? ""} />
              ))
            ) : (
              <p className="text-muted-foreground">
                <Trans>
                  This package ships no license file; its declared license is
                  shown above.
                </Trans>
              </p>
            )}
          </div>
        ) : null}
      </details>
    </li>
  );
}

function LicenseText({ text }: { text: string }) {
  return (
    <pre className="bg-muted mt-2 max-h-72 overflow-auto rounded-md p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap">
      {text}
    </pre>
  );
}
