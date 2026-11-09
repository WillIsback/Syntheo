import { Trans, useLingui } from "@lingui/react/macro";

import { CircleNotch } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import { cn } from "@syntheo/utils";

import {
  AvatarUploadButton,
  ContactImage,
  persistContactAvatar,
} from "./contact-avatar";
import { useContactSummary } from "./contact-summary";
import { type HumanRecord } from "./queries";
import { ContactFacehash } from "./shared";

export function ContactAvatar({
  human,
  size,
}: Readonly<{ human: HumanRecord; size: number }>) {
  const name = String(human.name || human.email || human.id || "");
  return human.avatarDataUrl ? (
    <ContactImage src={human.avatarDataUrl} size={size} />
  ) : (
    <ContactFacehash name={name} size={size} />
  );
}

export function ContactAvatarSection({
  human,
  readOnly,
}: Readonly<{ human: HumanRecord; readOnly: boolean }>) {
  const { t } = useLingui();

  return (
    <div className="border-border flex items-center justify-center border-b py-6">
      {readOnly ? (
        <ContactAvatar human={human} size={64} />
      ) : (
        <AvatarUploadButton
          label={t`Change photo`}
          onUpload={(dataUrl) =>
            persistContactAvatar("human", human.id, dataUrl)
          }
        >
          <ContactAvatar human={human} size={64} />
        </AvatarUploadButton>
      )}
    </div>
  );
}

export function DuplicateContactsBanner({
  readOnly,
  duplicates,
  onMerge,
}: Readonly<{
  readOnly: boolean;
  duplicates: HumanRecord[];
  onMerge: (duplicateId: string) => void;
}>) {
  const { t } = useLingui();
  if (readOnly || duplicates.length === 0) return null;
  const count = duplicates.length;
  const plural = count > 1;

  return (
    <div className="border-border bg-alert border-b px-6 py-4">
      <h4 className="text-alert-foreground mb-1 text-sm font-semibold">
        {plural ? t`Duplicate contacts found` : t`Duplicate contact found`}
      </h4>
      <p className="text-alert-foreground mb-3 text-sm">
        {plural
          ? t`${count} contacts share the same name or email. Merge them to consolidate all related notes and information.`
          : t`Another contact shares the same name or email. Merge them to consolidate all related notes and information.`}
      </p>
      <div className="flex flex-col gap-2">
        {duplicates.map((dup) => (
          <div
            key={dup.id}
            className="border-border bg-muted flex items-center justify-between rounded-md border p-2"
          >
            <div className="flex items-center gap-2">
              <ContactAvatar human={dup} size={32} />
              <div>
                <div className="text-foreground text-sm font-medium">
                  {dup.name || t`Unnamed contact`}
                </div>
                <div className="text-muted-foreground text-xs">{dup.email}</div>
              </div>
            </div>
            <Button onClick={() => onMerge(dup.id)} size="sm" variant="default">
              <Trans>Merge</Trans>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReadOnlyContactFields({
  human,
  organizationName,
}: Readonly<{ human: HumanRecord; organizationName: string | null }>) {
  const { t } = useLingui();

  return (
    <div>
      {[
        [t`Name`, human.name],
        [t`Job Title`, human.jobTitle],
        [t`Company`, organizationName],
        [
          t`Email`,
          [human.email, ...human.additionalEmails]
            .filter((email) => email.trim() !== "")
            .join("\n"),
        ],
        [t`Phone`, human.phone],
        [t`LinkedIn`, human.linkedinUsername],
        [t`Notes`, human.memo],
      ].map(([label, value]) => (
        <div
          key={label}
          className="border-border flex items-center border-b px-4 py-3"
        >
          <div className="text-muted-foreground w-28 text-sm">{label}</div>
          <div className="min-w-0 flex-1 text-base break-words whitespace-pre-wrap">
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ContactSummarySection({
  summary,
}: Readonly<{ summary: ReturnType<typeof useContactSummary> }>) {
  const hasFacts = summary.facts.length > 0;

  return (
    <div className="border-border border-b p-6">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-muted-foreground text-sm font-medium">
          <Trans>Summary</Trans>
        </h3>
        {summary.isGenerating && (
          <>
            <CircleNotch
              aria-hidden="true"
              className="text-muted-foreground h-3.5 w-3.5 animate-spin"
            />
            <span className="sr-only">
              <Trans>Loading...</Trans>
            </span>
          </>
        )}
      </div>

      <div className="border-border bg-muted rounded-lg border p-4">
        <SummaryBody summary={summary} />

        {hasFacts && summary.error && (
          <div className="border-border mt-3 flex items-center justify-between gap-3 border-t pt-3">
            <p className="text-muted-foreground text-xs">
              <Trans>Summary generation failed</Trans>
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void summary.retry()}
            >
              <Trans>Try again</Trans>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryBody({
  summary,
}: Readonly<{ summary: ReturnType<typeof useContactSummary> }>) {
  if (summary.facts.length > 0) {
    return (
      <ul className="text-foreground list-disc space-y-2 pl-5 text-sm leading-relaxed">
        {summary.facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    );
  }
  if (summary.isGenerating) {
    return (
      <div aria-hidden="true" className="space-y-2.5 py-1">
        {["w-4/5", "w-2/3", "w-3/5"].map((width, index) => (
          <div key={width} className="flex items-center gap-2.5">
            <div
              className="bg-muted-foreground/20 size-1 shrink-0 animate-pulse rounded-full"
              style={{ animationDelay: `${index * 150}ms` }}
            />
            <div
              className={cn([
                "bg-muted-foreground/10 h-3 animate-pulse rounded-full",
                width,
              ])}
              style={{ animationDelay: `${index * 150}ms` }}
            />
          </div>
        ))}
      </div>
    );
  }
  if (summary.error) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          <Trans>Summary generation failed</Trans>
        </p>
        <Button size="sm" variant="ghost" onClick={() => void summary.retry()}>
          <Trans>Try again</Trans>
        </Button>
      </div>
    );
  }
  return (
    <p className="text-muted-foreground text-sm leading-relaxed">
      <Trans>
        AI-generated summary of all interactions and notes with this contact
        will appear here. This will synthesize key discussion points, action
        items, and relationship context across all meetings and notes.
      </Trans>
    </p>
  );
}

function contactEmails(contact: HumanRecord): Set<string> {
  return new Set(
    [contact.email, ...contact.additionalEmails]
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email !== ""),
  );
}

export function findDuplicateContacts(
  human: HumanRecord,
  humans: HumanRecord[],
  ownerUserId: string | null,
): HumanRecord[] {
  const humanEmails = contactEmails(human);
  const humanName = human.name.trim().toLowerCase();
  return humans.filter((candidate) => {
    if (candidate.id === human.id || candidate.id === ownerUserId) {
      return false;
    }
    const candidateEmails = contactEmails(candidate);
    if ([...candidateEmails].some((email) => humanEmails.has(email))) {
      return true;
    }
    const candidateName = candidate.name.trim().toLowerCase();
    return humanName !== "" && candidateName === humanName;
  });
}
