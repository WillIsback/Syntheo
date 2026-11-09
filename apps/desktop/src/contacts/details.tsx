import { Trans, useLingui } from "@lingui/react/macro";
import React, { useCallback, useState } from "react";

import { persistContactAvatar } from "./contact-avatar";
import { ContactPageHeader } from "./contact-page-header";
import { useContactSummary } from "./contact-summary";
import { EditableContactFields } from "./details-fields";
import {
  ContactAvatar,
  ContactAvatarSection,
  ContactSummarySection,
  DuplicateContactsBanner,
  ReadOnlyContactFields,
  findDuplicateContacts,
} from "./details-sections";
import {
  type HumanRecord,
  mergeHumans,
  type OrganizationRecord,
  toggleContactPin,
  useHumanSessions,
} from "./queries";
import { RelatedNotesSection } from "./related-notes";

import { useOwnerUserId } from "~/shared/owner-user";

export { ContactOrganizationSelector } from "./details-organization";

export function DetailsColumn({
  human,
  humans,
  organizations,
  handleSessionClick,
  onDelete,
}: Readonly<{
  human: HumanRecord | null;
  humans: HumanRecord[];
  organizations: OrganizationRecord[];
  handleSessionClick: (id: string) => void;
  onDelete: (id: string) => void;
}>) {
  return (
    <div className="flex h-full flex-1 flex-col">
      {human ? (
        <ContactDetailsView
          human={human}
          humans={humans}
          organizations={organizations}
          handleSessionClick={handleSessionClick}
          onDelete={onDelete}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground text-sm">
            <Trans>Select a person to view details</Trans>
          </p>
        </div>
      )}
    </div>
  );
}

function ContactDetailsView({
  human,
  humans,
  organizations,
  handleSessionClick,
  onDelete,
}: Readonly<{
  human: HumanRecord;
  humans: HumanRecord[];
  organizations: OrganizationRecord[];
  handleSessionClick: (id: string) => void;
  onDelete: (id: string) => void;
}>) {
  const ownerUserId = useOwnerUserId();
  const readOnly = human.id === ownerUserId;
  const user = humans.find((candidate) => candidate.id === ownerUserId) ?? null;
  const { t } = useLingui();
  const [showCompactIdentity, setShowCompactIdentity] = useState(false);
  const personSessions = useHumanSessions(human.id);
  const organizationName =
    organizations.find(
      (organization) => organization.id === human.organizationId,
    )?.name ?? null;
  const contactSummary = useContactSummary({
    human,
    user,
    organizationName,
    sessions: personSessions,
  });
  const duplicatesWithData = React.useMemo(
    () => findDuplicateContacts(human, humans, ownerUserId),
    [human, humans, ownerUserId],
  );

  const handleMergeContacts = useCallback(
    (duplicateId: string) => {
      void mergeHumans(human.id, duplicateId).catch((error) => {
        console.error("[contacts] failed to merge contacts", error);
      });
    },
    [human],
  );

  return (
    <>
      <ContactPageHeader
        readOnly={readOnly}
        title={human.name || human.email || t`Unnamed`}
        compactIdentity={<ContactAvatar human={human} size={24} />}
        showCompactIdentity={showCompactIdentity}
        pinned={Boolean(human.pinned)}
        onTogglePin={() => {
          void toggleContactPin("human", human.id).catch((error) => {
            console.error("[contacts] failed to toggle contact pin", error);
          });
        }}
        onDelete={() => onDelete(human.id)}
        onRemoveAvatar={
          human.avatarDataUrl
            ? () => persistContactAvatar("human", human.id, null)
            : undefined
        }
      />

      <div
        className="flex-1 overflow-y-auto"
        onScroll={(event) => {
          setShowCompactIdentity(event.currentTarget.scrollTop > 0);
        }}
      >
        <ContactAvatarSection human={human} readOnly={readOnly} />

        <DuplicateContactsBanner
          readOnly={readOnly}
          duplicates={duplicatesWithData}
          onMerge={handleMergeContacts}
        />

        {readOnly ? (
          <ReadOnlyContactFields
            human={human}
            organizationName={organizationName}
          />
        ) : (
          <EditableContactFields human={human} organizations={organizations} />
        )}

        {personSessions.length > 0 && (
          <ContactSummarySection summary={contactSummary} />
        )}

        <RelatedNotesSection
          sessions={personSessions}
          onSessionClick={handleSessionClick}
        />

        <div className="pb-96" />
      </div>
    </>
  );
}
