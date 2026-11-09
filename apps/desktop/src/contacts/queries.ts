import { commands as contactsCommands } from "@syntheo/plugin-contacts";

import {
  type ContactSummaryRecord,
  type HumanRecord,
  type OrganizationRecord,
} from "./queries-rows";

import { enqueueDatabaseWrite } from "~/db/write-queue";
import { DEFAULT_USER_ID, id } from "~/shared/utils";

export {
  type ContactSummaryRecord,
  type HumanRecord,
  type HumanDisplayRecord,
  type OrganizationRecord,
  type OrganizationDisplayRecord,
  type HumanSessionRecord,
  type ContactSearchRecord,
} from "./queries-rows";
export {
  useHumans,
  useOrganizations,
  useHumanDisplayRecordsByIds,
  useOrganizationDisplayRecordsByIds,
  loadHuman,
  loadHumansByIds,
  loadOrganization,
  useHumanSessions,
  searchContacts,
  usePersonalContact,
} from "./queries-read";

export function createHuman({
  ownerUserId = DEFAULT_USER_ID,
  name,
  email = "",
  entryPoint: _entryPoint = "contacts",
}: {
  ownerUserId?: string;
  name: string;
  email?: string;
  entryPoint?: "contacts" | "session_participants" | "speaker_assignment";
}): Promise<string> {
  const humanId = id();

  return enqueueDatabaseWrite(`human:${humanId}`, async () => {
    const result = await contactsCommands.createHuman({
      id: humanId,
      owner_user_id: ownerUserId,
      name,
      email,
    });
    if (result.status === "error") {
      throw new Error(result.error);
    }
    return humanId;
  });
}

export function createOrganization({
  ownerUserId = DEFAULT_USER_ID,
  name,
}: {
  ownerUserId?: string;
  name: string;
}): Promise<string> {
  const organizationId = id();

  return enqueueDatabaseWrite(`organization:${organizationId}`, async () => {
    const result = await contactsCommands.createOrganization({
      id: organizationId,
      owner_user_id: ownerUserId,
      name,
    });
    if (result.status === "error") {
      throw new Error(result.error);
    }
    return organizationId;
  });
}

export function savePersonalContact(
  humanId: string,
  values: Pick<
    HumanRecord,
    | "name"
    | "email"
    | "phone"
    | "jobTitle"
    | "linkedinUsername"
    | "memo"
    | "organizationId"
  > & { avatarDataUrl?: string | null },
): Promise<void> {
  return enqueueDatabaseWrite(`human:${humanId}`, async () => {
    const result = await contactsCommands.savePersonalContact({
      human_id: humanId,
      name: values.name,
      email: values.email,
      phone: values.phone,
      job_title: values.jobTitle,
      linkedin_username: values.linkedinUsername,
      memo: values.memo,
      organization_id: values.organizationId,
      avatar_data_url:
        typeof values.avatarDataUrl === "string" ? values.avatarDataUrl : null,
      remove_avatar: values.avatarDataUrl === null,
    });
    if (result.status === "error") {
      throw new Error(result.error);
    }
  });
}

export function updateHuman(
  humanId: string,
  changes: Partial<
    Pick<
      HumanRecord,
      | "name"
      | "email"
      | "phone"
      | "jobTitle"
      | "linkedinUsername"
      | "memo"
      | "organizationId"
      | "additionalEmails"
    >
  >,
): Promise<void> {
  if (Object.keys(changes).length === 0) return Promise.resolve();

  return enqueueDatabaseWrite(`human:${humanId}`, async () => {
    const result = await contactsCommands.updateHuman({
      human_id: humanId,
      name: changes.name ?? null,
      email: changes.email ?? null,
      phone: changes.phone ?? null,
      job_title: changes.jobTitle ?? null,
      linkedin_username: changes.linkedinUsername ?? null,
      memo: changes.memo ?? null,
      organization_id: changes.organizationId ?? null,
      additional_emails: changes.additionalEmails ?? null,
    });
    if (result.status === "error") {
      throw new Error(result.error);
    }
  });
}

export function updateOrganization(
  organizationId: string,
  changes: Partial<Pick<OrganizationRecord, "name" | "memo">>,
): Promise<void> {
  if (changes.name === undefined && changes.memo === undefined) {
    return Promise.resolve();
  }

  return enqueueDatabaseWrite(`organization:${organizationId}`, async () => {
    const result = await contactsCommands.updateOrganization({
      organization_id: organizationId,
      name: changes.name ?? null,
      memo: changes.memo ?? null,
    });
    if (result.status === "error") {
      throw new Error(result.error);
    }
  });
}

export function deleteHuman(humanId: string): Promise<void> {
  return softDeleteContact("human", humanId);
}

export function deleteOrganization(organizationId: string): Promise<void> {
  return softDeleteContact("organization", organizationId);
}

export function updateContactAvatar(
  type: "human" | "organization",
  contactId: string,
  avatarDataUrl: string | null,
): Promise<void> {
  const table = type === "human" ? "humans" : "organizations";
  return enqueueDatabaseWrite(`${table}:${contactId}`, async () => {
    const result = await contactsCommands.updateContactAvatar({
      kind: type,
      contact_id: contactId,
      avatar_data_url: avatarDataUrl,
    });
    if (result.status === "error") {
      throw new Error(result.error);
    }
  });
}

export function updateHumanContactSummary(
  humanId: string,
  summary: ContactSummaryRecord,
): Promise<void> {
  return enqueueDatabaseWrite(`human:${humanId}`, async () => {
    const result = await contactsCommands.updateHumanContactSummary({
      human_id: humanId,
      summary_json: JSON.stringify(summary),
    });
    if (result.status === "error") {
      throw new Error(result.error);
    }
  });
}

export function toggleContactPin(
  type: "human" | "organization",
  contactId: string,
): Promise<void> {
  return enqueueDatabaseWrite("contacts:pin-order", async () => {
    const result = await contactsCommands.toggleContactPin({
      kind: type,
      contact_id: contactId,
    });
    if (result.status === "error") {
      throw new Error(result.error);
    }
  });
}

export function reorderPinnedContacts(
  contacts: Array<{ type: "human" | "organization"; id: string }>,
): Promise<void> {
  return enqueueDatabaseWrite("contacts:pin-order", async () => {
    const result = await contactsCommands.reorderPinnedContacts({
      contacts: contacts.map(({ type, id }) => ({ kind: type, id })),
    });
    if (result.status === "error") {
      throw new Error(result.error);
    }
  });
}

export function mergeHumans(
  selectedHumanId: string,
  duplicateHumanId: string,
): Promise<void> {
  return enqueueDatabaseWrite("contacts:merge", async () => {
    const result = await contactsCommands.mergeHumans({
      selected_human_id: selectedHumanId,
      duplicate_human_id: duplicateHumanId,
    });
    if (result.status === "error") {
      throw new Error(result.error);
    }
  });
}

function softDeleteContact(
  type: "human" | "organization",
  contactId: string,
): Promise<void> {
  const table = type === "human" ? "humans" : "organizations";
  return enqueueDatabaseWrite(`${table}:${contactId}`, async () => {
    const result = await contactsCommands.softDeleteContact({
      kind: type,
      contact_id: contactId,
    });
    if (result.status === "error") {
      throw new Error(result.error);
    }
  });
}
