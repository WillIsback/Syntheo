import { Trans, useLingui } from "@lingui/react/macro";
import { useRef, useState } from "react";

import { X } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import { Input } from "@syntheo/ui/components/ui/input";
import { Textarea } from "@syntheo/ui/components/ui/textarea";

import { ContactOrganizationSelector } from "./details-organization";
import {
  type HumanRecord,
  type OrganizationRecord,
  updateHuman,
} from "./queries";

type PendingEmails = {
  humanId: string;
  base: string[];
  list: string[];
};

function resolveAdditionalEmails(
  human: HumanRecord,
  pending: PendingEmails | null,
): string[] {
  if (
    pending?.humanId === human.id &&
    pending.base === human.additionalEmails
  ) {
    return pending.list;
  }
  return human.additionalEmails;
}

function persistAdditionalEmails(
  human: HumanRecord,
  pendingEmailsRef: { current: PendingEmails | null },
  list: string[],
) {
  pendingEmailsRef.current = {
    humanId: human.id,
    base: human.additionalEmails,
    list,
  };
  void updateHuman(human.id, { additionalEmails: list }).catch((error) => {
    console.error("[contacts] failed to update contact", error);
    if (pendingEmailsRef.current?.list === list) {
      pendingEmailsRef.current = null;
    }
  });
}

export function EditableContactFields({
  human,
  organizations,
}: Readonly<{ human: HumanRecord; organizations: OrganizationRecord[] }>) {
  const [addingEmail, setAddingEmail] = useState(false);
  const pendingEmailsRef = useRef<PendingEmails | null>(null);
  const currentAdditionalEmails = () =>
    resolveAdditionalEmails(human, pendingEmailsRef.current);

  return (
    <div>
      <div className="border-border flex items-center border-b px-4 py-3">
        <div className="text-muted-foreground w-28 text-sm">
          <Trans>Name</Trans>
        </div>
        <div className="flex-1">
          <EditablePersonNameField
            key={`${human.id}:name`}
            personId={human.id}
            value={human.name}
          />
        </div>
      </div>
      <EditablePersonJobTitleField
        key={`${human.id}:job-title`}
        personId={human.id}
        value={human.jobTitle}
      />

      <div className="border-border flex items-center border-b px-4 py-3">
        <div className="text-muted-foreground w-28 text-sm">
          <Trans>Company</Trans>
        </div>
        <div className="flex-1">
          <ContactOrganizationSelector
            onChange={(organizationId) =>
              persistHumanUpdate(human.id, {
                organizationId: organizationId ?? "",
              })
            }
            organization={
              organizations.find(
                (organization) => organization.id === human.organizationId,
              ) ?? null
            }
            organizations={organizations}
          />
        </div>
      </div>

      <EditablePersonEmailField
        key={`${human.id}:email`}
        personId={human.id}
        value={human.email}
      />
      {human.additionalEmails.map((email) => (
        <EditableAdditionalEmailRow
          key={`${human.id}:${email}`}
          value={email}
          onCommit={(next, previous) => {
            const trimmed = next.trim();
            if (trimmed === previous) return;
            const current = currentAdditionalEmails();
            persistAdditionalEmails(
              human,
              pendingEmailsRef,
              trimmed
                ? current.map((entry) => (entry === previous ? trimmed : entry))
                : current.filter((entry) => entry !== previous),
            );
          }}
          onRemove={(current) => {
            persistAdditionalEmails(
              human,
              pendingEmailsRef,
              currentAdditionalEmails().filter((entry) => entry !== current),
            );
          }}
        />
      ))}
      {addingEmail ? (
        <EditableAdditionalEmailRow
          key={`${human.id}:new-email`}
          value=""
          autoFocus
          onCommit={(next) => {
            setAddingEmail(false);
            const trimmed = next.trim();
            if (trimmed) {
              persistAdditionalEmails(human, pendingEmailsRef, [
                ...currentAdditionalEmails(),
                trimmed,
              ]);
            }
          }}
        />
      ) : (
        <div className="border-border flex items-center border-b px-4 py-3">
          <div className="w-28" />
          <div className="flex-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground -ml-2 h-7 px-2"
              onClick={() => setAddingEmail(true)}
            >
              <Trans>Add email</Trans>
            </Button>
          </div>
        </div>
      )}
      <EditablePersonPhoneField
        key={`${human.id}:phone`}
        personId={human.id}
        value={human.phone}
      />
      <EditablePersonLinkedInField
        key={`${human.id}:linkedin`}
        personId={human.id}
        value={human.linkedinUsername}
      />
      <EditablePersonMemoField
        key={`${human.id}:memo`}
        personId={human.id}
        value={human.memo}
      />
    </div>
  );
}

function EditablePersonNameField({
  personId,
  value,
}: Readonly<{ personId: string; value: string }>) {
  const { t } = useLingui();

  return (
    <Input
      defaultValue={value}
      onChange={(event) =>
        persistHumanUpdate(personId, { name: event.target.value })
      }
      placeholder={t`Name`}
      className="h-7 border-none p-0 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
    />
  );
}

function EditablePersonJobTitleField({
  personId,
  value,
}: Readonly<{ personId: string; value: string }>) {
  const { t } = useLingui();

  return (
    <div className="border-border flex items-center border-b px-4 py-3">
      <div className="text-muted-foreground w-28 text-sm">
        <Trans>Job Title</Trans>
      </div>
      <div className="flex-1">
        <Input
          defaultValue={value}
          onChange={(event) =>
            persistHumanUpdate(personId, { jobTitle: event.target.value })
          }
          placeholder={t`Software Engineer`}
          className="h-7 border-none p-0 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
    </div>
  );
}

function EditablePersonEmailField({
  personId,
  value,
}: Readonly<{ personId: string; value: string }>) {
  return (
    <div className="border-border flex items-center border-b px-4 py-3">
      <div className="text-muted-foreground w-28 text-sm">
        <Trans>Email</Trans>
      </div>
      <div className="flex-1">
        <Input
          type="email"
          defaultValue={value}
          onChange={(event) =>
            persistHumanUpdate(personId, { email: event.target.value })
          }
          placeholder="john@example.com"
          className="h-7 border-none p-0 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
    </div>
  );
}

function EditableAdditionalEmailRow({
  value,
  autoFocus = false,
  onCommit,
  onRemove,
}: Readonly<{
  value: string;
  autoFocus?: boolean;
  onCommit: (value: string, previous: string) => void;
  onRemove?: (current: string) => void;
}>) {
  const { t } = useLingui();
  const lastCommittedRef = useRef(value);

  return (
    <div className="border-border flex items-center border-b px-4 py-3">
      <div className="w-28" />
      <div className="flex flex-1 items-center gap-1">
        <Input
          type="email"
          defaultValue={value}
          autoFocus={autoFocus}
          onBlur={(event) => {
            onCommit(event.target.value, lastCommittedRef.current);
            lastCommittedRef.current = event.target.value.trim();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          placeholder="jane@example.com"
          className="h-7 border-none p-0 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-6 shrink-0"
            aria-label={t`Remove email`}
            onClick={() => onRemove(lastCommittedRef.current)}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function EditablePersonPhoneField({
  personId,
  value,
}: Readonly<{ personId: string; value: string }>) {
  return (
    <div className="border-border flex items-center border-b px-4 py-3">
      <div className="text-muted-foreground w-28 text-sm">
        <Trans>Phone</Trans>
      </div>
      <div className="flex-1">
        <Input
          type="tel"
          defaultValue={value}
          onChange={(event) =>
            persistHumanUpdate(personId, { phone: event.target.value })
          }
          placeholder="+1 (555) 123-4567"
          className="h-7 border-none p-0 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
    </div>
  );
}

function EditablePersonLinkedInField({
  personId,
  value,
}: Readonly<{ personId: string; value: string }>) {
  return (
    <div className="border-border flex items-center border-b px-4 py-3">
      <div className="text-muted-foreground w-28 text-sm">
        <Trans>LinkedIn</Trans>
      </div>
      <div className="flex-1">
        <Input
          defaultValue={value}
          onChange={(event) =>
            persistHumanUpdate(personId, {
              linkedinUsername: event.target.value,
            })
          }
          placeholder="https://www.linkedin.com/in/johntopia/"
          className="h-7 border-none p-0 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
    </div>
  );
}

function EditablePersonMemoField({
  personId,
  value,
}: Readonly<{ personId: string; value: string }>) {
  const { t } = useLingui();

  return (
    <div className="border-border flex border-b px-4 py-3">
      <div className="text-muted-foreground w-28 pt-2 text-sm">
        <Trans>Notes</Trans>
      </div>
      <div className="flex-1">
        <Textarea
          defaultValue={value}
          onChange={(event) =>
            persistHumanUpdate(personId, { memo: event.target.value })
          }
          placeholder={t`Add notes about this contact...`}
          className="min-h-[80px] resize-none border-none px-0 py-2 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          rows={3}
        />
      </div>
    </div>
  );
}

function persistHumanUpdate(
  personId: string,
  changes: Parameters<typeof updateHuman>[1],
): void {
  void updateHuman(personId, changes).catch((error) => {
    console.error("[contacts] failed to update contact", error);
  });
}
